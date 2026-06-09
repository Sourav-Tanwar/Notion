import { z } from 'zod';

// Roles assignable via the API. `owner` is reserved for transfer flows.
const assignableRole = z.enum(['admin', 'member', 'guest']);

export const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(80),
  iconEmoji: z.string().max(8).optional(),
});

export const updateWorkspaceSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  iconEmoji: z.string().max(8).optional(),
});

export const updateMemberSchema = z.object({
  role: assignableRole,
});

export const transferOwnershipSchema = z.object({
  toUserId: z.string().length(24),
});

export const workspaceRoleSchema = z.enum(['owner', 'admin', 'member', 'guest']);
