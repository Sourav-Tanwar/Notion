import bcrypt from 'bcryptjs';
import { env } from '../../config/env';
import { HttpError } from '../../utils/HttpError';
import { randomToken, sha256 } from '../../utils/crypto';
import { AccountModel, RefreshTokenModel, UserModel, VerificationTokenModel, type UserDoc } from './auth.model';
import { tokenService } from './token.service';
import {
  accountAlreadyExistsTemplate,
  getEmailService,
  passwordResetTemplate,
  passwordSetupTemplate,
  verifyEmailTemplate,
} from '../../services/email.service';
import { getStorage } from '../../services/storage.service';
import { audit } from '../../services/audit.service';

export interface PublicUser {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string;
  username: string | null;
  bio: string;
  avatarUrl: string | null;
  role: string;
  themePref: 'system' | 'light' | 'dark';
  /** True iff a password credential exists on the account.
   *  Used by the SPA to render "Change password" vs "Set a password" UX for
   *  OAuth-only accounts without leaking the actual hash. */
  hasPassword: boolean;
}

export function toPublicUser(u: UserDoc): PublicUser {
  return {
    id: String(u._id),
    email: u.email,
    emailVerified: u.emailVerified,
    name: u.name ?? '',
    username: u.username ?? null,
    bio: u.bio ?? '',
    avatarUrl: u.avatarUrl ?? null,
    role: u.role ?? 'user',
    themePref: (u.themePref ?? 'system') as 'system' | 'light' | 'dark',
    hasPassword: !!u.passwordHash,
  };
}

const VERIFY_TTL_MS = 24 * 60 * 60_000;
const RESET_TTL_MS = 30 * 60_000;
const SETUP_TTL_MS = 60 * 60_000;

async function createVerificationToken(
  userId: string,
  purpose: 'email-verify' | 'password-reset' | 'password-set',
  ttlMs: number,
) {
  const raw = randomToken(32);
  await VerificationTokenModel.create({
    userId,
    purpose,
    tokenHash: sha256(raw),
    expiresAt: new Date(Date.now() + ttlMs),
  });
  return raw;
}

async function sendVerificationEmail(user: UserDoc): Promise<void> {
  const raw = await createVerificationToken(String(user._id), 'email-verify', VERIFY_TTL_MS);
  const link = `${env.clientOrigin}/verify-email?token=${encodeURIComponent(raw)}`;
  const msg = verifyEmailTemplate(user.name ?? '', link);
  msg.to = user.email;
  await getEmailService().send(msg);
}

