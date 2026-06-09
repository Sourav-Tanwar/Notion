import bcrypt from 'bcryptjs';
import { Types } from 'mongoose';
import { env } from '../../config/env';
import { HttpError } from '../../utils/HttpError';
import { randomToken, sha256, timingSafeEqual } from '../../utils/crypto';
import { ShareLinkModel, type ShareLink } from './shareLinks.model';
import { PageModel } from '../pages/pages.model';
import type { CreateShareLinkInput, UpdateShareLinkInput } from './shareLinks.schema';

/**
 * Public-facing DTO. Never echoes a token, password hash, or the workspace
 * id — anonymous viewers don't need any of that, and admins already know it.
 */
function toDTO(doc: ShareLink, rawToken?: string) {
  return {
    id: String(doc._id),
    pageId: String(doc.pageId),
    workspaceId: String(doc.workspaceId),
    hasPassword: Boolean(doc.passwordHash),
    expiresAt: doc.expiresAt ? new Date(doc.expiresAt).toISOString() : null,
    includeSubpages: doc.includeSubpages,
    createdBy: String(doc.createdBy),
    createdAt: (doc as ShareLink & { createdAt: Date }).createdAt.toISOString(),
    updatedAt: (doc as ShareLink & { updatedAt: Date }).updatedAt.toISOString(),
    revokedAt: doc.revokedAt ? new Date(doc.revokedAt).toISOString() : null,
    lastAccessedAt: doc.lastAccessedAt ? new Date(doc.lastAccessedAt).toISOString() : null,
    // Only present on create/regenerate responses. Encoded into the URL the
    // owner copies out — we cannot recover it later.
    ...(rawToken ? { token: rawToken } : {}),
  };
}

async function assertPageInWorkspace(workspaceId: string, pageId: string) {
  const exists = await PageModel.exists({ _id: pageId, workspaceId });
  if (!exists) throw new HttpError(404, 'PageNotFound');
}

/** Active = not revoked AND (no expiry OR expiry in the future). */
function isLive(doc: ShareLink): boolean {
  if (doc.revokedAt) return false;
  if (doc.expiresAt && new Date(doc.expiresAt).getTime() <= Date.now()) return false;
  return true;
}

export const shareLinksService = {
  async list(workspaceId: string, pageId: string) {
    await assertPageInWorkspace(workspaceId, pageId);
    const docs = await ShareLinkModel.find({ workspaceId, pageId }).sort({ createdAt: -1 }).lean();
    return docs.map((d) => toDTO(d as unknown as ShareLink));
  },

  /**
   * Create a new link. Returns the raw token in the response — this is the
   * one and only time the server emits it. The caller must persist it (e.g.
   * by displaying "copy URL" in the share modal).
   */
  async create(
    workspaceId: string,
    pageId: string,
    createdBy: string,
    input: CreateShareLinkInput,
  ) {
    await assertPageInWorkspace(workspaceId, pageId);
    const raw = randomToken(32);
    const passwordHash = input.password
      ? await bcrypt.hash(input.password, env.bcryptRounds)
      : null;
    const doc = await ShareLinkModel.create({
      workspaceId: new Types.ObjectId(workspaceId),
      pageId: new Types.ObjectId(pageId),
      tokenHash: sha256(raw),
      passwordHash,
      expiresAt: input.expiresAt ?? null,
      includeSubpages: input.includeSubpages ?? true,
      createdBy: new Types.ObjectId(createdBy),
    });
    return toDTO(doc.toObject() as ShareLink, raw);
  },

  /** Mutate non-token settings (password/expiry/subpages). */
  async update(workspaceId: string, pageId: string, linkId: string, input: UpdateShareLinkInput) {
    const doc = await ShareLinkModel.findOne({ _id: linkId, workspaceId, pageId });
    if (!doc) throw new HttpError(404, 'ShareLinkNotFound');

    if (input.password !== undefined) {
      doc.passwordHash = input.password
        ? await bcrypt.hash(input.password, env.bcryptRounds)
        : null;
    }
    if (input.expiresAt !== undefined) {
      doc.expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    }
    if (input.includeSubpages !== undefined) {
      doc.includeSubpages = input.includeSubpages;
    }
    await doc.save();
    return toDTO(doc.toObject() as ShareLink);
  },

  /**
   * Revoke = soft delete. Old URLs immediately stop resolving. We don't hard-
   * delete because audit trails should be able to show "this link was active
   * from X to Y" after the fact.
   */
  async revoke(workspaceId: string, pageId: string, linkId: string) {
    const doc = await ShareLinkModel.findOne({ _id: linkId, workspaceId, pageId });
    if (!doc) throw new HttpError(404, 'ShareLinkNotFound');
    if (!doc.revokedAt) {
      doc.revokedAt = new Date();
      await doc.save();
    }
    return { ok: true };
  },

  /**
   * Resolve a raw token to a live link. Used by `publicShareGuard`.
   *
   * Security notes:
   *  - We look up by `sha256(token)`, never by raw token, so a DB dump never
   *    leaks credentials.
   *  - Expired/revoked/unknown all collapse to the same 404 to avoid an
   *    oracle for "this token used to exist".
   */
  async resolveByToken(rawToken: string) {
    if (!rawToken || rawToken.length > 256) throw new HttpError(404, 'NotFound');
    const tokenHash = sha256(rawToken);
    const doc = await ShareLinkModel.findOne({ tokenHash }).lean<ShareLink>();
    if (!doc || !isLive(doc)) throw new HttpError(404, 'NotFound');
    return doc;
  },

  /** Compare a candidate password against the stored bcrypt hash. */
  async verifyPassword(doc: ShareLink, candidate: string): Promise<boolean> {
    if (!doc.passwordHash) return true; // no gate
    return bcrypt.compare(candidate, doc.passwordHash);
  },

  /**
   * Constant-time hash comparison for callers that already computed the
   * hash. Exposed so `publicShareGuard` can detect a tampered `x-share-token`
   * vs. the URL token. Not currently used by routes — included for future
   * signed-cookie unlock flows.
   */
  hashesEqual(a: string, b: string) {
    return timingSafeEqual(a, b);
  },

  /** Fire-and-forget "last accessed" stamp. */
  touch(linkId: Types.ObjectId): void {
    ShareLinkModel.updateOne({ _id: linkId }, { lastAccessedAt: new Date() }).catch(() => {
      /* best-effort */
    });
  },

  /** Cascade hook: drop all links for a list of pages (used on hard-delete). */
  async removeForPages(workspaceId: string, pageIds: string[]) {
    if (!pageIds.length) return;
    await ShareLinkModel.deleteMany({ workspaceId, pageId: { $in: pageIds } });
  },
};
