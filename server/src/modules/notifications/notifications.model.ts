import { Schema, model, Types, type InferSchemaType } from 'mongoose';

/** Kinds of in-app notification. Extend as new event sources appear. */
export const NOTIFICATION_TYPES = ['comment_mention', 'comment_reply'] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/**
 * A per-recipient notification row.
 *
 * One row per (recipient × event). The same comment that mentions three
 * people produces three rows so each recipient owns their own read state.
 *
 * `actorId` is who triggered it, `userId` is who receives it. We denormalise
 * the page/comment/block ids so the client can deep-link without a join, and
 * a short `preview` of the comment body so the dropdown renders without a
 * second fetch.
 */
const notificationSchema = new Schema(
  {
    workspaceId: { type: Types.ObjectId, ref: 'Workspace', required: true, index: true },
    userId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    actorId: { type: Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    pageId: { type: Types.ObjectId, ref: 'Page', required: true },
    commentId: { type: Types.ObjectId, ref: 'Comment', default: null },
    blockId: { type: String, default: null },
    preview: { type: String, default: '' },
    read: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

// Hot path: a user's notifications in one workspace, newest-first.
notificationSchema.index({ userId: 1, workspaceId: 1, createdAt: -1 });

export type Notification = InferSchemaType<typeof notificationSchema>;
export const NotificationModel = model('Notification', notificationSchema);
