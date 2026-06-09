import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { authGuard } from '../../middleware/auth.middleware';
import {
  workspaceGuard,
  type WorkspaceScopedRequest,
} from '../../middleware/workspace.middleware';
import { searchService } from './search.service';

export const searchRouter = Router();
searchRouter.use(authGuard, workspaceGuard);

/** GET /api/search?q=...  — workspace-scoped full-text search. */
searchRouter.get(
  '/',
  asyncHandler(async (req: WorkspaceScopedRequest, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const hits = await searchService.search(
      req.workspaceId!,
      { userId: req.userId!, role: req.workspaceRole! },
      q,
    );
    res.json(hits);
  }),
);
