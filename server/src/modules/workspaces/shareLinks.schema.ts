import { z } from 'zod';

/**
 * Password rules deliberately looser than account passwords: this is a
 * convenience gate on an already-tokenized URL, not a primary credential.
 * Minimum 4 chars, max 128.
 */
const sharePassword = z.string().min(4).max(128);

/** ISO date string in the future. Null clears any existing expiry. */
const expiresAt = z
  .string()
  .datetime()
  .refine((s) => new Date(s).getTime() > Date.now(), { message: 'must be in the future' })
  .nullable();

export const createShareLinkSchema = z.object({
  password: sharePassword.optional(),
  expiresAt: expiresAt.optional(),
  includeSubpages: z.boolean().optional(),
});

export const updateShareLinkSchema = z
  .object({
    /** `null` clears the password gate; a string sets a new one. */
    password: sharePassword.nullable().optional(),
    expiresAt: expiresAt.optional(),
    includeSubpages: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'no fields to update' });

export const unlockShareLinkSchema = z.object({
  password: z.string().min(1).max(128),
});

export type CreateShareLinkInput = z.infer<typeof createShareLinkSchema>;
export type UpdateShareLinkInput = z.infer<typeof updateShareLinkSchema>;
