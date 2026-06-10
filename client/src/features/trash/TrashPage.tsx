
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { selectTrashIds, usePagesStore } from '@/stores/pages.store';
import { useShallow } from 'zustand/react/shallow';

/**
 * Trash view: lists archived pages with restore + permanent-delete actions.
 *
 * The store keeps archived pages in `byId` so titles/icons render. We sort by
 * archivedAt descending (most recent first) — the server already returns this
 * order, but if items are added via local soft-delete (optimistic), the order
 * is preserved by `deletePage`'s prepend.
 */
export function TrashPage(): JSX.Element {
  const navigate = useNavigate();
  const trashIds = usePagesStore(useShallow(selectTrashIds));
  const trashById = usePagesStore((s) => s.trashById);
  const fetchTrash = usePagesStore((s) => s.fetchTrash);
  const restorePage = usePagesStore((s) => s.restorePage);
  const deletePermanent = usePagesStore((s) => s.deletePermanent);
  const trashLoaded = usePagesStore((s) => s.trashLoaded);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    void fetchTrash();
  }, [fetchTrash]);

  const handleRestore = async (id: string): Promise<void> => {
    setBusyId(id);
    try {
      await restorePage(id);
      navigate(`/p/${id}`);
    } finally {
      setBusyId(null);
    }
  };

  const handlePermanent = async (id: string): Promise<void> => {
    const ok = window.confirm('Delete forever? This cannot be undone.');
    if (!ok) return;
    setBusyId(id);
    try {
      await deletePermanent(id);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Trash</h1>
        <Link to="/" className="text-sm text-zinc-400 hover:text-zinc-100">
          ← Back
        </Link>
      </header>

      <p className="mb-4 text-xs text-zinc-500">
        Pages in Trash for more than 30 days are deleted permanently.
      </p>

      {!trashLoaded && <div className="text-zinc-500">Loading…</div>}

      {trashLoaded && trashIds.length === 0 && (
        <div className="rounded-md border border-dashed border-border bg-surface/40 px-4 py-12 text-center text-zinc-400">
          Trash is empty.
        </div>
      )}

      <ul className="divide-y divide-border rounded-md border border-border bg-surface">
        {trashIds.map((id) => {
          const page = trashById[id];
          if (!page) return null;
          const archivedAt = page.archivedAt ? new Date(page.archivedAt).toLocaleString() : '—';
          return (
            <li key={id} className="flex items-center gap-3 px-3 py-2">
              <span className="text-lg">{page.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-zinc-100">{page.title || 'Untitled'}</div>
                <div className="text-xs text-zinc-500">Deleted {archivedAt}</div>
              </div>
              <button
                type="button"
                disabled={busyId === id}
                onClick={() => void handleRestore(id)}
                className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-100 hover:bg-zinc-700 disabled:opacity-50"
              >
                Restore
              </button>
              <button
                type="button"
                disabled={busyId === id}
                onClick={() => void handlePermanent(id)}
                className="rounded bg-red-900/40 px-2 py-1 text-xs text-red-200 hover:bg-red-900/70 disabled:opacity-50"
              >
                Delete forever
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
