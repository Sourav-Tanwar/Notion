import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { authGuard } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  workspaceGuard,
  type WorkspaceScopedRequest,
} from '../../middleware/workspace.middleware';
import {
  pageAccessGuard,
  type PageScopedRequest,
} from '../../middleware/pageAccess.middleware';
import { commentsService } from './comments.service';
import { createCommentSchema, updateCommentSchema, reactCommentSchema } from './comments.schema';

/**
 * Comment routes. Chain: authGuard → workspaceGuard, then either:
 *   - page-scoped list/create: `pageAccessGuard` reads `:pageId` from the URL
 *     (`view` to read, `comment` to write); or
 *   - item-scoped edit/delete/resolve: the page id is not in the URL, so the
 *     service loads the comment and resolves page permission itself.
 */
export const commentsRouter = Router();
commentsRouter.use(authGuard, workspaceGuard);

const actorOf = (req: WorkspaceScopedRequest) => ({
  userId: req.userId!,
  role: req.workspaceRole!,
});

commentsRouter.get(
  '/page/:pageId',
  pageAccessGuard('view', 'pageId'),
  asyncHandler(async (req: PageScopedRequest, res) => {
    res.json(
      await commentsService.listByPage(req.workspaceId!, req.params.pageId, req.userId!),
    );
  }),
);

commentsRouter.post(
  '/page/:pageId',
  pageAccessGuard('comment', 'pageId'),
  validate(createCommentSchema),
  asyncHandler(async (req: PageScopedRequest, res) => {
    res.json(
      await commentsService.create(req.workspaceId!, req.params.pageId, actorOf(req), req.body),
    );
  }),
);

commentsRouter.patch(
  '/:id',
  validate(updateCommentSchema),
  asyncHandler(async (req: WorkspaceScopedRequest, res) => {
    res.json(
      await commentsService.update(req.workspaceId!, actorOf(req), req.params.id, req.body),
    );
  }),
);

commentsRouter.delete(
  '/:id',
  asyncHandler(async (req: WorkspaceScopedRequest, res) => {
    res.json(await commentsService.remove(req.workspaceId!, actorOf(req), req.params.id));
  }),
);

commentsRouter.post(
  '/:id/resolve',
  asyncHandler(async (req: WorkspaceScopedRequest, res) => {
    res.json(await commentsService.setResolved(req.workspaceId!, actorOf(req), req.params.id, true));
  }),
);

commentsRouter.post(
  '/:id/reopen',
  asyncHandler(async (req: WorkspaceScopedRequest, res) => {
    res.json(
      await commentsService.setResolved(req.workspaceId!, actorOf(req), req.params.id, false),
    );
  }),
);

commentsRouter.post(
  '/:id/react',
  validate(reactCommentSchema),
  asyncHandler(async (req: WorkspaceScopedRequest, res) => {
    res.json(
      await commentsService.toggleReaction(
        req.workspaceId!,
        actorOf(req),
        req.params.id,
        req.body.emoji,
      ),
    );
  }),
);
