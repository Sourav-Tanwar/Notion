import { env } from '../config/env';
import { audit } from './audit.service';

/**
 * Cloudflare Turnstile verifier (siteverify v0).
 *
 * Why we wrap it in a service:
 *  - The rest of the codebase shouldn't know which CAPTCHA vendor we use.
 *  - One place to swap providers (hCaptcha, reCAPTCHA Enterprise, Arkose).
 *  - Soft-fail when `TURNSTILE_SECRET` is unset → local dev / CI keep working
 *    without anyone needing a Cloudflare account. Production wiring enforces
 *    presence via the env loader if you wish (see `env.ts`).
 *
 * Why we hash by token (and not just trust it):
 *  - Turnstile tokens are one-shot. Cloudflare rejects replays themselves; we
 *    don't keep a local cache because doing so without a TTL store across
 *    instances would create a false negative when the same token legitimately
 *    arrives at a different instance during retries.
 */

const TURNSTILE_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export interface CaptchaContext {
  ip?: string;
  email?: string;
  userAgent?: string;
}

export interface CaptchaResult {
  ok: boolean;
  reason?: string;
}

export const captchaService = {
  /** True when the service is enabled (secret configured). Surface helpers
   *  can branch UI on this; routes always still call `verify`. */
  enabled(): boolean {
    return !!env.turnstileSecret;
  },

  async verify(token: string | undefined, ctx: CaptchaContext = {}): Promise<CaptchaResult> {
    if (!this.enabled()) {
      // No secret configured → permit, but never auto-permit if a token was
      // sent (caller misconfiguration; treat as a soft warning).
      return { ok: true };
    }
    if (!token || typeof token !== 'string') {
      audit.log('captcha.failed', { ip: ctx.ip, email: ctx.email, userAgent: ctx.userAgent, meta: { reason: 'missing' } });
      return { ok: false, reason: 'missing' };
    }
    try {
      const body = new URLSearchParams({ secret: env.turnstileSecret!, response: token });
      if (ctx.ip) body.set('remoteip', ctx.ip);
      const res = await fetch(TURNSTILE_URL, {
        method: 'POST',
        body,
        // 4-second cap; Turnstile responds in ~100ms typically.
        signal: AbortSignal.timeout(4_000),
      });
      const data = (await res.json()) as { success: boolean; 'error-codes'?: string[] };
      if (!data.success) {
        audit.log('captcha.failed', {
          ip: ctx.ip,
          email: ctx.email,
          userAgent: ctx.userAgent,
          meta: { codes: data['error-codes'] ?? [] },
        });
        return { ok: false, reason: (data['error-codes'] ?? []).join(',') || 'verify_failed' };
      }
      return { ok: true };
    } catch (e) {
      // Network/timeout — fail OPEN if explicitly configured, otherwise CLOSED.
      // Default is CLOSED to honour security-over-availability.
      if (env.turnstileFailOpen) return { ok: true };
      audit.log('captcha.failed', {
        ip: ctx.ip,
        email: ctx.email,
        userAgent: ctx.userAgent,
        meta: { error: (e as Error).message },
      });
      return { ok: false, reason: 'verify_unavailable' };
    }
  },
};
