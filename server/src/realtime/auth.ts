import type { onAuthenticatePayload } from '@hocuspocus/server';
import { Types } from 'mongoose';
import { tokenService } from '../modules/auth/token.service';
import { UserModel } from '../modules/auth/auth.model';
import { PageModel } from '../modules/pages/pages.model';
import { MembershipModel } from '../modules/workspaces/workspaces.model';
import {
  pagePermissionsService,
  PermissionCache,
} from '../modules/workspaces/pagePermissions.service';
import { levelAtLeast, type PageLevel } from '../modules/workspaces/pagePermissions';
import type { WorkspaceRole } from '../modules/workspaces/workspaces.model';

/**
 * Principal attached to a realtime connection.
 *
 * `level` is captured at handshake time and frozen for the connection. We
 * intentionally do NOT re-check on every message: the access token has its
 * own short TTL (15m by default) and a permission change while a tab is
 * open will take effect on the next reconnect. That matches the REST API's
 * statelessness and avoids a per-message DB roundtrip.
 *
 * For sensitive ops (e.g. permanent delete) we'd cycle the connection from
 * the API side, not from inside this server.
 */
export interface RealtimePrincipal {
  userId: string;
  workspaceId: string;
  pageId: string;
  workspaceRole: WorkspaceRole;
  level: PageLevel;
  /** Display info for awareness/presence (set by 8.2). */
  display: { name: string; email: string; avatarUrl: string | null };
}

/**
 * Hocuspocus handshake handler.
 *
 * Throwing here closes the socket with code 4001 before any Yjs traffic
 * flows. We surface a generic reason string — there's no point distinguishing
 * "bad token" from "no access" to a WebSocket client.
 */
export async function authenticate(
  data: onAuthenticatePayload,
): Promise<{ user: RealtimePrincipal }> {
  const token = data.token;
  if (!token) {
    console.warn('[realtime/auth] reject: missing token', {
      documentName: data.documentName,
    });
    throw new Error('Unauthorized');
  }

  // 1) JWT
  let payload: ReturnType<typeof tokenService.verifyAccess>;
  try {
    payload = tokenService.verifyAccess(token);
  } catch (err) {
    console.warn('[realtime/auth] reject: JWT verify failed', {
      documentName: data.documentName,
      err: err instanceof Error ? err.message : String(err),
    });
    throw new Error('Unauthorized');
  }
  const userId = payload.sub;

  // 2) Page → workspace
  const pageId = data.documentName;
  if (!pageId || !Types.ObjectId.isValid(pageId)) {
    console.warn('[realtime/auth] reject: invalid pageId', { pageId });
    throw new Error('NotFound');
  }
  const page = await PageModel.findById(pageId).select('workspaceId archivedAt').lean();
  if (!page || page.archivedAt) {
    console.warn('[realtime/auth] reject: page missing/archived', {
      pageId,
      hasPage: !!page,
      archived: !!page?.archivedAt,
    });
    throw new Error('NotFound');
  }
  const workspaceId = String(page.workspaceId);

  // 3) Workspace membership (also doubles as a tokenVersion freshness check
  //    — the user must still exist).
  const [user, membership] = await Promise.all([
    UserModel.findById(userId).select('name email avatarUrl tokenVersion').lean(),
    MembershipModel.findOne({ userId, workspaceId }).select('role').lean(),
  ]);
  if (!user) {
    console.warn('[realtime/auth] reject: user not found', { userId });
    throw new Error('Unauthorized');
  }
  if ((user.tokenVersion ?? 0) !== payload.tv) {
    console.warn('[realtime/auth] reject: tokenVersion mismatch', {
      userId,
      userTv: user.tokenVersion,
      payloadTv: payload.tv,
    });
    throw new Error('Unauthorized');
  }
  if (!membership) {
    console.warn('[realtime/auth] reject: not a workspace member', {
      userId,
      workspaceId,
      pageId,
    });
    throw new Error('Forbidden');
  }

  const role = membership.role as WorkspaceRole;

  // 4) Resolve page-level permission (closest-ancestor grant + role baseline).
  const cache = new PermissionCache();
  const level = await pagePermissionsService.resolve(workspaceId, userId, pageId, role, cache);
  if (!levelAtLeast(level, 'view')) {
    console.warn('[realtime/auth] reject: insufficient page level', {
      userId,
      workspaceId,
      pageId,
      role,
      level,
    });
    throw new Error('Forbidden');
  }

  // 5) Tell Hocuspocus whether this connection may write. The `readOnly`
  //    flag short-circuits update messages at the protocol layer.
  data.connection.readOnly = !levelAtLeast(level, 'edit');
  console.log('[realtime/auth] accept', {
    userId,
    workspaceId,
    pageId,
    role,
    level,
    readOnly: data.connection.readOnly,
  });

  const principal: RealtimePrincipal = {
    userId,
    workspaceId,
    pageId,
    workspaceRole: role,
    level,
    display: {
      name: user.name || user.email,
      email: user.email,
      avatarUrl: user.avatarUrl ?? null,
    },
  };
  return { user: principal };
}
