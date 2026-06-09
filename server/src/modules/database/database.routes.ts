import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { authGuard } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  workspaceGuard,
  requireCapability,
  type WorkspaceScopedRequest,
} from '../../middleware/workspace.middleware';
import { databaseService } from './database.service';
import {
  createDatabaseSchema,
  renameDatabaseSchema,
  addColumnSchema,
  updateColumnSchema,
  addOptionSchema,
  updateCellsSchema,
} from './database.schema';

/**
 * Inline database routes. Gated by workspace membership; mutations also
 * require the `page.update` capability (same bar as editing page content).
 * Every query is scoped by `workspaceId`, so cross-workspace ids never resolve.
 */
export const databaseRouter = Router();
databaseRouter.use(authGuard, workspaceGuard);

databaseRouter.post(
  '/',
  requireCapability('page.update'),
  validate(createDatabaseSchema),
  asyncHandler(async (req: WorkspaceScopedRequest, res) => {
    res.json(await databaseService.create(req.workspaceId!, req.body.pageId, req.body.title));
  }),
);

databaseRouter.get(
  '/:id',
  asyncHandler(async (req: WorkspaceScopedRequest, res) => {
    res.json(await databaseService.get(req.workspaceId!, req.params.id));
  }),
);

databaseRouter.patch(
  '/:id',
  requireCapability('page.update'),
  validate(renameDatabaseSchema),
  asyncHandler(async (req: WorkspaceScopedRequest, res) => {
    res.json(await databaseService.rename(req.workspaceId!, req.params.id, req.body.title));
  }),
);

databaseRouter.post(
  '/:id/columns',
  requireCapability('page.update'),
  validate(addColumnSchema),
  asyncHandler(async (req: WorkspaceScopedRequest, res) => {
    res.json(
      await databaseService.addColumn(req.workspaceId!, req.params.id, req.body.name, req.body.type),
    );
  }),
);

databaseRouter.patch(
  '/:id/columns/:colId',
  requireCapability('page.update'),
  validate(updateColumnSchema),
  asyncHandler(async (req: WorkspaceScopedRequest, res) => {
    res.json(
      await databaseService.updateColumn(req.workspaceId!, req.params.id, req.params.colId, req.body),
    );
  }),
);

databaseRouter.delete(
  '/:id/columns/:colId',
  requireCapability('page.update'),
  asyncHandler(async (req: WorkspaceScopedRequest, res) => {
    res.json(await databaseService.deleteColumn(req.workspaceId!, req.params.id, req.params.colId));
  }),
);

databaseRouter.post(
  '/:id/columns/:colId/options',
  requireCapability('page.update'),
  validate(addOptionSchema),
  asyncHandler(async (req: WorkspaceScopedRequest, res) => {
    res.json(
      await databaseService.addOption(
        req.workspaceId!,
        req.params.id,
        req.params.colId,
        req.body.name,
        req.body.color,
      ),
    );
  }),
);

databaseRouter.post(
  '/:id/rows',
  requireCapability('page.update'),
  asyncHandler(async (req: WorkspaceScopedRequest, res) => {
    res.json(await databaseService.addRow(req.workspaceId!, req.params.id));
  }),
);

databaseRouter.patch(
  '/:id/rows/:rowId',
  requireCapability('page.update'),
  validate(updateCellsSchema),
  asyncHandler(async (req: WorkspaceScopedRequest, res) => {
    res.json(
      await databaseService.updateCells(
        req.workspaceId!,
        req.params.id,
        req.params.rowId,
        req.body.cells,
      ),
    );
  }),
);

databaseRouter.delete(
  '/:id/rows/:rowId',
  requireCapability('page.update'),
  asyncHandler(async (req: WorkspaceScopedRequest, res) => {
    res.json(await databaseService.deleteRow(req.workspaceId!, req.params.id, req.params.rowId));
  }),
);
