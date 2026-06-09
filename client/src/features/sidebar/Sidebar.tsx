import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useShallow } from 'zustand/react/shallow';
import { Link, useNavigate } from 'react-router-dom';
import { subscribeActiveWorkspace } from '@/services/activeWorkspace';
import {
  selectFavoriteIds,
  selectRootIds,
  usePagesStore,
} from '@/stores/pages.store';
import { useAuthStore } from '@/stores/auth.store';
import { useRecentStore } from '@/stores/recent.store';
import { Avatar } from '@/components/Avatar';
import { ThemeSegmented } from '@/theme/ThemeSegmented';
import { PageTreeNode } from './PageTreeNode';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import { TemplatesMenu } from './TemplatesMenu';
import { TemplatesGallery } from './TemplatesGallery';
import { NotificationBell } from '@/features/notifications/NotificationBell';

export function Sidebar(): JSX.Element {
  const navigate = useNavigate();
  const fetchAll = usePagesStore((s) => s.fetchAll);
  const loaded = usePagesStore((s) => s.loaded);
  const rootIds = usePagesStore(useShallow(selectRootIds));
  const favoriteIds = usePagesStore(useShallow(selectFavoriteIds));
  const byId = usePagesStore((s) => s.byId);
  const createPage = usePagesStore((s) => s.createPage);
  const movePage = usePagesStore((s) => s.movePage);
  const importMarkdown = usePagesStore((s) => s.importMarkdown);
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);

  const [galleryOpen, setGalleryOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // "Recent" section: most-recently-visited pages that still exist and
  // aren't archived/templates. Derived from the localStorage-backed store.
  const recentIds = useRecentStore(useShallow((s) => s.ids));
  const recentPages = recentIds
    .map((id) => byId[id])
    .filter((p) => p && !p.archivedAt && !p.isTemplate)
    .slice(0, 5);

  useEffect(() => {
    if (!loaded) fetchAll();
  }, [loaded, fetchAll]);

  // Active workspace is resolved asynchronously after login (the auth
  // bootstrap fetches the workspace list, then sets the id). The sidebar's
  // first `fetchAll` may race ahead of that and 400 with no x-workspace-id
  // header, leaving us stuck on "Loading...". Retry whenever the active
  // workspace id changes (null → real, or switched).
  useEffect(() => {
    return subscribeActiveWorkspace((id) => {
      if (id) void usePagesStore.getState().fetchAll();
    });
  }, []);

  // Pick up page-tree changes made by other tabs / accounts. Page CRUD
  // doesn't flow over the per-page Yjs room, so without this the sidebar
  // shows a stale tree until manual reload. Refetch on:
  //   - tab regaining focus (covers most cross-account collab cases)
  //   - a slow 30s poll while the tab stays open
  // Both are cheap (one indexed Mongo query per workspace).
  useEffect(() => {
    if (!loaded) return;
    const refetch = () => {
      void usePagesStore.getState().fetchAll();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refetch();
    };
    window.addEventListener('focus', refetch);
    document.addEventListener('visibilitychange', onVisibility);
    const interval = window.setInterval(refetch, 30_000);
    return () => {
      window.removeEventListener('focus', refetch);
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(interval);
    };
  }, [loaded]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const overData = over.data.current as { parentId?: string | null } | undefined;
      const newParentId = overData?.parentId ?? null;
      const siblings =
        newParentId === null
          ? usePagesStore.getState().rootIds
          : usePagesStore.getState().childrenOf[newParentId] ?? [];
      const newIndex = siblings.indexOf(String(over.id));
      if (newIndex < 0) return;
      void movePage(String(active.id), newParentId, newIndex);
    },
    [movePage],
  );

  const handleNew = async () => {
    const p = await createPage(null);
    navigate(`/p/${p.id}`);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-importing the same file
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const page = await importMarkdown(text, null);
      navigate(`/p/${page.id}`);
    } catch {
      // Surface nothing fancy; the API layer already toasts on failure.
    } finally {
      setImporting(false);
    }
  };

  return (
    <aside className="flex h-full w-64 flex-col border-r border-border bg-sidebar">
      <div className="flex items-center justify-between border-b border-border px-3 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Avatar user={user} size={6} />
          <div className="truncate text-sm text-zinc-600 dark:text-zinc-400">{user?.name || user?.email}</div>
        </div>
        <div className="flex items-center gap-2">
          <NotificationBell />
          <button
            onClick={() => navigate('/settings/account')}
            title="Settings"
            className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
          >
            ⚙
          </button>
          <button onClick={logout} className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200">
            Logout
          </button>
        </div>
      </div>

      <div className="border-b border-border px-2 py-2">
        <WorkspaceSwitcher />
      </div>

      <button
        onClick={handleNew}
        className="mx-2 mt-3 rounded bg-zinc-200 px-2 py-1.5 text-sm text-zinc-900 hover:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
      >
        + New page
      </button>

      <TemplatesMenu />

      <div className="mx-2 mt-1 flex gap-1">
        <button
          onClick={() => setGalleryOpen(true)}
          className="flex-1 rounded px-2 py-1 text-left text-xs text-zinc-500 hover:bg-zinc-200/60 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100"
        >
          ▦ Browse templates
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={importing}
          title="Import a Markdown (.md) file as a new page"
          className="rounded px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-200/60 hover:text-zinc-800 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100"
        >
          {importing ? '…' : '⬇ Import'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".md,.markdown,text/markdown,text/plain"
          className="hidden"
          onChange={handleImportFile}
        />
      </div>

      {galleryOpen && <TemplatesGallery onClose={() => setGalleryOpen(false)} />}

      <div className="mt-3 flex-1 overflow-auto px-1 pb-2">
        {favoriteIds.length > 0 && (
          <div className="mb-3">
            <div className="px-2 pb-1 text-[10px] uppercase tracking-wider text-zinc-500">
              Favorites
            </div>
            {favoriteIds.map((id) => {
              const p = byId[id];
              if (!p) return null;
              return (
                <Link
                  key={`fav-${id}`}
                  to={`/p/${id}`}
                  className="block truncate rounded px-2 py-1 text-sm text-zinc-700 hover:bg-zinc-200/60 dark:text-zinc-300 dark:hover:bg-zinc-800/60"
                >
                  <span className="mr-1">{p.icon}</span>
                  {p.title || 'Untitled'}
                </Link>
              );
            })}
          </div>
        )}

        {recentPages.length > 0 && (
          <div className="mb-3">
            <div className="px-2 pb-1 text-[10px] uppercase tracking-wider text-zinc-500">
              Recent
            </div>
            {recentPages.map((p) => (
              <Link
                key={`recent-${p.id}`}
                to={`/p/${p.id}`}
                className="block truncate rounded px-2 py-1 text-sm text-zinc-700 hover:bg-zinc-200/60 dark:text-zinc-300 dark:hover:bg-zinc-800/60"
              >
                <span className="mr-1">{p.icon}</span>
                {p.title || 'Untitled'}
              </Link>
            ))}
          </div>
        )}

        <div className="px-2 pb-1 text-[10px] uppercase tracking-wider text-zinc-500">Workspace</div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={rootIds} strategy={verticalListSortingStrategy}>
            {rootIds.map((id) => (
              <PageTreeNode key={id} id={id} depth={0} />
            ))}
          </SortableContext>
        </DndContext>
      </div>

      <div className="space-y-2 border-t border-border px-2 py-2">
        <div className="px-1">
          <ThemeSegmented compact />
        </div>
        <Link
          to="/trash"
          className="block rounded px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-200/60 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100"
        >
          🗑 Trash
        </Link>
      </div>
    </aside>
  );
}
