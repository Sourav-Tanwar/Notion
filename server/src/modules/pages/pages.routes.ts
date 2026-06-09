import { Router } from 'express';
import multer from 'multer';
import { asyncHandler } from '../../utils/asyncHandler';
import { authGuard } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  workspaceGuard,
  requireCapability,
  type WorkspaceScopedRequest,
} from '../../middleware/workspace.middleware';
import {
  pageAccessGuard,
  type PageScopedRequest,
} from '../../middleware/pageAccess.middleware';
import { pagesService } from './pages.service';
import { createPageSchema, reorderPagesSchema, updatePageSchema, createFromTemplateSchema, importMarkdownSchema } from './pages.schema';
import { HttpError } from '../../utils/HttpError';
import { pagePermissionsService } from '../workspaces/pagePermissions.service';
import {
  pagePermissionUpsertSchema,
  findCandidateSchema,
} from '../workspaces/pagePermissions.schema';
import { shareLinksService } from '../workspaces/shareLinks.service';
import {
  createShareLinkSchema,
  updateShareLinkSchema,
} from '../workspaces/shareLinks.schema';
import { DocHistoryModel } from '../../realtime/history.model';
import { renderSnapshotPreview } from '../../realtime/historyPreview';
import { requestRestore } from '../../realtime/notify';
import { restoreLimiter } from '../../middleware/rateLimit.middleware';
import { audit } from '../../services/audit.service';
import { isValidObjectId } from 'mongoose';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype);
    if (!ok) return cb(new HttpError(400, 'UnsupportedImage') as unknown as Error);
    cb(null, true);
  },
});

/**
 * Page routes. The middleware chain is:
 *   authGuard          → who are you?
 *   workspaceGuard     → which workspace are you in? what's your role?
 *   pageAccessGuard(L) → what's your effective access on this page?
 *
 * `pageAccessGuard` is omitted for endpoints that don't reference a single
 * page id (list, create, reorder, trash, ...); those gate on the coarser
 * workspace-role capabilities.
 */
export const pagesRouter = Router();
pagesRouter.use(authGuard, workspaceGuard);

pagesRouter.get(
  '/',
  asyncHandler(async (req: WorkspaceScopedRequest, res) => {
    res.json(
      await pagesService.list(req.workspaceId!, {
        userId: req.userId!,
        role: req.workspaceRole!,
      }),
    );
  }),
);

pagesRouter.get(
  '/trash',
  requireCapability('page.delete'),
  asyncHandler(async (req: WorkspaceScopedRequest, res) => {
    res.json(await pagesService.listTrash(req.workspaceId!));
  }),
);

/** Reusable templates in this workspace. */
pagesRouter.get(
  '/templates',
  requireCapability('page.create'),
  asyncHandler(async (req: WorkspaceScopedRequest, res) => {
    res.json(await pagesService.listTemplates(req.workspaceId!));
  }),
);

/** Instantiate a new page from a template. */
pagesRouter.post(
  '/templates/:id/new',
  requireCapability('page.create'),
  validate(createFromTemplateSchema),
  asyncHandler(async (req: WorkspaceScopedRequest, res) => {
    res.json(
      await pagesService.createFromTemplate(
        req.workspaceId!,
        req.userId!,
        req.params.id,
        req.body.parentId ?? null,
      ),
    );
  }),
);

pagesRouter.post(
  '/',
  requireCapability('page.create'),
  validate(createPageSchema),
  asyncHandler(async (req: WorkspaceScopedRequest, res) => {
    res.json(await pagesService.create(req.workspaceId!, req.userId!, req.body));
  }),
);

/** Create a page from an uploaded / pasted Markdown document. */
pagesRouter.post(
  '/import',
  requireCapability('page.create'),
  validate(importMarkdownSchema),
  asyncHandler(async (req: WorkspaceScopedRequest, res) => {
    res.json(
      await pagesService.importMarkdown(
        req.workspaceId!,
        req.userId!,
        req.body.markdown,
        req.body.parentId ?? null,
      ),
    );
  }),
);

