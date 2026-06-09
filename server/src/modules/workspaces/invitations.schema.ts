import { z } from 'zod';

export const createInvitationSchema = z.object({
  email: z.string().email().max(254),
  role: z.enum(['admin', 'member', 'guest']),
});

export const tokenParamSchema = z.object({
  token: z.string().min(20).max(128),
});
