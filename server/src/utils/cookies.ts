import type { CookieOptions, Response } from 'express';
import { env, isProd } from '../config/env';

export const REFRESH_COOKIE = 'rt';

const base: CookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: 'lax',
  path: '/api/auth',
  domain: env.cookieDomain,
};

export function setRefreshCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(REFRESH_COOKIE, token, { ...base, expires: expiresAt });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, base);
}
