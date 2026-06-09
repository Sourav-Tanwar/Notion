import { Router } from 'express';
import multer from 'multer';
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
import { blocksService } from './blocks.service';
import { deleteBlocksSchema, reorderBlocksSchema, upsertBlocksSchema } from './blocks.schema';
import { HttpError } from '../../utils/HttpError';
import { processContentImage } from '../../services/image.pipeline';
import { getStorage } from '../../services/storage.service';
import { fetchLinkPreview } from '../../services/linkPreview.service';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype);
    if (!ok) return cb(new HttpError(400, 'UnsupportedImage') as unknown as Error);
    cb(null, true);
  },
});

// Generic attachment upload (video / file blocks). Stored as-is (no image
// pipeline) with a larger ceiling; the client keeps the returned url + meta.
const uploadFile = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

export const blocksRouter = Router();
blocksRouter.use(authGuard, workspaceGuard);

/** Per-page list — gate at `view`+. */
blocksRouter.get(
  '/page/:pageId',
  pageAccessGuard('view', 'pageId'),
  asyncHandler(async (req: PageScopedRequest, res) => {
    res.json(await blocksService.listByPage(req.workspaceId!, req.params.pageId));
  }),
);

/**
 * Bulk write endpoints: the affected page ids live in the payload, not in
 * the URL, so the per-page edit check happens inside the service (single
 * resolver + per-call cache). The router only enforces "you are a member of
 * this workspace".
 */
blocksRouter.post(
  '/bulk',
  validate(upsertBlocksSchema),
  asyncHandler(async (req: WorkspaceScopedRequest, res) => {
    res.json(
      await blocksService.upsertMany(
        req.workspaceId!,
        { userId: req.userId!, role: req.workspaceRole! },
        req.body.blocks,
      ),
    );
  }),
);

blocksRouter.post(
  '/delete',
  validate(deleteBlocksSchema),
  asyncHandler(async (req: WorkspaceScopedRequest, res) => {
    res.json(
      await blocksService.deleteMany(
        req.workspaceId!,
        { userId: req.userId!, role: req.workspaceRole! },
        req.body.ids,
      ),
    );
  }),
);

blocksRouter.patch(
  '/reorder',
  validate(reorderBlocksSchema),
  asyncHandler(async (req: WorkspaceScopedRequest, res) => {
    res.json(
      await blocksService.reorder(
        req.workspaceId!,
        { userId: req.userId!, role: req.workspaceRole! },
        req.body.items,
      ),
    );
  }),
);

/**
 * Image upload for the `image` block type. Returns the served URL; the client
 * stores it in `block.props.url`. Workspace membership is sufficient — any
 * member can upload an image. Whether they can attach it to a particular
 * page is enforced when the block is persisted via /bulk.
 */
blocksRouter.post(
  '/image',
  upload.single('image'),
  asyncHandler(async (req: WorkspaceScopedRequest, res) => {
    if (!req.file) throw new HttpError(400, 'NoFile');
    const processed = await processContentImage(req.file.buffer);
    const key = `images/${req.workspaceId}-${req.userId}-${Date.now()}.${processed.ext}`;
    const url = await getStorage().save(key, processed.buffer, processed.mime);
    res.json({ url, width: processed.width, height: processed.height });
  }),
);

/**
 * Generic attachment upload for the `video` and `file` block types. Unlike
 * images, the bytes are stored verbatim. Returns the served URL plus the
 * original filename / size / mime so the block can render a rich card.
 */
blocksRouter.post(
  '/file',
  uploadFile.single('file'),
  asyncHandler(async (req: WorkspaceScopedRequest, res) => {
    if (!req.file) throw new HttpError(400, 'NoFile');
    const safeName = req.file.originalname.replace(/[^\w.\-]+/g, '_').slice(-80) || 'file';
    const key = `files/${req.workspaceId}-${req.userId}-${Date.now()}-${safeName}`;
    const url = await getStorage().save(key, req.file.buffer, req.file.mimetype || 'application/octet-stream');
    res.json({
      url,
      name: req.file.originalname,
      size: req.file.size,
      mime: req.file.mimetype || 'application/octet-stream',
    });
  }),
);

/**
 * Link-preview fetcher for the `bookmark` block. Fetches the target page and
 * scrapes Open Graph / basic meta tags. SSRF-guarded: only public http(s)
 * hosts, capped body, short timeout.
 */
blocksRouter.get(
  '/bookmark',
  asyncHandler(async (req: WorkspaceScopedRequest, res) => {
    const target = String(req.query.url ?? '');
    const meta = await fetchLinkPreview(target);
    res.json(meta);
  }),
);

