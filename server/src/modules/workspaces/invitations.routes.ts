import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { authGuard, type AuthedRequest } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  workspaceGuard,
  requireCapability,
  type WorkspaceScopedRequest,
} from '../../middleware/workspace.middleware';
import { invitationsService } from './invitations.service';
import { createInvitationSchema } from './invitations.schema';

/**
 * Admin-side invitation management. Mounted by `workspaces.routes.ts` under
 * `/api/workspaces/:workspaceId/invitations`. Every handler runs after
 * `workspaceGuard` so `req.workspaceId` and `req.workspaceRole` are populated.
 *
 * We do NOT expose the raw token through any of these endpoints. Token
 * possession travels exclusively via the email channel — same security
 * posture as password reset.
 */
export const workspaceInvitationsRouter = Router({ mergeParams: true });

workspaceInvitationsRouter.get(
  '/',
  requireCapability('workspace.member.invite'),
  asyncHandler(async (req: WorkspaceScopedRequest, res) => {
    res.json(await invitationsService.list(req.workspaceId!));
  }),
);

workspaceInvitationsRouter.post(
  '/',
  requireCapability('workspace.member.invite'),
  validate(createInvitationSchema),
  asyncHandler(async (req: WorkspaceScopedRequest, res) => {
    res.json(
      await invitationsService.create(
        { userId: req.userId!, role: req.workspaceRole! },
        req.workspaceId!,
        req.body,
      ),
    );
  }),
);

workspaceInvitationsRouter.post(
  '/:invitationId/resend',
  requireCapability('workspace.member.invite'),
  asyncHandler(async (req: WorkspaceScopedRequest, res) => {
    res.json(
      await invitationsService.resend(
        { userId: req.userId!, role: req.workspaceRole! },
        req.workspaceId!,
        req.params.invitationId,
      ),
    );
  }),
);

workspaceInvitationsRouter.delete(
  '/:invitationId',
  requireCapability('workspace.member.invite'),
  asyncHandler(async (req: WorkspaceScopedRequest, res) => {
    res.json(
      await invitationsService.revoke(
        { userId: req.userId!, role: req.workspaceRole! },
        req.workspaceId!,
        req.params.invitationId,
      ),
    );
  }),
);

/**
 * Invitee-side endpoints, mounted at `/api/invitations`.
 *
 *  - GET  /:token         → unauthenticated preview (no PII beyond the invited
 *                           email, which the invitee already knows — it's
 *                           their own address).
 *  - POST /:token/accept  → authenticated accept; user must be logged in as
 *                           the invited email.
 *
 * Tokens are validated by SHA-256 hash lookup. A wrong/expired/revoked token
 * always returns 4xx — never reveals whether the token ever existed.
 */
export const inviteePreviewRouter = Router();

inviteePreviewRouter.get(
  '/:token',
  asyncHandler(async (req, res) => {
    res.json(await invitationsService.preview(req.params.token));
  }),
);

inviteePreviewRouter.post(
  '/:token/accept',
  authGuard,
  asyncHandler(async (req: AuthedRequest, res) => {
    res.json(await invitationsService.accept(req.userId!, req.params.token));
  }),
);
