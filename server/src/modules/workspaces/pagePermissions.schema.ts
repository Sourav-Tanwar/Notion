import { z } from 'zod';
import { GRANTABLE_LEVELS } from './pagePermissions';

export const pagePermissionUpsertSchema = z.object({
  userId: z.string().length(24),
  level: z.enum(GRANTABLE_LEVELS as unknown as [string, ...string[]]),
});

export const findCandidateSchema = z.object({
  email: z.string().email().max(254),
});
