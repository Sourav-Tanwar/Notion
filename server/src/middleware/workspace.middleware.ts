import type { Response, NextFunction } from 'express';
import { MembershipModel, type WorkspaceRole } from '../modules/workspaces/workspaces.model';
import { HttpError } from '../utils/HttpError';
import type { AuthedRequest } from './auth.middleware';
import type { Capability } from '../modules/workspaces/permissions';
import { can } from '../modules/workspaces/permissions';

export interface WorkspaceScopedRequest extends AuthedRequest {
  workspaceId?: string;
  workspaceRole?: WorkspaceRole;
}

/**
 * Resolves the active workspace for the request and attaches both the id and
 * the caller's role to `req`. Resolution order:
 *   1. Explicit `:workspaceId` route param.
 *   2. `x-workspace-id` header (used by the SPA after the user switches).
 *
 * The membership lookup is a single indexed read (`{userId, workspaceId}`
 * unique index) and we cache nothing here — the hot path stays simple and
 * any membership mutation is immediately visible to subsequent requests.
 */
export function workspaceGuard(
  req: WorkspaceScopedRequest,
  _res: Response,
  next: NextFunction,
): void {
  const fromParam = req.params?.workspaceId;
  const fromHeader = req.headers['x-workspace-id'];
  const workspaceId =
    (typeof fromParam === 'string' && fromParam) ||
    (typeof fromHeader === 'string' && fromHeader) ||
    undefined;

  if (!workspaceId) throw new HttpError(400, 'WorkspaceRequired');
  if (!req.userId) throw new HttpError(401, 'Unauthorized');

  MembershipModel.findOne({ userId: req.userId, workspaceId })
    .lean()
    .then((m) => {
      if (!m) throw new HttpError(403, 'NotAMember');
      req.workspaceId = workspaceId;
      req.workspaceRole = m.role as WorkspaceRole;
      next();
    })
    .catch(next);
}

/** Higher-order guard: requires a specific capability on the active workspace. */
export function requireCapability(cap: Capability) {
  return (req: WorkspaceScopedRequest, _res: Response, next: NextFunction): void => {
    if (!req.workspaceRole) throw new HttpError(403, 'Forbidden');
    if (!can(req.workspaceRole, cap)) throw new HttpError(403, 'Forbidden');
    next();
  };
}
