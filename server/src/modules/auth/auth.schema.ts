import { z } from 'zod';

/**
 * Validation schemas for auth-related request bodies.
 *
 * The `validate(schema, 'body')` middleware parses `req.body` directly, so
 * these schemas describe the body shape — NOT a wrapper around `{ body: ... }`.
 */

const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128)
  .regex(/[a-z]/, 'Must include a lowercase letter')
  .regex(/[A-Z]/, 'Must include an uppercase letter')
  .regex(/[0-9]/, 'Must include a number');

export const signupSchema = z.object({
  email: z.string().email().max(254).toLowerCase(),
  password,
  name: z.string().trim().max(80).optional(),
  /** Optional CAPTCHA token. The captcha middleware enforces presence when
   *  Turnstile is configured; we keep the schema permissive so unit tests
   *  exercising the service layer don't need to know about it. */
  captchaToken: z.string().max(2048).optional(),
});

export const loginSchema = z.object({
  email: z.string().email().max(254).toLowerCase(),
  password: z.string().min(1).max(128),
  captchaToken: z.string().max(2048).optional(),
});

export const requestVerifySchema = z.object({
  email: z.string().email().max(254).toLowerCase(),
  captchaToken: z.string().max(2048).optional(),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(16).max(256),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email().max(254).toLowerCase(),
  captchaToken: z.string().max(2048).optional(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(16).max(256),
  password,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: password,
});

/** Used by OAuth-only accounts to set a password for the first time. */
export const setPasswordSchema = z.object({
  token: z.string().min(16).max(256),
  password,
});

export const updateProfileSchema = z.object({
  name: z.string().trim().max(80).optional(),
  username: z
    .string()
    .trim()
    .min(3)
    .max(32)
    .regex(/^[a-z0-9_]+$/i, 'Letters, numbers, underscore only')
    .optional()
    .nullable(),
  bio: z.string().max(280).optional(),
  themePref: z.enum(['system', 'light', 'dark']).optional(),
});

/** Account self-deletion. Password optional because OAuth-only accounts
 *  haven't set one; the route still enforces a fresh session for both
 *  cases via the `requireFreshUser` middleware. */
export const deleteAccountSchema = z.object({
  currentPassword: z.string().min(1).max(128).optional(),
  /** Free-form, user-supplied reason. Stored in audit log meta. */
  reason: z.string().trim().max(500).optional(),
  /** Type-to-confirm guard: the client must echo this exact string. */
  confirm: z.literal('DELETE'),
});
