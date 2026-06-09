import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { validate } from '../../middleware/validate.middleware';
import { authGuard, requireFreshUser, type AuthedRequest } from '../../middleware/auth.middleware';
import {
  loginLimiter,
  passwordResetLimiter,
  sensitiveLimiter,
  signupLimiter,
} from '../../middleware/rateLimit.middleware';
import { requireCaptcha } from '../../middleware/captcha.middleware';
import { authService } from './auth.service';
import { sessionsService } from './sessions.service';
import { tokenService } from './token.service';
import { oauthService } from './oauth.service';
import {
  changePasswordSchema,
  deleteAccountSchema,
  forgotPasswordSchema,
  loginSchema,
  requestVerifySchema,
  resetPasswordSchema,
  setPasswordSchema,
  signupSchema,
  verifyEmailSchema,
} from './auth.schema';
import { HttpError } from '../../utils/HttpError';
import { clearRefreshCookie, REFRESH_COOKIE, setRefreshCookie } from '../../utils/cookies';
import { env } from '../../config/env';
import { audit } from '../../services/audit.service';

export const authRouter = Router();

const ctx = (req: AuthedRequest) => ({
  userAgent: req.get('user-agent') ?? '',
  ip: req.ip ?? '',
});

/* ---------- Email / password ---------- */

authRouter.post(
  '/signup',
  signupLimiter,
  validate(signupSchema),
  requireCaptcha(),
  asyncHandler(async (req, res) => {
    const { email, password, name } = req.body;
    await authService.signup(email, password, name, ctx(req));
    // ANTI-ENUMERATION: identical response whether or not the email existed.
    // The user proves inbox possession via the email link, then signs in.
    res.json({ ok: true, requiresVerification: true });
  }),
);

authRouter.post(
  '/login',
  loginLimiter,
  validate(loginSchema),
  requireCaptcha(),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const r = await authService.login(email, password, ctx(req));
    setRefreshCookie(res, r.refresh, r.refreshExpiresAt);
    res.json({ accessToken: r.access, user: r.user });
  }),
);

authRouter.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const presented = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    if (!presented) throw new HttpError(401, 'NoRefresh');
    const r = await tokenService.rotate(presented, ctx(req));
    setRefreshCookie(res, r.refresh, r.refreshExpiresAt);
    const user = await authService.me(r.userId);
    res.json({ accessToken: r.access, user });
  }),
);

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const presented = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    if (presented) await tokenService.revoke(presented);
    clearRefreshCookie(res);
    res.json({ ok: true });
  }),
);

authRouter.post(
  '/logout-all',
  authGuard,
  asyncHandler(async (req: AuthedRequest, res) => {
    await tokenService.revokeAll(req.userId!);
    audit.log('logout.all', { userId: req.userId!, ip: req.ip, userAgent: req.get('user-agent') ?? '' });
    clearRefreshCookie(res);
    res.json({ ok: true });
  }),
);

authRouter.get(
  '/me',
  authGuard,
  asyncHandler(async (req: AuthedRequest, res) => {
    res.json(await authService.me(req.userId!));
  }),
);

/* ---------- Email verification ---------- */

authRouter.post(
  '/request-verify',
  sensitiveLimiter,
  validate(requestVerifySchema),
  requireCaptcha(),
  asyncHandler(async (req, res) => {
    await authService.resendVerification(req.body.email);
    res.json({ ok: true });
  }),
);

authRouter.post(
  '/verify-email',
  validate(verifyEmailSchema),
  asyncHandler(async (req, res) => {
    const user = await authService.verifyEmail(req.body.token);
    res.json({ user });
  }),
);

/* ---------- Password reset ---------- */

authRouter.post(
  '/forgot-password',
  passwordResetLimiter,
  validate(forgotPasswordSchema),
  requireCaptcha(),
  asyncHandler(async (req, res) => {
    await authService.forgotPassword(req.body.email);
    res.json({ ok: true }); // always 200 (no enumeration)
  }),
);

authRouter.post(
  '/reset-password',
  passwordResetLimiter,
  validate(resetPasswordSchema),
  asyncHandler(async (req, res) => {
    await authService.resetPassword(req.body.token, req.body.password);
    res.json({ ok: true });
  }),
);

