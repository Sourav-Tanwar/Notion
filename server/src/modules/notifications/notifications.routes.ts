import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { authGuard } from '../../middleware/auth.middleware';
import {
  workspaceGuard,
  type WorkspaceScopedRequest,
} from '../../middleware/workspace.middleware';
import { notificationsService } from './notifications.service';

/**
 * Notifications are always scoped to the current user within the active
 * workspace (resolved by `workspaceGuard` from the `x-workspace-id` header).
 * No page-level guard is needed — a notification row already belongs to the
 * requesting user, so there is nothing to leak.
 */
export const notificationsRouter = Router();
notificationsRouter.use(authGuard, workspaceGuard);

notificationsRouter.get(
  '/',
  asyncHandler(async (req: WorkspaceScopedRequest, res) => {
    res.json(await notificationsService.listForUser(req.workspaceId!, req.userId!));
  }),
);

notificationsRouter.get(
  '/unread-count',
  asyncHandler(async (req: WorkspaceScopedRequest, res) => {
    res.json({ count: await notificationsService.unreadCount(req.workspaceId!, req.userId!) });
  }),
);

notificationsRouter.post(
  '/read-all',
  asyncHandler(async (req: WorkspaceScopedRequest, res) => {
    res.json(await notificationsService.markAllRead(req.workspaceId!, req.userId!));
  }),
);

notificationsRouter.post(
  '/:id/read',
  asyncHandler(async (req: WorkspaceScopedRequest, res) => {
    res.json(await notificationsService.markRead(req.workspaceId!, req.userId!, req.params.id));
  }),
);
