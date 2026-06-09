import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { randomToken, sha256 } from '../../utils/crypto';
import { RefreshTokenModel, UserModel } from './auth.model';
import { HttpError } from '../../utils/HttpError';
import { audit } from '../../services/audit.service';

/**
 * Access token: short-lived JWT, signed with HS256. Payload includes `tv`
 * (tokenVersion) so a user-level revoke (logout-all, password change) is
 * enforceable WITHOUT a DB lookup on every request — the access token simply
 * stops verifying once tv is bumped.
 *
 * Refresh token: long-lived OPAQUE token (no JWT). Storing JWTs as refresh
 * tokens is a common mistake: it tempts naive verification without DB lookup,
 * which breaks revocation. Opaque + DB record + family rotation is robust.
 */

export interface AccessTokenPayload {
  sub: string;
  tv: number;
  role: string;
}

export const tokenService = {
  signAccess(userId: string, tokenVersion: number, role: string): string {
    const payload: AccessTokenPayload = { sub: userId, tv: tokenVersion, role };
    const options: jwt.SignOptions = { expiresIn: env.jwtAccessTtl as jwt.SignOptions['expiresIn'] };
    return jwt.sign(payload, env.jwtAccessSecret, options);
  },

  verifyAccess(token: string): AccessTokenPayload {
    return jwt.verify(token, env.jwtAccessSecret) as AccessTokenPayload;
  },

  /** Issue a brand-new refresh token in a fresh family. */
  async issueRefresh(
    userId: string,
    ctx: { userAgent?: string; ip?: string } = {},
  ): Promise<{ token: string; expiresAt: Date; family: string }> {
    const family = randomToken(16);
    return this.issueRefreshInFamily(userId, family, ctx);
  },

  async issueRefreshInFamily(
    userId: string,
    family: string,
    ctx: { userAgent?: string; ip?: string } = {},
  ): Promise<{ token: string; expiresAt: Date; family: string }> {
    const token = randomToken(48);
    const tokenHash = sha256(token);
    const expiresAt = new Date(Date.now() + env.refreshTtlDays * 86_400_000);
    await RefreshTokenModel.create({
      userId,
      tokenHash,
      family,
      expiresAt,
      userAgent: ctx.userAgent ?? '',
      ip: ctx.ip ?? '',
    });
    return { token, expiresAt, family };
  },

  /**
   * Verify a presented refresh token and rotate it. Returns a new access token
   * and a new refresh token. If the presented token was already revoked, we
   * consider it stolen and revoke the entire family.
   */
  async rotate(
    presented: string,
    ctx: { userAgent?: string; ip?: string } = {},
  ): Promise<{ access: string; refresh: string; refreshExpiresAt: Date; userId: string }> {
    const tokenHash = sha256(presented);
    const record = await RefreshTokenModel.findOne({ tokenHash });
    if (!record) throw new HttpError(401, 'InvalidRefresh');
    if (record.expiresAt < new Date()) throw new HttpError(401, 'ExpiredRefresh');

    // Reuse detection: a revoked token being presented → kill the whole family.
    if (record.revokedAt) {
      await RefreshTokenModel.updateMany(
        { family: record.family, revokedAt: null },
        { revokedAt: new Date() },
      );
      audit.log('refresh.reuse_detected', {
        userId: String(record.userId),
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        meta: { family: record.family },
      });
      throw new HttpError(401, 'RefreshReuseDetected');
    }

    const user = await UserModel.findById(record.userId).lean();
    if (!user) throw new HttpError(401, 'InvalidRefresh');
    if (user.deletedAt) throw new HttpError(401, 'InvalidRefresh');

    // Suspicious-refresh heuristic: log (but do not block) when the IP class
    // or user-agent changes mid-session. A SOC can build alerting on top.
    if (
      (ctx.ip && record.ip && !sameIpClass(record.ip, ctx.ip)) ||
      (ctx.userAgent && record.userAgent && record.userAgent !== ctx.userAgent)
    ) {
      audit.log('refresh.suspicious', {
        userId: String(user._id),
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        meta: { prevIp: record.ip, prevUserAgent: record.userAgent },
      });
    }

    // Issue new refresh in same family + revoke current.
    const next = await this.issueRefreshInFamily(String(user._id), record.family, ctx);
    record.revokedAt = new Date();
    record.replacedBy = sha256(next.token);
    await record.save();

    const access = this.signAccess(String(user._id), user.tokenVersion ?? 0, user.role ?? 'user');
    return { access, refresh: next.token, refreshExpiresAt: next.expiresAt, userId: String(user._id) };
  },

  /** Revoke a single refresh token (logout this device). */
  async revoke(presented: string): Promise<void> {
    const tokenHash = sha256(presented);
    await RefreshTokenModel.updateOne({ tokenHash, revokedAt: null }, { revokedAt: new Date() });
  },

  /** Revoke every refresh token for a user (logout-all). Bump tokenVersion too. */
  async revokeAll(userId: string): Promise<void> {
    await RefreshTokenModel.updateMany({ userId, revokedAt: null }, { revokedAt: new Date() });
    await UserModel.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } });
  },
};

/**
 * Coarse IP equivalence — same /24 for IPv4, same /64 for IPv6 — so that
 * normal NAT churn doesn't fire the suspicious-refresh signal. A real WAF /
 * GeoIP integration belongs elsewhere; this is the cheapest sane heuristic.
 */
function sameIpClass(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.includes(':') && b.includes(':')) {
    return a.split(':').slice(0, 4).join(':') === b.split(':').slice(0, 4).join(':');
  }
  const av = a.split('.');
  const bv = b.split('.');
  if (av.length === 4 && bv.length === 4) {
    return av[0] === bv[0] && av[1] === bv[1] && av[2] === bv[2];
  }
  return false;
}