pagesRouter.patch(
  '/reorder',
  requireCapability('page.update'),
  validate(reorderPagesSchema),
  asyncHandler(async (req: WorkspaceScopedRequest, res) => {
    res.json(await pagesService.reorder(req.workspaceId!, req.body.items));
  }),
);

pagesRouter.patch(
  '/:id',
  pageAccessGuard('edit'),
  validate(updatePageSchema),
  asyncHandler(async (req: PageScopedRequest, res) => {
    res.json(await pagesService.update(req.workspaceId!, req.params.id, req.body));
  }),
);

pagesRouter.delete(
  '/:id',
  pageAccessGuard('edit'),
  asyncHandler(async (req: PageScopedRequest, res) => {
    res.json(await pagesService.archive(req.workspaceId!, req.params.id));
  }),
);

pagesRouter.post(
  '/:id/restore',
  pageAccessGuard('edit'),
  asyncHandler(async (req: PageScopedRequest, res) => {
    res.json(await pagesService.restore(req.workspaceId!, req.params.id));
  }),
);

/** Deep-copy a page (and its subtree) into a fully independent new page. */
pagesRouter.post(
  '/:id/duplicate',
  pageAccessGuard('edit'),
  asyncHandler(async (req: PageScopedRequest, res) => {
    res.json(await pagesService.duplicate(req.workspaceId!, req.userId!, req.params.id));
  }),
);

/** Snapshot a page (and its subtree) into a reusable template. */
pagesRouter.post(
  '/:id/template',
  pageAccessGuard('edit'),
  asyncHandler(async (req: PageScopedRequest, res) => {
    res.json(await pagesService.saveAsTemplate(req.workspaceId!, req.userId!, req.params.id));
  }),
);

/** Pages that @-mention this page ("linked references"). */
pagesRouter.get(
  '/:id/backlinks',
  pageAccessGuard('view'),
  asyncHandler(async (req: PageScopedRequest, res) => {
    res.json(
      await pagesService.backlinks(
        req.workspaceId!,
        { userId: req.userId!, role: req.workspaceRole! },
        req.params.id,
      ),
    );
  }),
);

/**
 * Permanent delete is destructive, but it's part of the trash lifecycle that
 * members can already drive (archive + restore both require `edit`, and the
 * trash list is gated at the `page.delete` capability = member). Requiring a
 * higher level here would show members a "Delete forever" button the API then
 * rejects, so we keep it consistent at `edit`.
 */
pagesRouter.delete(
  '/:id/permanent',
  pageAccessGuard('edit'),
  asyncHandler(async (req: PageScopedRequest, res) => {
    res.json(await pagesService.removePermanent(req.workspaceId!, req.params.id));
  }),
);

pagesRouter.post(
  '/:id/cover',
  pageAccessGuard('edit'),
  upload.single('cover'),
  asyncHandler(async (req: PageScopedRequest, res) => {
    if (!req.file) throw new HttpError(400, 'NoFile');
    res.json(await pagesService.setCover(req.workspaceId!, req.params.id, req.file.buffer));
  }),
);

pagesRouter.delete(
  '/:id/cover',
  pageAccessGuard('edit'),
  asyncHandler(async (req: PageScopedRequest, res) => {
    res.json(await pagesService.clearCover(req.workspaceId!, req.params.id));
  }),
);

/* ---------- Sharing ---------- */

/** Effective permission for the current viewer. Cheap, used by the editor to
 *  decide whether to render the share button / mark readonly / etc. */
pagesRouter.get(
  '/:id/access',
  pageAccessGuard('view'),
  asyncHandler(async (req: PageScopedRequest, res) => {
    res.json({ level: req.pageLevel, role: req.workspaceRole });
  }),
);

