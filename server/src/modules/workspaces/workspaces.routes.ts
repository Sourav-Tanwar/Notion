import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { authGuard, type AuthedRequest } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  workspaceGuard,
  requireCapability,
  type WorkspaceScopedRequest,
} from '../../middleware/workspace.middleware';
import { workspacesService } from './workspaces.service';
import {
  createWorkspaceSchema,
  updateMemberSchema,
  updateWorkspaceSchema,
} from './workspaces.schema';
import { workspaceInvitationsRouter } from './invitations.routes';

export const workspacesRouter = Router();
workspacesRouter.use(authGuard);

/** GET /api/workspaces — all workspaces the caller belongs to. */
workspacesRouter.get(
  '/',
  asyncHandler(async (req: AuthedRequest, res) => {
    res.json(await workspacesService.listForUser(req.userId!));
  }),
);

/** POST /api/workspaces — create a new team workspace. */
workspacesRouter.post(
  '/',
  validate(createWorkspaceSchema),
  asyncHandler(async (req: AuthedRequest, res) => {
    res.json(await workspacesService.create(req.userId!, req.body));
  }),
);

// All routes below operate on a specific workspace and require membership.
const scoped = Router({ mergeParams: true });
scoped.use(workspaceGuard);

scoped.patch(
  '/',
  validate(updateWorkspaceSchema),
  asyncHandler(async (req: WorkspaceScopedRequest, res) => {
    res.json(
      await workspacesService.update(
        { userId: req.userId!, role: req.workspaceRole! },
        req.workspaceId!,
        req.body,
      ),
    );
  }),
);

scoped.delete(
  '/',
  asyncHandler(async (req: WorkspaceScopedRequest, res) => {
    res.json(
      await workspacesService.archive(
        { userId: req.userId!, role: req.workspaceRole! },
        req.workspaceId!,
      ),
    );
  }),
);

scoped.get(
  '/members',
  requireCapability('workspace.read'),
  asyncHandler(async (req: WorkspaceScopedRequest, res) => {
    res.json(await workspacesService.listMembers(req.workspaceId!));
  }),
);

scoped.patch(
  '/members/:userId',
  validate(updateMemberSchema),
  asyncHandler(async (req: WorkspaceScopedRequest, res) => {
    res.json(
      await workspacesService.updateMemberRole(
        { userId: req.userId!, role: req.workspaceRole! },
        req.workspaceId!,
        req.params.userId,
        req.body.role,
      ),
    );
  }),
);

scoped.delete(
  '/members/:userId',
  asyncHandler(async (req: WorkspaceScopedRequest, res) => {
    res.json(
      await workspacesService.removeMember(
        { userId: req.userId!, role: req.workspaceRole! },
        req.workspaceId!,
        req.params.userId,
      ),
    );
  }),
);

scoped.use('/invitations', workspaceInvitationsRouter);

workspacesRouter.use('/:workspaceId', scoped);
