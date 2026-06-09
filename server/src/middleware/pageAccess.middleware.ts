import type { Response, NextFunction } from 'express';
import { PageModel } from '../modules/pages/pages.model';
import { HttpError } from '../utils/HttpError';
import {
  pagePermissionsService,
  PermissionCache,
} from '../modules/workspaces/pagePermissions.service';
import {
  levelAtLeast,
  type PageLevel,
} from '../modules/workspaces/pagePermissions';
import type { WorkspaceScopedRequest } from './workspace.middleware';

export interface PageScopedRequest extends WorkspaceScopedRequest {
  /** Memo of resolved page permissions, scoped to the request lifetime. */
  permissions?: PermissionCache;
  /** The resolved level for the page identified by `:id` / `:pageId`. */
  pageLevel?: PageLevel;
  pageId?: string;
}

function getCache(req: PageScopedRequest): PermissionCache {
  if (!req.permissions) req.permissions = new PermissionCache();
  return req.permissions;
}

/**
 * Require at least `required` level on the page identified by `:id` (default)
 * or a custom URL param. Runs AFTER `workspaceGuard` so `req.workspaceId` /
 * `req.workspaceRole` are populated.
 *
 * Existence-leak policy: we always return 404 (not 403) when the page is in
 * a different workspace or the user has `none` — leaking only what they
 * already have to know (their own workspace's IDs).
 */
export function pageAccessGuard(required: PageLevel, paramName = 'id') {
  return (req: PageScopedRequest, _res: Response, next: NextFunction): void => {
    const pageId = req.params?.[paramName];
    if (!pageId) {
      next(new HttpError(400, 'PageIdRequired'));
      return;
    }
    if (!req.workspaceId || !req.workspaceRole || !req.userId) {
      next(new HttpError(403, 'Forbidden'));
      return;
    }
    const cache = getCache(req);
    pagePermissionsService
      .resolve(req.workspaceId, req.userId, pageId, req.workspaceRole, cache)
      .then(async (level) => {
        // 404 vs 403: if the page doesn't exist in the workspace, hide it.
        // Otherwise the user "sees" it exists but is forbidden — fine.
        if (level === 'none') {
          const exists = await PageModel.exists({ _id: pageId, workspaceId: req.workspaceId });
          throw new HttpError(exists ? 403 : 404, exists ? 'Forbidden' : 'PageNotFound');
        }
        if (!levelAtLeast(level, required)) throw new HttpError(403, 'Forbidden');
        req.pageId = pageId;
        req.pageLevel = level;
        next();
      })
      .catch(next);
  };
}

/**
 * Bulk variant: enforce minimum level on every page id in the request body
 * (path `req.body[bodyField]`, default `'pageIds'`). Used by block bulk ops
 * where the page ids live in the payload rather than the URL.
 */
export function bulkPageAccessGuard(required: PageLevel, extractIds: (req: PageScopedRequest) => string[]) {
  return async (req: PageScopedRequest, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.workspaceId || !req.workspaceRole || !req.userId) throw new HttpError(403, 'Forbidden');
      const ids = [...new Set(extractIds(req))];
      if (!ids.length) return next();
      const cache = getCache(req);
      for (const id of ids) {
        const level = await pagePermissionsService.resolve(
          req.workspaceId,
          req.userId,
          id,
          req.workspaceRole,
          cache,
        );
        if (!levelAtLeast(level, required)) throw new HttpError(403, 'Forbidden');
      }
      next();
    } catch (e) {
      next(e as Error);
    }
  };
}
