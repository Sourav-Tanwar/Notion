import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { HttpError } from '../../utils/HttpError';
import {
  publicShareGuard,
  type PublicShareRequest,
} from '../../middleware/publicShare.middleware';
import { PageModel } from '../pages/pages.model';
import { BlockModel } from '../blocks/blocks.model';
import { validate } from '../../middleware/validate.middleware';
import { unlockShareLinkSchema } from './shareLinks.schema';
import { shareLinksService } from './shareLinks.service';

/**
 * Public, unauthenticated endpoints for token-based page access.
 *
 * Mounted at `/api/public`. Every endpoint is read-only and returns a thin
 * projection — never workspace metadata, member lists, or audit info.
 */
export const publicShareRouter = Router();

/**
 * Probe endpoint used by the share viewer before rendering: returns whether
 * the link exists, whether it requires a password, and (once unlocked) the
 * root page metadata. Two-call shape lets the client distinguish "wrong URL"
 * from "needs password" without leaking which one happened.
 */
publicShareRouter.get(
  '/links/:token',
  asyncHandler(async (req, res) => {
    const raw = String(req.params.token ?? '');
    const link = await shareLinksService.resolveByToken(raw);
    res.json({
      hasPassword: Boolean(link.passwordHash),
      expiresAt: link.expiresAt ? new Date(link.expiresAt).toISOString() : null,
      includeSubpages: link.includeSubpages,
    });
  }),
);

/**
 * Verify a password. Stateless — succeeds if the password matches; the
 * client is responsible for sending `x-share-password` on subsequent reads.
 * (We deliberately don't issue a cookie here yet; that's a future hardening
 * pass once we add rate limiting on this endpoint.)
 */
publicShareRouter.post(
  '/links/:token/unlock',
  validate(unlockShareLinkSchema),
  asyncHandler(async (req, res) => {
    const link = await shareLinksService.resolveByToken(String(req.params.token));
    if (!link.passwordHash) {
      // Calling unlock on a link with no password is harmless — return ok
      // rather than 400 so the UI flow is the same.
      return res.json({ ok: true });
    }
    const ok = await shareLinksService.verifyPassword(link, req.body.password);
    if (!ok) throw new HttpError(401, 'PasswordRequired');
    res.json({ ok: true });
  }),
);

/* --- Authenticated (by token, not user) reads ---------------------------- */

/**
 * Token-scoped subrouter. Mounted at `/links/:token` so `:token` is in scope
 * for `publicShareGuard`, which reads `req.params.token`.
 */
const guarded = Router({ mergeParams: true });
guarded.use(publicShareGuard());

/** Root page + visible subtree, projected to the fields the viewer needs. */
guarded.get(
  '/tree',
  asyncHandler(async (req: PublicShareRequest, res) => {
    const ids = [...(req.shareVisiblePageIds ?? new Set())];
    const pages = await PageModel.find({
      _id: { $in: ids },
      workspaceId: req.shareWorkspaceId,
      archivedAt: null,
    })
      .sort({ order: 1 })
      .select('_id parentId title icon coverUrl order createdAt updatedAt')
      .lean();
    res.json(
      pages.map((p) => ({
        id: String(p._id),
        parentId: p.parentId ? String(p.parentId) : null,
        title: p.title,
        icon: p.icon,
        coverUrl: p.coverUrl,
        order: p.order,
        createdAt: (p as { createdAt: Date }).createdAt.toISOString(),
        updatedAt: (p as { updatedAt: Date }).updatedAt.toISOString(),
      })),
    );
  }),
);

/** Blocks for a single page within the share scope. */
guarded.get(
  '/pages/:pageId/blocks',
  asyncHandler(async (req: PublicShareRequest, res) => {
    const pageId = String(req.params.pageId);
    if (!req.shareVisiblePageIds?.has(pageId)) {
      // Either the page isn't in the share scope or doesn't exist — collapse
      // both to 404 to avoid leaking which.
      throw new HttpError(404, 'NotFound');
    }
    const blocks = await BlockModel.find({
      workspaceId: req.shareWorkspaceId,
      pageId,
    })
      .sort({ order: 1 })
      .lean();
    // Strip audit metadata; keep only the editor-rendering shape.
    res.json(
      blocks.map((b) => ({
        id: String(b._id),
        pageId: String(b.pageId),
        parentId: b.parentId ? String(b.parentId) : null,
        type: b.type,
        text: b.text,
        order: b.order,
        props: b.props,
      })),
    );
  }),
);

publicShareRouter.use('/links/:token', guarded);
