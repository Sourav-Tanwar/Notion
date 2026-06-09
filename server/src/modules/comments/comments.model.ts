import { Schema, model, Types, type InferSchemaType } from 'mongoose';

/**
 * A comment on a page or a specific block.
 *
 * Threading model
 * ---------------
 * A "thread" is a root comment (`parentId === null`) plus its replies
 * (`parentId === <root id>`). We deliberately keep replies one level deep —
 * Notion does the same — so the UI never has to render arbitrary nesting.
 *
 * `resolved` lives only on the root comment; replies inherit the thread's
 * resolved state. Resolving a reply resolves its root (handled in service).
 *
 * `blockId` anchors the thread to a block. `null` means a page-level comment
 * (shown only in the drawer, not pinned to any block). Replies copy their
 * root's `blockId` so a single query can group everything by block.
 *
 * Soft delete: we set `deletedAt` and blank the body rather than removing the
 * row, so a thread keeps its shape ("[deleted]") even after the root author
 * removes their message.
 */
const commentSchema = new Schema(
  {
    workspaceId: { type: Types.ObjectId, ref: 'Workspace', required: true, index: true },
    pageId: { type: Types.ObjectId, ref: 'Page', required: true, index: true },
    blockId: { type: String, default: null, index: true },
    /** Snapshot of the highlighted text for selection-anchored threads. */
    quote: { type: String, default: null },
    parentId: { type: Types.ObjectId, ref: 'Comment', default: null, index: true },
    authorId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    body: { type: String, required: true, maxlength: 10_000 },
    resolved: { type: Boolean, default: false, index: true },
    /**
     * Emoji reactions. One sub-doc per (user, emoji) pair; a user may react
     * with several different emojis but never twice with the same one
     * (enforced in the service). Counts/own-state are derived in the DTO.
     */
    reactions: {
      type: [
        {
          _id: false,
          emoji: { type: String, required: true },
          userId: { type: Types.ObjectId, ref: 'User', required: true },
        },
      ],
      default: [],
    },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Hot path: list every comment on a page, grouped by block, oldest-first.
commentSchema.index({ pageId: 1, blockId: 1, createdAt: 1 });

export type Comment = InferSchemaType<typeof commentSchema>;
export const CommentModel = model('Comment', commentSchema);
