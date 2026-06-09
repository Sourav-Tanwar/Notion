import rateLimit from 'express-rate-limit';

const ipKey = (ip: string): string => (ip || 'unknown').replace(/[:\.]/g, '_');

/**
 * Rate limits scoped to the abuse-prone auth endpoints. In a multi-instance
 * deployment, swap the default in-memory store for `rate-limit-redis`. Keying
 * on IP + email (when present) lets an attacker test other users without
 * blocking the current user — exactly the opposite of what we want — so we
 * key on the email when the request is account-targeted.
 */

const message = { error: 'TooManyRequests' };

export const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message,
  keyGenerator: (req) => `${ipKey(req.ip ?? '')}:${(req.body?.email ?? '').toLowerCase()}`,
});

export const signupLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message,
});

export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message,
  keyGenerator: (req) => `${ipKey(req.ip ?? '')}:${(req.body?.email ?? '').toLowerCase()}`,
});

export const sensitiveLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message,
});

/**
 * Restore-from-history is destructive and writes a fresh history row
 * (the "before" snapshot) every time it runs, so a runaway client could
 * otherwise both clobber the page and exhaust the retention buffer.
 * Cap per user (falls back to IP for unauth, but the route requires
 * auth so that branch is dead).
 */
export const restoreLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message,
  keyGenerator: (req) => {
    const userId = (req as unknown as { userId?: string }).userId;
    return userId ?? `ip:${ipKey(req.ip ?? '')}`;
  },
});
