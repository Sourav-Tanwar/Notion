import { randomToken } from '../../utils/crypto';
import { env } from '../../config/env';
import { HttpError } from '../../utils/HttpError';
import { AccountModel, UserModel, type UserDoc } from './auth.model';
import { tokenService } from './token.service';
import { toPublicUser } from './auth.service';

/**
 * OAuth providers are registered once and discovered by name. Adding GitHub /
 * Microsoft / Discord later means implementing this interface — no changes
 * needed in the route layer.
 */
export interface OAuthProfile {
  providerAccountId: string;
  email: string;
  emailVerified: boolean;
  name: string;
  avatarUrl: string | null;
}

export interface OAuthProvider {
  name: string;
  /** Build the authorize URL we redirect the user to. */
  authorizeUrl(state: string): string;
  /** Exchange `code` for an access token and fetch the userinfo profile. */
  exchangeCode(code: string): Promise<OAuthProfile>;
  enabled(): boolean;
}

/* ---------- Google ---------- */

const googleProvider: OAuthProvider = {
  name: 'google',
  enabled: () => Boolean(env.googleClientId && env.googleClientSecret),
  authorizeUrl(state) {
    const params = new URLSearchParams({
      client_id: env.googleClientId,
      redirect_uri: env.googleRedirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      access_type: 'offline',
      prompt: 'select_account',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  },
  async exchangeCode(code) {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.googleClientId,
        client_secret: env.googleClientSecret,
        redirect_uri: env.googleRedirectUri,
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenRes.ok) throw new HttpError(400, 'OAuthExchangeFailed');
    const tokens = (await tokenRes.json()) as { access_token: string; id_token?: string };

    const userRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!userRes.ok) throw new HttpError(400, 'OAuthProfileFailed');
    const u = (await userRes.json()) as {
      sub: string;
      email: string;
      email_verified: boolean;
      name?: string;
      picture?: string;
    };
    return {
      providerAccountId: u.sub,
      email: u.email,
      emailVerified: !!u.email_verified,
      name: u.name ?? '',
      avatarUrl: u.picture ?? null,
    };
  },
};

const providers = new Map<string, OAuthProvider>([['google', googleProvider]]);
export function getOAuthProvider(name: string): OAuthProvider {
  const p = providers.get(name);
  if (!p) throw new HttpError(404, 'UnknownProvider');
  if (!p.enabled()) throw new HttpError(503, 'ProviderDisabled');
  return p;
}

/* ---------- In-memory state store (CSRF protection) ----------
 * For multi-instance deployments, swap to Redis with TTL. We keep state for 10
 * minutes which is plenty for an interactive OAuth round-trip. */
interface StateEntry { expiresAt: number; redirectTo?: string }
const states = new Map<string, StateEntry>();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of states) if (v.expiresAt < now) states.delete(k);
}, 60_000).unref?.();

export const oauthService = {
  start(providerName: string, redirectTo?: string): string {
    const p = getOAuthProvider(providerName);
    const state = randomToken(24);
    states.set(state, { expiresAt: Date.now() + 10 * 60_000, redirectTo });
    return p.authorizeUrl(state);
  },

  consumeState(state: string): { redirectTo?: string } {
    const e = states.get(state);
    if (!e) throw new HttpError(400, 'InvalidState');
    states.delete(state);
    return { redirectTo: e.redirectTo };
  },

  /**
   * Find-or-create user by OAuth profile. Linking rule: if a user already
   * exists with the same email AND that email is verified, we link. Otherwise
   * we create a new user (and trust the provider's `emailVerified` flag).
   */
  async loginOrLink(provider: string, profile: OAuthProfile, ctx: { userAgent?: string; ip?: string }) {
    const existingAccount = await AccountModel.findOne({
      provider,
      providerAccountId: profile.providerAccountId,
    });

    let userId: string;
    if (existingAccount) {
      userId = String(existingAccount.userId);
    } else {
      const existingUser = await UserModel.findOne({ email: profile.email });
      if (existingUser) {
        if (!existingUser.emailVerified && !profile.emailVerified) {
          throw new HttpError(409, 'EmailExistsUnverified');
        }
        if (profile.emailVerified && !existingUser.emailVerified) {
          existingUser.emailVerified = true;
          await existingUser.save();
        }
        userId = String(existingUser._id);
      } else {
        const created = await UserModel.create({
          email: profile.email,
          emailVerified: profile.emailVerified,
          name: profile.name,
          avatarUrl: profile.avatarUrl,
          passwordHash: null,
        });
        userId = String(created._id);
      }
      await AccountModel.create({ userId, provider, providerAccountId: profile.providerAccountId });
    }

    const user = await UserModel.findById(userId);
    if (!user) throw new HttpError(500, 'UserMissing');
    user.lastLoginAt = new Date();
    await user.save();

    const access = tokenService.signAccess(userId, user.tokenVersion ?? 0, user.role ?? 'user');
    const { token: refresh, expiresAt } = await tokenService.issueRefresh(userId, ctx);
    return { access, refresh, refreshExpiresAt: expiresAt, user: toPublicUser(user as unknown as UserDoc) };
  },
};
