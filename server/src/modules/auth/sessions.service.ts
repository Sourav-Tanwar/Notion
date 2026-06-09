import { RefreshTokenModel } from './auth.model';
import { sha256 } from '../../utils/crypto';
import { parseDevice } from '../../utils/device';
import { audit } from '../../services/audit.service';
import { HttpError } from '../../utils/HttpError';

/**
 * "Sessions" UX surface, derived from the refresh-token table.
 *
 * Mental model: a *session* is one refresh-token FAMILY. Every time a refresh
 * is rotated, a new row is inserted with the same `family` value and the old
 * row is marked `revokedAt`. So:
 *
 *  - The "active sessions" for a user = the set of families that still have
 *    at least one non-revoked, non-expired row.
 *  - The "current session" = the family of the refresh cookie the user just
 *    presented.
 *  - "Revoke this session" = mark all rows in the family revoked.
 *  - "Sign out everywhere else" = revoke every family except the current one.
 *
 * Storing the family token directly in the cookie would have made this much
 * simpler — but families would then be guessable and forging a future token
 * within a family would skip reuse-detection. Hashing the per-rotation token
 * and joining on `family` keeps both properties.
 */

export interface SessionView {
  id: string; // family identifier (opaque to clients)
  device: string; // "Chrome on Windows"
  browser: string;
  os: string;
  ip: string;
  lastActiveAt: Date;
  createdAt: Date;
  current: boolean;
}

export const sessionsService = {
  async list(userId: string, presentedRefresh?: string): Promise<SessionView[]> {
    const presentedHash = presentedRefresh ? sha256(presentedRefresh) : null;
    const presentedDoc = presentedHash
      ? await RefreshTokenModel.findOne({ tokenHash: presentedHash }, { family: 1 }).lean()
      : null;
    const currentFamily = presentedDoc?.family ?? null;

    // Pull all non-revoked, non-expired rows for this user, then collapse to
    // one row per family (the most recently issued one — that's the "current"
    // device fingerprint for that session).
    const rows = await RefreshTokenModel.find({
      userId,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    })
      .sort({ createdAt: -1 })
      .lean();

    const byFamily = new Map<string, SessionView>();
    for (const r of rows) {
      if (byFamily.has(r.family)) continue;
      const device = parseDevice(r.userAgent);
      byFamily.set(r.family, {
        id: r.family,
        device: device.label,
        browser: device.browser,
        os: device.os,
        ip: r.ip ?? '',
        lastActiveAt: r.createdAt as Date,
        createdAt: r.createdAt as Date,
        current: r.family === currentFamily,
      });
    }
    // Stable order: current first, then most-recently-active.
    return [...byFamily.values()].sort((a, b) => {
      if (a.current && !b.current) return -1;
      if (!a.current && b.current) return 1;
      return b.lastActiveAt.getTime() - a.lastActiveAt.getTime();
    });
  },

  async revoke(userId: string, sessionId: string, ctx: { ip?: string; userAgent?: string }): Promise<void> {
    const r = await RefreshTokenModel.updateMany(
      { userId, family: sessionId, revokedAt: null },
      { revokedAt: new Date() },
    );
    if (r.matchedCount === 0) throw new HttpError(404, 'SessionNotFound');
    audit.log('session.revoked', { userId, ip: ctx.ip, userAgent: ctx.userAgent, meta: { family: sessionId } });
  },

  /** Revoke every session EXCEPT the one matching `presentedRefresh`. */
  async revokeOthers(
    userId: string,
    presentedRefresh: string | undefined,
    ctx: { ip?: string; userAgent?: string },
  ): Promise<number> {
    let keepFamily: string | null = null;
    if (presentedRefresh) {
      const doc = await RefreshTokenModel.findOne(
        { tokenHash: sha256(presentedRefresh) },
        { family: 1 },
      ).lean();
      keepFamily = doc?.family ?? null;
    }
    const query: Record<string, unknown> = { userId, revokedAt: null };
    if (keepFamily) query.family = { $ne: keepFamily };
    const r = await RefreshTokenModel.updateMany(query, { revokedAt: new Date() });
    audit.log('session.revoked', {
      userId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      meta: { scope: 'others', count: r.modifiedCount },
    });
    return r.modifiedCount ?? 0;
  },
};