/**
 * List the snapshot archive for a page. Returns metadata only — the binary
 * Y.Doc state is intentionally excluded from the list payload because it's
 * potentially large. A future "restore from history" endpoint can ship the
 * actual bytes for a single chosen revision.
 *
 * Requires `view`: anyone who can read the page can see its edit timeline.
 * Restore (when added) should require `edit`.
 */
pagesRouter.get(
  '/:id/history',
  pageAccessGuard('view'),
  asyncHandler(async (req: PageScopedRequest, res) => {
    const rows = await DocHistoryModel.find({ pageId: req.params.id })
      .sort({ createdAt: -1 })
      .select('_id revision sizeBytes createdAt cause createdBy')
      .lean();
    res.set('Cache-Control', 'no-store');
    res.json(
      rows.map((r) => ({
        id: String(r._id),
        revision: r.revision,
        sizeBytes: r.sizeBytes,
        createdAt: r.createdAt,
        cause: (r.cause as 'autosave' | 'restore' | 'manual' | undefined) ?? 'autosave',
        createdBy: r.createdBy ? String(r.createdBy) : null,
      })),
    );
  }),
);

/**
 * Decoded preview of a single archived revision. Returns rendered HTML
 * overlaid on the page's CURRENT block structure (see
 * `renderSnapshotPreview` for the rationale). Heavyweight enough that we
 * don't fold it into the `/history` list — clients should call it lazily
 * when the user selects a revision.
 */
pagesRouter.get(
  '/:id/history/:revisionId/preview',
  pageAccessGuard('view'),
  asyncHandler(async (req: PageScopedRequest, res) => {
    const { id: pageId, revisionId } = req.params;
    if (!isValidObjectId(revisionId)) throw new HttpError(400, 'InvalidRevisionId');

    const row = await DocHistoryModel.findOne({ _id: revisionId, pageId }).lean();
    if (!row) throw new HttpError(404, 'RevisionNotFound');

    // Mongoose can hand the binary back as a Node Buffer, a BSON Binary
    // wrapper (`{ buffer: Buffer, sub_type: number }`), or an ArrayBuffer
    // view depending on driver version. Normalize to a Uint8Array so
    // Y.applyUpdate doesn't blow up on the wrong shape.
    const raw = row.state as unknown;
    let state: Uint8Array;
    if (raw instanceof Uint8Array) {
      state = raw;
    } else if (raw && typeof raw === 'object' && 'buffer' in (raw as Record<string, unknown>)) {
      const inner = (raw as { buffer: unknown }).buffer;
      state = inner instanceof Uint8Array ? inner : new Uint8Array(inner as ArrayBuffer);
    } else {
      throw new HttpError(500, 'CorruptHistorySnapshot');
    }

    const preview = await renderSnapshotPreview(pageId, state);
    res.set('Cache-Control', 'no-store');
    res.json({
      id: String(row._id),
      revision: row.revision,
      sizeBytes: row.sizeBytes,
      createdAt: row.createdAt,
      html: preview.html,
      plainText: preview.plainText,
      blockCount: preview.blockCount,
    });
  }),
);

/**
 * `POST /pages/:id/history/:revisionId/restore`
 *
 * Destructive — replaces the page's content AND block tree (parent /
 * order / type / props) with the chosen revision. Requires `edit`
 * permission (preview is `view`). Rate-limited per user.
 *
 * Cross-process flow: REST validates auth + that the row exists for
 * this page, then asks the realtime process to perform the surgery.
 * The realtime process re-fetches the row (cheap), captures a "before"
 * snapshot for Undo, then mutates the live `Y.Doc` and `BlockModel` in
 * lockstep. The returned `beforeRevisionId` is what the client's Undo
 * button restores from.
 */
