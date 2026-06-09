import { api } from './http';
import type { ID } from '@/types/domain';

export interface CommentAuthor {
  id: ID;
  name: string;
  avatarUrl: string | null;
}

/** Emojis offered for comment reactions. Keep in sync with the server. */
export const REACTION_EMOJIS = ['👍', '❤️', '🎉'] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

/** A per-emoji tally on a comment, with whether the current user reacted. */
export interface CommentReaction {
  emoji: string;
  count: number;
  mine: boolean;
}

export interface Comment {
  id: ID;
  pageId: ID;
  /** Block the thread is anchored to. null = page-level comment. */
  blockId: ID | null;
  /** Snapshot of the highlighted text for selection-anchored threads. */
  quote: string | null;
  /** Root comment id when this is a reply; null for a thread root. */
  parentId: ID | null;
  authorId: ID;
  author: CommentAuthor | null;
  body: string;
  resolved: boolean;
  /** True once soft-deleted; body is blanked server-side. */
  deleted: boolean;
  /** Aggregated emoji reactions. */
  reactions: CommentReaction[];
  createdAt: string;
  updatedAt: string;
}

export const commentsApi = {
  list: (pageId: ID) => api<Comment[]>(`/comments/page/${pageId}`),
  create: (
    pageId: ID,
    input: {
      blockId: ID | null;
      parentId: ID | null;
      body: string;
      mentions?: ID[];
      quote?: string | null;
    },
  ) => api<Comment>(`/comments/page/${pageId}`, { method: 'POST', json: input }),
  update: (id: ID, body: string) =>
    api<Comment>(`/comments/${id}`, { method: 'PATCH', json: { body } }),
  remove: (id: ID) => api<{ ok: true }>(`/comments/${id}`, { method: 'DELETE' }),
  resolve: (id: ID) => api<Comment>(`/comments/${id}/resolve`, { method: 'POST' }),
  reopen: (id: ID) => api<Comment>(`/comments/${id}/reopen`, { method: 'POST' }),
  react: (id: ID, emoji: ReactionEmoji) =>
    api<Comment>(`/comments/${id}/react`, { method: 'POST', json: { emoji } }),
};
