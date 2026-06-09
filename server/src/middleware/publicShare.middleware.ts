import type { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { HttpError } from '../utils/HttpError';
import { shareLinksService } from '../modules/workspaces/shareLinks.service';
import { PageModel } from '../modules/pages/pages.model';

/**
 * Public-share request context.
 *
 * Populated by `publicShareGuard` after a successful token (and optional
 * password) check. Downstream handlers should treat this as a read-only
 * anonymous principal — there is no `req.userId`, no workspace role, and no
 * access to write endpoints.
 */
export interface PublicShareRequest extends Request {
  shareLinkId?: Types.ObjectId;
  sharedPageId?: string;
  shareWorkspaceId?: string;
  shareIncludeSubpages?: boolean;
  /** All page ids the visitor may read (root + descendants if includeSubpages). */
  shareVisiblePageIds?: Set<string>;
}

/**
 * Walks the page tree to compute the visible-page set for the given share
 * link. We do this *once per request* and stash it on `req` so route
 * handlers (the page tree endpoint and the blocks endpoint) can reuse it.
 *
 * Bounded by the subtree of the shared root, so cost is O(descendants), not
 * O(workspace pages).
 */
async function collectVisibleIds(
  workspaceId: string,
  rootId: string,
  includeSubpages: boolean,
): Promise<Set<string>> {
  if (!includeSubpages) return new Set([rootId]);
  // BFS by parentId within the workspace. Each level is one indexed query.
  const visible = new Set<string>([rootId]);
  let frontier: string[] = [rootId];
  // Hard cap on depth to defend against accidentally-cyclic data.
  for (let depth = 0; depth < 64 && frontier.length; depth++) {
    const children = await PageModel.find({
      workspaceId,
      parentId: { $in: frontier },
      archivedAt: null,
    })
      .select('_id')
      .lean();
    if (!children.length) break;
    const nextFrontier: string[] = [];
    for (const c of children) {
      const id = String(c._id);
      if (visible.has(id)) continue;
      visible.add(id);
      nextFrontier.push(id);
    }
    frontier = nextFrontier;
  }
  return visible;
}

/**
 * Resolves `req.params.token` to a live share link and attaches read-only
 * context to the request.
 *
 * Password handling: if the link has a password, the visitor must POST it
 * once to `/unlock` to get a short-lived session cookie. For now, we accept
 * the password inline via the `x-share-password` header on every request —
 * stateless and simple. (A future iteration can swap this for a signed
 * cookie issued by `/unlock`.)
 *
 * The same 404 is returned for: unknown token, expired token, revoked
 * token, missing-required-password, and bad-password. The only differentiated
 * response is 401 with `code: 'PasswordRequired'` when the visitor hasn't
 * supplied one yet — clients use this to render the password prompt UI.
 */
export function publicShareGuard() {
  return async (req: PublicShareRequest, _res: Response, next: NextFunction) => {
    try {
      const raw = String(req.params.token ?? '');
      const link = await shareLinksService.resolveByToken(raw);

      if (link.passwordHash) {
        const supplied = req.header('x-share-password');
        if (!supplied) throw new HttpError(401, 'PasswordRequired');
        const ok = await shareLinksService.verifyPassword(link, supplied);
        if (!ok) throw new HttpError(401, 'PasswordRequired');
      }

      const workspaceId = String(link.workspaceId);
      const pageId = String(link.pageId);

      // The link may outlive the page (archive / hard-delete races). Treat
      // a missing or trashed page as 404 to avoid leaking that detail.
      const page = await PageModel.findOne({
        _id: pageId,
        workspaceId,
        archivedAt: null,
      })
        .select('_id')
        .lean();
      if (!page) throw new HttpError(404, 'NotFound');

      req.shareLinkId = link._id;
      req.sharedPageId = pageId;
      req.shareWorkspaceId = workspaceId;
      req.shareIncludeSubpages = link.includeSubpages;
      req.shareVisiblePageIds = await collectVisibleIds(
        workspaceId,
        pageId,
        link.includeSubpages,
      );

      shareLinksService.touch(link._id);
      next();
    } catch (err) {
      next(err);
    }
  };
}
