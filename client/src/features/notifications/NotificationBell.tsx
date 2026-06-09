import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar } from '@/components/Avatar';
import { useNotificationsStore } from '@/stores/notifications.store';
import { useCommentsUiStore } from '@/stores/comments.store';
import type { AppNotification } from '@/services/notifications.api';

/**
 * Notification inbox in the sidebar header.
 *
 * Owns the polling lifecycle (mount → start, unmount → stop). The badge shows
 * the unread count refreshed by the store's poll; opening the panel fetches
 * the full list. Clicking an item marks it read, navigates to its page, and
 * opens the comments drawer so the user lands on the relevant thread.
 */
export function NotificationBell(): JSX.Element {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const unread = useNotificationsStore((s) => s.unread);
  const items = useNotificationsStore((s) => s.items);
  const loading = useNotificationsStore((s) => s.loading);
  const startPolling = useNotificationsStore((s) => s.startPolling);
  const stopPolling = useNotificationsStore((s) => s.stopPolling);
  const fetchList = useNotificationsStore((s) => s.fetchList);
  const markRead = useNotificationsStore((s) => s.markRead);
  const markAllRead = useNotificationsStore((s) => s.markAllRead);

  useEffect(() => {
    startPolling();
    return () => stopPolling();
  }, [startPolling, stopPolling]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = (): void => {
    const next = !open;
    setOpen(next);
    if (next) void fetchList();
  };

  const openNotification = (n: AppNotification): void => {
    void markRead(n.id);
    setOpen(false);
    navigate(`/p/${n.pageId}`);
    // Open the comments drawer once the editor mounts and focus the exact
    // thread this notification points at (the UI store persists across the
    // route change, so the drawer reads it on mount).
    if (n.commentId) useCommentsUiStore.getState().focusComment(n.commentId);
    else useCommentsUiStore.getState().openAll();
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={toggle}
        title="Notifications"
        className="relative text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
      >
        <span className="text-base leading-none">🔔</span>
        {unread > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-[120] mt-2 w-80 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
          <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
            <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
              Notifications
            </span>
            {items.some((n) => !n.read) && (
              <button
                onClick={() => void markAllRead()}
                className="text-[11px] text-accent hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-auto">
            {loading && items.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-zinc-400">Loading…</p>
            ) : items.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-zinc-400">No notifications yet</p>
            ) : (
              <ul>
                {items.map((n) => (
                  <li key={n.id}>
                    <button
                      onClick={() => openNotification(n)}
                      className={`flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/60 ${
                        n.read ? '' : 'bg-amber-50/60 dark:bg-amber-500/10'
                      }`}
                    >
                      <div className="mt-0.5 shrink-0">
                        <Avatar
                          user={
                            n.actor
                              ? { name: n.actor.name, email: '', avatarUrl: n.actor.avatarUrl }
                              : null
                          }
                          size={6}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-zinc-700 dark:text-zinc-200">
                          <span className="font-semibold">{n.actor?.name ?? 'Someone'}</span>{' '}
                          {n.type === 'comment_mention' ? 'mentioned you' : 'replied to you'}
                          {n.pageTitle ? (
                            <>
                              {' '}in <span className="font-medium">{n.pageTitle}</span>
                            </>
                          ) : null}
                        </p>
                        {n.preview && (
                          <p className="mt-0.5 truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                            {n.preview}
                          </p>
                        )}
                        <p className="mt-0.5 text-[10px] text-zinc-400">
                          {formatRelative(n.createdAt)}
                        </p>
                      </div>
                      {!n.read && (
                        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-red-500" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const sec = Math.round((Date.now() - then) / 1000);
  if (sec < 60) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}