export const authService = {
  /* ---------- Signup ----------
   *
   * Anti-enumeration contract: this method NEVER throws / returns a different
   * response shape based on whether the email already exists. Callers cannot
   * tell from the return value alone whether a new account was created.
   *
   *  - Fresh email → create user, send verification email, return `created=true`.
   *  - Existing email → send "someone tried to sign up" email to the inbox
   *                     (only the real owner ever reads it), return `created=false`
   *                     but still report success at the HTTP layer.
   *
   * No access/refresh tokens are issued on signup. The user proves possession
   * of the inbox first, then signs in normally. This also makes the OAuth
   * path the one place that auto-attaches a session, which keeps that high-
   * privilege moment auditable in exactly one location.
   */
  async signup(
    email: string,
    password: string,
    name: string | undefined,
    ctx: { userAgent?: string; ip?: string },
  ): Promise<{ created: boolean; email: string }> {
    const normalised = email.toLowerCase().trim();
    const existing = await UserModel.findOne({ email: normalised });
    if (existing) {
      // Deleted accounts are treated like "available" to the world but we still
      // do not resurrect them silently — we send the same "someone tried" mail.
      const loginLink = `${env.clientOrigin}/login`;
      const resetLink = `${env.clientOrigin}/forgot-password`;
      const msg = accountAlreadyExistsTemplate(existing.name ?? '', loginLink, resetLink);
      msg.to = existing.email;
      // Do not await — keep the request short and timing-stable.
      getEmailService().send(msg).catch(() => undefined);
      audit.log('signup.duplicate', {
        userId: String(existing._id),
        email: existing.email,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      return { created: false, email: normalised };
    }
    const passwordHash = await bcrypt.hash(password, env.bcryptRounds);
    const user = await UserModel.create({
      email: normalised,
      passwordHash,
      name,
    });
    sendVerificationEmail(user as unknown as UserDoc).catch((e) => {
      // eslint-disable-next-line no-console
      console.warn('[auth] verify email send failed:', (e as Error).message);
    });
    audit.log('signup.created', {
      userId: String(user._id),
      email: user.email,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return { created: true, email: normalised };
  },

  /* ---------- Login ---------- */
  async login(email: string, password: string, ctx: { userAgent?: string; ip?: string }) {
    const user = await UserModel.findOne({ email });
    // Always run bcrypt to avoid leaking user existence via response timing.
    const fakeHash = '$2a$12$0000000000000000000000000000000000000000000000000000';
    const hash = user?.passwordHash ?? fakeHash;
    const ok = await bcrypt.compare(password, hash);
    if (!user || !user.passwordHash || !ok || user.deletedAt) {
      audit.log('login.failed', { email, ip: ctx.ip, userAgent: ctx.userAgent });
      throw new HttpError(401, 'InvalidCredentials');
    }

    user.lastLoginAt = new Date();
    await user.save();
    audit.log('login.success', {
      userId: String(user._id),
      email: user.email,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    const access = tokenService.signAccess(String(user._id), user.tokenVersion ?? 0, user.role ?? 'user');
    const { token: refresh, expiresAt } = await tokenService.issueRefresh(String(user._id), ctx);
    return { access, refresh, refreshExpiresAt: expiresAt, user: toPublicUser(user as unknown as UserDoc) };
  },

  /* ---------- Me ---------- */
  async me(userId: string): Promise<PublicUser> {
    const u = await UserModel.findById(userId);
    if (!u) throw new HttpError(404, 'NotFound');
    return toPublicUser(u as unknown as UserDoc);
  },

  /* ---------- Email verification ---------- */
  async resendVerification(email: string): Promise<void> {
    const user = await UserModel.findOne({ email });
    if (!user || user.emailVerified) return; // silent (no enumeration)
    await sendVerificationEmail(user as unknown as UserDoc);
  },

  async verifyEmail(rawToken: string): Promise<PublicUser> {
    const tokenHash = sha256(rawToken);
    const record = await VerificationTokenModel.findOne({ tokenHash, purpose: 'email-verify' });
    if (!record || record.consumedAt || record.expiresAt < new Date()) {
      throw new HttpError(400, 'InvalidOrExpiredToken');
    }
    record.consumedAt = new Date();
    await record.save();
    const user = await UserModel.findByIdAndUpdate(record.userId, { emailVerified: true }, { new: true });
    if (!user) throw new HttpError(404, 'NotFound');
    audit.log('email.verified', { userId: String(user._id), email: user.email });
    return toPublicUser(user as unknown as UserDoc);
  },

  /* ---------- Password reset ---------- */
  async forgotPassword(email: string): Promise<void> {
    const user = await UserModel.findOne({ email });
    if (!user) return; // silent: prevents account enumeration
    const raw = await createVerificationToken(String(user._id), 'password-reset', RESET_TTL_MS);
    const link = `${env.clientOrigin}/reset-password?token=${encodeURIComponent(raw)}`;
    const msg = passwordResetTemplate(user.name ?? '', link);
    msg.to = user.email;
    await getEmailService().send(msg);
  },

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const tokenHash = sha256(rawToken);
    const record = await VerificationTokenModel.findOne({ tokenHash, purpose: 'password-reset' });
    if (!record || record.consumedAt || record.expiresAt < new Date()) {
      throw new HttpError(400, 'InvalidOrExpiredToken');
    }
    record.consumedAt = new Date();
    await record.save();
    const passwordHash = await bcrypt.hash(newPassword, env.bcryptRounds);
    // Bumping tokenVersion invalidates every outstanding access token.
    await UserModel.updateOne(
      { _id: record.userId },
      { passwordHash, $inc: { tokenVersion: 1 } },
    );
    // Revoke every active refresh token too.
    await tokenService.revokeAll(String(record.userId));
    audit.log('password.reset', { userId: String(record.userId) });
  },

  /* ---------- Change password (authenticated) ---------- */
  async changePassword(userId: string, current: string, next: string): Promise<void> {
    const user = await UserModel.findById(userId);
    if (!user) throw new HttpError(404, 'NotFound');
    if (!user.passwordHash) throw new HttpError(400, 'NoPasswordSet');
    const ok = await bcrypt.compare(current, user.passwordHash);
    if (!ok) throw new HttpError(401, 'InvalidCredentials');
    user.passwordHash = await bcrypt.hash(next, env.bcryptRounds);
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    await user.save();
    await tokenService.revokeAll(userId);
    audit.log('password.changed', { userId, email: user.email });
  },

  /* ---------- Password setup (OAuth-only accounts) ----------
   * Why this differs from a plain reset:
   *  - Only an authenticated, password-less user may *request* a setup link.
   *    We don't want an attacker who knows an OAuth user's email to silently
   *    create a password credential. Anchoring to the session proves the
   *    requester controls the account at this very moment.
   *  - The email itself goes to the verified address on file, so the link is
   *    a *second factor* even though the request was already authenticated. */
  async requestPasswordSetup(userId: string): Promise<void> {
    const user = await UserModel.findById(userId);
    if (!user) throw new HttpError(404, 'NotFound');
    if (user.passwordHash) throw new HttpError(409, 'PasswordAlreadySet');
    const raw = await createVerificationToken(String(user._id), 'password-set', SETUP_TTL_MS);
    const link = `${env.clientOrigin}/set-password?token=${encodeURIComponent(raw)}`;
    const msg = passwordSetupTemplate(user.name ?? '', link);
    msg.to = user.email;
    await getEmailService().send(msg);
  },

  /** Consume a setup token + write the very first password. Unauthenticated
   *  by design — the token IS the proof of possession of the email inbox. */
  async setPassword(rawToken: string, password: string): Promise<void> {
    const tokenHash = sha256(rawToken);
    const record = await VerificationTokenModel.findOne({ tokenHash, purpose: 'password-set' });
    if (!record || record.consumedAt || record.expiresAt < new Date()) {
      throw new HttpError(400, 'InvalidOrExpiredToken');
    }
    const user = await UserModel.findById(record.userId);
    if (!user) throw new HttpError(404, 'NotFound');
    // Refuse if a password was set since the token was minted — prevents an old
    // setup link from silently overwriting a newly chosen credential.
    if (user.passwordHash) throw new HttpError(409, 'PasswordAlreadySet');
    record.consumedAt = new Date();
    await record.save();
    user.passwordHash = await bcrypt.hash(password, env.bcryptRounds);
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    await user.save();
    // Force re-login on all devices for clarity (credentials changed).
    await tokenService.revokeAll(String(user._id));
    audit.log('password.set', { userId: String(user._id), email: user.email });
  },

  /* ---------- Account deletion ----------
   *
   * We perform a *soft scrub*: the User document remains but is anonymised
   * and marked `deletedAt`. This gives us:
   *  - GDPR "right to erasure" compliance (PII is removed, not retained).
   *  - A re-signup detection window (anti-enumeration email still works).
   *  - An audit trail row identified by an opaque stub, not personal data.
   *  - Cheap reversal if the user emails support within minutes.
   *
   * Cascading data:
   *  - Personal content (pages, blocks) is OUT OF SCOPE for this auth-module
   *    file. The route handler invokes a separate cascade hook so each module
   *    owns its own data lifecycle (see `index.ts` registration).
   *  - Refresh tokens, OAuth account links, verification tokens, avatar files
   *    — all torn down here because they live in the auth module.
   */
  async deleteAccount(
    userId: string,
    opts: { reauthPassword?: string; reason?: string; ctx: { ip?: string; userAgent?: string } },
  ): Promise<void> {
    const user = await UserModel.findById(userId);
    if (!user || user.deletedAt) throw new HttpError(404, 'NotFound');

    // Re-auth: password users must re-supply credentials. OAuth-only users are
    // already authenticated by the access token + the fact they reached this
    // endpoint over a fresh session (callers should also use requireFreshUser).
    if (user.passwordHash) {
      if (!opts.reauthPassword) throw new HttpError(400, 'ReauthRequired');
      const ok = await bcrypt.compare(opts.reauthPassword, user.passwordHash);
      if (!ok) throw new HttpError(401, 'InvalidCredentials');
    }

    const oldEmail = user.email;
    const oldAvatarUrl = user.avatarUrl;

    // Anonymise. The email becomes an opaque sentinel so the unique index
    // doesn't reserve the real address forever — the original owner can
    // re-sign-up with the same email later if they wish.
    user.email = `deleted+${String(user._id)}@deleted.local`;
    user.passwordHash = null;
    user.name = '';
    user.username = null;
    user.bio = '';
    user.avatarUrl = null;
    user.emailVerified = false;
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    user.deletedAt = new Date();
    await user.save();

    // Tear down auth-module data.
    await RefreshTokenModel.deleteMany({ userId });
    await VerificationTokenModel.deleteMany({ userId });
    await AccountModel.deleteMany({ userId });

    // Best-effort avatar file cleanup.
    if (oldAvatarUrl) {
      try {
        const idx = oldAvatarUrl.indexOf('/avatars/');
        if (idx >= 0) await getStorage().remove(oldAvatarUrl.slice(idx + 1));
      } catch {
        /* ignore */
      }
    }

    // Run any registered cascade hooks (pages/blocks/etc). See index.ts.
    for (const hook of accountDeletionHooks) {
      try {
        await hook(userId);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[auth] account-deletion hook failed:', (e as Error).message);
      }
    }

    audit.log('account.deleted', {
      userId,
      email: oldEmail,
      ip: opts.ctx.ip,
      userAgent: opts.ctx.userAgent,
      meta: { reason: opts.reason ?? null },
    });
  },
};

/* ---------------------------------------------------------------------------
 * Account-deletion cascade registry
 *
 * Other modules (pages, blocks, comments…) register a hook here so the auth
 * module never needs to import them. Hooks run sequentially after the user
 * has been anonymised but before the response is sent. They MUST be idempotent
 * because a partial failure does not unwind earlier hooks.
 * ------------------------------------------------------------------------- */
type DeletionHook = (userId: string) => Promise<void> | void;
const accountDeletionHooks: DeletionHook[] = [];
export function registerAccountDeletionHook(fn: DeletionHook): void {
  accountDeletionHooks.push(fn);
}
