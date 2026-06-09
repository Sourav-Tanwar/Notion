import type { NextFunction, Response } from 'express';
import type { AuthedRequest } from './auth.middleware';
import { captchaService } from '../services/captcha.service';
import { HttpError } from '../utils/HttpError';

/**
 * Express middleware factory: require a valid Turnstile token on selected
 * routes. The token is expected in `req.body.captchaToken` or the
 * `cf-turnstile-response` header (matching the official client widget).
 *
 * Returns a 400 with code `CaptchaRequired` when the secret is configured
 * AND the token is missing/invalid. Endpoints that legitimately need to be
 * callable from server-to-server contexts should NOT use this middleware.
 */
export function requireCaptcha() {
  return async (req: AuthedRequest, _res: Response, next: NextFunction): Promise<void> => {
    if (!captchaService.enabled()) return next();
    const token =
      (req.body && typeof req.body.captchaToken === 'string' ? req.body.captchaToken : undefined) ??
      (req.headers['cf-turnstile-response'] as string | undefined);
    const r = await captchaService.verify(token, {
      ip: req.ip,
      email: req.body?.email,
      userAgent: req.get('user-agent') ?? '',
    });
    if (!r.ok) return next(new HttpError(400, 'CaptchaRequired'));
    next();
  };
}
