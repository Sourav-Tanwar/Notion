import { Types, isValidObjectId } from 'mongoose';
import { NotificationModel, type NotificationType } from './notifications.model';
import { UserModel } from '../auth/auth.model';
import { PageModel } from '../pages/pages.model';
import { HttpError } from '../../utils/HttpError';

interface ActorLite {
  id: string;
  name: string;
  avatarUrl: string | null;
}

const toDTO = (n: any, actor: ActorLite | null, pageTitle: string | null) => ({
  id: String(n._id),
  type: n.type as NotificationType,
  pageId: String(n.pageId),
  pageTitle,
  commentId: n.commentId ? String(n.commentId) : null,
  blockId: n.blockId ?? null,
  preview: n.preview ?? '',
  actor,
  read: !!n.read,
  createdAt: n.createdAt instanceof Date ? n.createdAt.toISOString() : n.createdAt,
});

export type NotificationDTO = ReturnType<typeof toDTO>;

export interface CreateNotificationInput {
  workspaceId: string;
  userId: string; // recipient
  actorId: string;
  type: NotificationType;
  pageId: string;
  commentId?: string | null;
  blockId?: string | null;
  preview?: string;
}

export const notificationsService = {
  /**
   * Bulk-create notifications, skipping any where the recipient is the actor
   * (you never notify yourself) and de-duping recipients within one event.
   */
  async createMany(inputs: CreateNotificationInput[]): Promise<void> {
    const rows = inputs
      .filter((i) => i.userId && i.actorId && i.userId !== i.actorId)
      .map((i) => ({
        workspaceId: new Types.ObjectId(i.workspaceId),
        userId: new Types.ObjectId(i.userId),
        actorId: new Types.ObjectId(i.actorId),
        type: i.type,
        pageId: new Types.ObjectId(i.pageId),
        commentId: i.commentId ? new Types.ObjectId(i.commentId) : null,
        blockId: i.blockId ?? null,
        preview: (i.preview ?? '').slice(0, 140),
        read: false,
      }));
    if (!rows.length) return;
    await NotificationModel.insertMany(rows);
  },

  async listForUser(workspaceId: string, userId: string, limit = 30): Promise<NotificationDTO[]> {
    const rows = await NotificationModel.find({ workspaceId, userId })
      .sort({ createdAt: -1 })
      .limit(Math.min(limit, 100))
      .lean();

    const actorIds = [...new Set(rows.map((r) => String(r.actorId)))];
    const pageIds = [...new Set(rows.map((r) => String(r.pageId)))];
    const [actors, pages] = await Promise.all([
      UserModel.find({ _id: { $in: actorIds } }).select('_id name avatarUrl').lean(),
      PageModel.find({ _id: { $in: pageIds } }).select('_id title').lean(),
    ]);
    const actorMap = new Map<string, ActorLite>();
    for (const u of actors) {
      actorMap.set(String(u._id), {
        id: String(u._id),
        name: (u as any).name || 'Unknown',
        avatarUrl: (u as any).avatarUrl ?? null,
      });
    }
    const titleMap = new Map<string, string>();
    for (const p of pages) titleMap.set(String(p._id), (p as any).title ?? 'Untitled');

    return rows.map((r) =>
      toDTO(r, actorMap.get(String(r.actorId)) ?? null, titleMap.get(String(r.pageId)) ?? null),
    );
  },

  async unreadCount(workspaceId: string, userId: string): Promise<number> {
    return NotificationModel.countDocuments({ workspaceId, userId, read: false });
  },

  async markRead(workspaceId: string, userId: string, id: string): Promise<{ ok: true }> {
    if (!isValidObjectId(id)) throw new HttpError(404, 'NotificationNotFound');
    const res = await NotificationModel.updateOne(
      { _id: id, workspaceId, userId },
      { $set: { read: true } },
    );
    if (res.matchedCount === 0) throw new HttpError(404, 'NotificationNotFound');
    return { ok: true };
  },

  async markAllRead(workspaceId: string, userId: string): Promise<{ ok: true }> {
    await NotificationModel.updateMany(
      { workspaceId, userId, read: false },
      { $set: { read: true } },
    );
    return { ok: true };
  },
};