authRouter.post(
  '/change-password',
  authGuard,
  requireFreshUser,
  sensitiveLimiter,
  validate(changePasswordSchema),
  asyncHandler(async (req: AuthedRequest, res) => {
    await authService.changePassword(req.userId!, req.body.currentPassword, req.body.newPassword);
    clearRefreshCookie(res);
    res.json({ ok: true });
  }),
);

/* ---------- Password setup (OAuth-only accounts) ---------- */

authRouter.post(
  '/request-password-setup',
  authGuard,
  requireFreshUser,
  sensitiveLimiter,
  asyncHandler(async (req: AuthedRequest, res) => {
    await authService.requestPasswordSetup(req.userId!);
    res.json({ ok: true });
  }),
);

authRouter.post(
  '/set-password',
  passwordResetLimiter,
  validate(setPasswordSchema),
  asyncHandler(async (req, res) => {
    await authService.setPassword(req.body.token, req.body.password);
    clearRefreshCookie(res);
    res.json({ ok: true });
  }),
);

/* ---------- Sessions (active devices) ---------- */

authRouter.get(
  '/sessions',
  authGuard,
  asyncHandler(async (req: AuthedRequest, res) => {
    const presented = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    res.json({ sessions: await sessionsService.list(req.userId!, presented) });
  }),
);

authRouter.delete(
  '/sessions/others',
  authGuard,
  requireFreshUser,
  asyncHandler(async (req: AuthedRequest, res) => {
    const presented = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    const revoked = await sessionsService.revokeOthers(req.userId!, presented, {
      ip: req.ip,
      userAgent: req.get('user-agent') ?? '',
    });
    res.json({ ok: true, revoked });
  }),
);

authRouter.delete(
  '/sessions/:id',
  authGuard,
  requireFreshUser,
  asyncHandler(async (req: AuthedRequest, res) => {
    await sessionsService.revoke(req.userId!, req.params.id, {
      ip: req.ip,
      userAgent: req.get('user-agent') ?? '',
    });
    res.json({ ok: true });
  }),
);

/* ---------- Account self-deletion ---------- */

authRouter.delete(
  '/me',
  authGuard,
  requireFreshUser,
  sensitiveLimiter,
  validate(deleteAccountSchema),
  asyncHandler(async (req: AuthedRequest, res) => {
    await authService.deleteAccount(req.userId!, {
      reauthPassword: req.body.currentPassword,
      reason: req.body.reason,
      ctx: { ip: req.ip, userAgent: req.get('user-agent') ?? '' },
    });
    clearRefreshCookie(res);
    res.json({ ok: true });
  }),
);

/* ---------- Public config (used by SPA to know if Turnstile is on) ---------- */

authRouter.get('/config', (_req, res) => {
  res.json({
    captcha: env.turnstileSiteKey ? { provider: 'turnstile', siteKey: env.turnstileSiteKey } : null,
    emailVerificationRequired: env.emailVerificationRequired,
  });
});

/* ---------- OAuth ---------- */
authRouter.get(
  '/oauth/:provider/start',
  asyncHandler(async (req, res) => {
    const url = oauthService.start(req.params.provider, (req.query.redirect as string | undefined) ?? '/');
    res.redirect(url);
  }),
);

authRouter.get(
  '/oauth/:provider/callback',
  asyncHandler(async (req: AuthedRequest, res) => {
    const provider = req.params.provider;
    const code = req.query.code as string | undefined;
    const state = req.query.state as string | undefined;
    if (!code || !state) throw new HttpError(400, 'OAuthMissingParams');
    const { redirectTo } = oauthService.consumeState(state);
    const { getOAuthProvider } = await import('./oauth.service');
    const profile = await getOAuthProvider(provider).exchangeCode(code);
    const r = await oauthService.loginOrLink(provider, profile, ctx(req));
    setRefreshCookie(res, r.refresh, r.refreshExpiresAt);
    // Hand the access token off to the SPA via a one-shot URL fragment.
    // The frontend's OAuth-callback page reads it, calls /refresh to clear
    // the URL, and then drops it into in-memory storage. The fragment is
    // never sent to the server.
    const url = new URL(`${env.clientOrigin}/oauth/callback`);
    url.searchParams.set('next', redirectTo ?? '/');
    res.redirect(`${url.toString()}#access=${encodeURIComponent(r.access)}`);
  }),
);
