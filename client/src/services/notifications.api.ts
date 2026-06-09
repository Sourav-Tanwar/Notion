import { api } from './http';

export type NotificationType = 'comment_mention' | 'comment_reply';

export interface NotificationActor {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface AppNotification {
  id: string;
  type: NotificationType;
  pageId: string;
  pageTitle: string | null;
  commentId: string | null;
  blockId: string | null;
  preview: string;
  actor: NotificationActor | null;
  read: boolean;
  createdAt: string;
}

export const notificationsApi = {
  list: () => api<AppNotification[]>('/notifications'),
  unreadCount: () => api<{ count: number }>('/notifications/unread-count'),
  markRead: (id: string) => api<{ ok: true }>(`/notifications/${id}/read`, { method: 'POST' }),
  markAllRead: () => api<{ ok: true }>('/notifications/read-all', { method: 'POST' }),
};
