import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  selectActiveWorkspace,
  useWorkspaceStore,
} from '@/stores/workspace.store';

/**
 * Workspace switcher — the pill in the top-left of the sidebar.
 *
 * Click → dropdown with the user's workspaces (current marked), plus links
 * to settings and a "Create workspace" inline form. The dropdown closes on
 * outside click and on Escape.
 *
 * The component fetches the workspace list on mount; subsequent mounts (HMR,
 * re-render after switch) reuse the cached `loaded` flag.
 */
export function WorkspaceSwitcher(): JSX.Element {
  const list = useWorkspaceStore((s) => s.list);
  const loaded = useWorkspaceStore((s) => s.loaded);
  const fetch = useWorkspaceStore((s) => s.fetch);
  const setActive = useWorkspaceStore((s) => s.setActive);
  const createWs = useWorkspaceStore((s) => s.create);
  const active = useWorkspaceStore(selectActiveWorkspace);

  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loaded) void fetch();
  }, [loaded, fetch]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = draftName.trim();
    if (!name) return;
    await createWs({ name });
    setDraftName('');
    setCreating(false);
    setOpen(false);
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-zinc-200/60 dark:hover:bg-zinc-800/60"
      >
        <span className="text-lg leading-none">{active?.iconEmoji ?? '🏠'}</span>
        <span className="min-w-0 flex-1 truncate font-medium text-zinc-900 dark:text-zinc-100">
          {active?.name ?? 'No workspace'}
        </span>
        <span className="text-xs text-zinc-500">▾</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-80 overflow-auto rounded-md border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
        >
          <div className="px-2 pt-1 pb-0.5 text-[10px] uppercase tracking-wider text-zinc-500">
            Workspaces
          </div>
          {list.map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => {
                void setActive(w.id);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                w.id === active?.id ? 'bg-zinc-100 dark:bg-zinc-800' : ''
              }`}
            >
              <span className="text-base leading-none">{w.iconEmoji}</span>
              <span className="min-w-0 flex-1 truncate">{w.name}</span>
              <span className="text-[10px] uppercase text-zinc-400">{w.role}</span>
            </button>
          ))}

          <div className="my-1 h-px bg-zinc-200 dark:bg-zinc-700" />

          {creating ? (
            <form onSubmit={handleCreate} className="px-1 py-1">
              <input
                autoFocus
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder="Workspace name"
                className="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              />
              <div className="mt-1 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCreating(false)}
                  className="rounded px-2 py-1 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!draftName.trim()}
                  className="rounded bg-zinc-900 px-2 py-1 text-xs text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                >
                  Create
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <span>＋</span>
              Create workspace
            </button>
          )}

          <Link
            to="/settings/workspace"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <span>⚙</span>
            Workspace settings
          </Link>
        </div>
      )}
    </div>
  );
}
