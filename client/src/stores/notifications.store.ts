import { create } from 'zustand';
import { notificationsApi, type AppNotification } from '@/services/notifications.api';

/**
 * Notifications store.
 *
 * Delivery model: short polling. Notification recipients are frequently NOT
 * on the page where the comment was written, so the page-room realtime beacon
 * (which only reaches users currently in that Y.Doc room) cannot deliver them.
 * Polling the unread count on an interval + on window focus is the simplest
 * approach that reaches everyone regardless of where they are in the app.
 *
 * `startPolling` is idempotent (ref-counted) so multiple mounts share one
 * timer; the bell component owns its lifecycle.
 */
interface NotificationsState {
  items: AppNotification[];
  unread: number;
  loading: boolean;
  loaded: boolean;
  fetchList: () => Promise<void>;
  refreshCount: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  startPolling: (intervalMs?: number) => void;
  stopPolling: () => void;
}

let pollTimer: ReturnType<typeof setInterval> | null = null;
let pollSubscribers = 0;
let onFocus: (() => void) | null = null;

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  items: [],
  unread: 0,
  loading: false,
  loaded: false,

  async fetchList() {
    set({ loading: true });
    try {
      const items = await notificationsApi.list();
      set({
        items,
        loading: false,
        loaded: true,
        unread: items.filter((n) => !n.read).length,
      });
    } catch {
      set({ loading: false });
    }
  },

  async refreshCount() {
    try {
      const { count } = await notificationsApi.unreadCount();
      set({ unread: count });
    } catch {
      /* ignore transient errors */
    }
  },

  async markRead(id) {
    const before = get().items;
    if (!before.some((n) => n.id === id && !n.read)) return;
    set({
      items: before.map((n) => (n.id === id ? { ...n, read: true } : n)),
      unread: Math.max(0, get().unread - 1),
    });
    try {
      await notificationsApi.markRead(id);
    } catch {
      set({ items: before });
      void get().refreshCount();
    }
  },

  async markAllRead() {
    const before = get().items;
    set({ items: before.map((n) => ({ ...n, read: true })), unread: 0 });
    try {
      await notificationsApi.markAllRead();
    } catch {
      set({ items: before });
      void get().refreshCount();
    }
  },

  startPolling(intervalMs = 30_000) {
    pollSubscribers += 1;
    if (pollTimer) return;
    void get().refreshCount();
    pollTimer = setInterval(() => void get().refreshCount(), intervalMs);
    onFocus = () => void get().refreshCount();
    window.addEventListener('focus', onFocus);
  },

  stopPolling() {
    pollSubscribers = Math.max(0, pollSubscribers - 1);
    if (pollSubscribers > 0) return;
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    if (onFocus) {
      window.removeEventListener('focus', onFocus);
      onFocus = null;
    }
  },
}));
