import type { CookieOptions, Response } from 'express';
import { env, isProd } from '../config/env';

export const REFRESH_COOKIE = 'rt';

const base: CookieOptions = {
  httpOnly: true,
  secure: isProd,
  // In production the SPA (Vercel) and API (Render) are on different sites, so
  // the refresh cookie must be SameSite=None to be sent on cross-site requests.
  // SameSite=None mandates Secure, which prod already sets. Locally we stay on
  // Lax (same origin via the Vite proxy) since None+Secure won't work over http.
  sameSite: isProd ? 'none' : 'lax',
  path: '/api/auth',
  domain: env.cookieDomain,
};

export function setRefreshCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(REFRESH_COOKIE, token, { ...base, expires: expiresAt });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, base);
}