pagesRouter.post(
  '/:id/history/:revisionId/restore',
  restoreLimiter,
  pageAccessGuard('edit'),
  asyncHandler(async (req: PageScopedRequest, res) => {
    const { id: pageId, revisionId } = req.params;
    if (!isValidObjectId(revisionId)) throw new HttpError(400, 'InvalidRevisionId');

    // Existence check up-front so we can return a clean 404 without
    // round-tripping to the realtime process. The realtime process
    // validates again (defence-in-depth against a stale check window).
    const row = await DocHistoryModel.findOne({ _id: revisionId, pageId })
      .select('_id revision')
      .lean();
    if (!row) throw new HttpError(404, 'RevisionNotFound');

    const result = await requestRestore(pageId, revisionId, req.userId ?? null);

    audit.log('page.history.restored', {
      userId: req.userId,
      ip: req.ip,
      userAgent: req.headers['user-agent'] ?? '',
      meta: {
        pageId,
        revisionId,
        fromRevision: row.revision ?? 0,
        beforeRevisionId: result.beforeRevisionId,
        blocksUpdated: result.blocksUpdated,
        live: result.live,
      },
    });

    res.set('Cache-Control', 'no-store');
    res.json({
      ok: result.ok,
      blocksUpdated: result.blocksUpdated,
      live: result.live,
      revision: row.revision,
      beforeRevisionId: result.beforeRevisionId,
    });
  }),
);

/**
 * Look up a workspace member by email for the share UI. Declared BEFORE the
 * `:userId` route so `candidate` is never parsed as a userId.
 */
pagesRouter.get(
  '/:id/permissions/candidate',
  pageAccessGuard('full'),
  validate(findCandidateSchema, 'query'),
  asyncHandler(async (req: PageScopedRequest, res) => {
    const email = (req.query.email as string) ?? '';
    res.json(await pagePermissionsService.findCandidateByEmail(req.workspaceId!, email));
  }),
);

pagesRouter.get(
  '/:id/permissions',
  pageAccessGuard('full'),
  asyncHandler(async (req: PageScopedRequest, res) => {
    res.json(await pagePermissionsService.list(req.workspaceId!, req.params.id));
  }),
);

pagesRouter.put(
  '/:id/permissions',
  pageAccessGuard('full'),
  validate(pagePermissionUpsertSchema),
  asyncHandler(async (req: PageScopedRequest, res) => {
    res.json(
      await pagePermissionsService.upsert(
        req.workspaceId!,
        req.params.id,
        req.userId!,
        req.body,
      ),
    );
  }),
);

pagesRouter.delete(
  '/:id/permissions/:userId',
  pageAccessGuard('full'),
  asyncHandler(async (req: PageScopedRequest, res) => {
    res.json(
      await pagePermissionsService.remove(
        req.workspaceId!,
        req.params.id,
        req.params.userId,
      ),
    );
  }),
);

/* ---------- Public share links ---------- */

pagesRouter.get(
  '/:id/share-links',
  pageAccessGuard('full'),
  asyncHandler(async (req: PageScopedRequest, res) => {
    res.json(await shareLinksService.list(req.workspaceId!, req.params.id));
  }),
);

pagesRouter.post(
  '/:id/share-links',
  pageAccessGuard('full'),
  validate(createShareLinkSchema),
  asyncHandler(async (req: PageScopedRequest, res) => {
    res.json(
      await shareLinksService.create(
        req.workspaceId!,
        req.params.id,
        req.userId!,
        req.body,
      ),
    );
  }),
);

pagesRouter.patch(
  '/:id/share-links/:linkId',
  pageAccessGuard('full'),
  validate(updateShareLinkSchema),
  asyncHandler(async (req: PageScopedRequest, res) => {
    res.json(
      await shareLinksService.update(
        req.workspaceId!,
        req.params.id,
        req.params.linkId,
        req.body,
      ),
    );
  }),
);

pagesRouter.delete(
  '/:id/share-links/:linkId',
  pageAccessGuard('full'),
  asyncHandler(async (req: PageScopedRequest, res) => {
    res.json(
      await shareLinksService.revoke(
        req.workspaceId!,
        req.params.id,
        req.params.linkId,
      ),
    );
  }),
);
