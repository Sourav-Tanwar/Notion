import { z } from 'zod';

export const createCommentSchema = z.object({
  /** Block to anchor the thread to. null = page-level comment. */
  blockId: z.string().min(1).nullable().default(null),
  /** Root comment id when this is a reply; null for a new thread. */
  parentId: z.string().min(1).nullable().default(null),
  body: z.string().trim().min(1).max(10_000),
  /** User ids @-mentioned in the body. Server validates membership. */
  mentions: z.array(z.string()).max(50).default([]),
  /** Snapshot of the highlighted text when the thread anchors to a selection. */
  quote: z.string().max(500).nullable().default(null),
});

export const updateCommentSchema = z.object({
  body: z.string().trim().min(1).max(10_000),
});

/** Emojis the UI offers for comment reactions. Keep server + client in sync. */
export const REACTION_EMOJIS = ['👍', '❤️', '🎉'] as const;

export const reactCommentSchema = z.object({
  emoji: z.enum(REACTION_EMOJIS),
});

export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type UpdateCommentInput = z.infer<typeof updateCommentSchema>;
export type ReactCommentInput = z.infer<typeof reactCommentSchema>;
