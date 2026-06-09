import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  publicShareApi,
  type PublicBlockDTO,
  type PublicPageNode,
} from '@/services/shareLinks.api';
import { ApiError } from '@/services/http';
import { PublicBlockRenderer } from './PublicBlockRenderer';

/**
 * Public share viewer (route: /share/:token).
 *
 * State machine:
 *   probing            → call /links/:token to discover whether a password
 *                        is required (server returns 404 for unknown/expired).
 *   password-required  → render an input; on submit, call /unlock then move
 *                        to "loading-tree".
 *   loading-tree       → fetch tree + initial page's blocks.
 *   viewing            → render. Sidebar lists every page in scope; clicking
 *                        switches the viewed page without touching the URL.
 *
 * Everything is read-only. The editor is intentionally NOT reused — its
 * autosave and selection state assume an authenticated session.
 */

type Phase =
  | { kind: 'probing' }
  | { kind: 'password-required'; attempted: boolean }
  | { kind: 'loading-tree' }
  | { kind: 'viewing' }
  | { kind: 'error'; message: string };

export function PublicSharePage(): JSX.Element {
  const { token } = useParams<{ token: string }>();
  const [phase, setPhase] = useState<Phase>({ kind: 'probing' });
  const [password, setPassword] = useState<string>('');
  const [passwordInput, setPasswordInput] = useState('');
  const [tree, setTree] = useState<PublicPageNode[]>([]);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<PublicBlockDTO[]>([]);

  // Probe on mount.
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const info = await publicShareApi.info(token);
        if (info.hasPassword) setPhase({ kind: 'password-required', attempted: false });
        else setPhase({ kind: 'loading-tree' });
      } catch (e) {
        setPhase({
          kind: 'error',
          message: e instanceof ApiError && e.status === 404 ? 'Link not found or expired.' : 'Failed to load.',
        });
      }
    })();
  }, [token]);

  // Once unlocked (or no password), fetch tree.
  useEffect(() => {
    if (phase.kind !== 'loading-tree' || !token) return;
    (async () => {
      try {
        const nodes = await publicShareApi.tree(token, password || undefined);
        setTree(nodes);
        const root = nodes.find((n) => !nodes.some((m) => m.id === n.parentId));
        const initial = root?.id ?? nodes[0]?.id ?? null;
        setActivePageId(initial);
        setPhase({ kind: 'viewing' });
      } catch (e) {
        setPhase({
          kind: 'error',
          message: e instanceof Error ? e.message : 'Failed to load page tree',
        });
      }
    })();
  }, [phase.kind, token, password]);

  // Fetch blocks whenever the active page changes.
  useEffect(() => {
    if (!token || !activePageId || phase.kind !== 'viewing') return;
    (async () => {
      try {
        setBlocks(await publicShareApi.blocks(token, activePageId, password || undefined));
      } catch (e) {
        setPhase({
          kind: 'error',
          message: e instanceof Error ? e.message : 'Failed to load page',
        });
      }
    })();
  }, [token, activePageId, phase.kind, password]);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !passwordInput) return;
    try {
      await publicShareApi.unlock(token, passwordInput);
      setPassword(passwordInput);
      setPhase({ kind: 'loading-tree' });
    } catch {
      setPhase({ kind: 'password-required', attempted: true });
    }
  };

  const activePage = useMemo(
    () => tree.find((n) => n.id === activePageId) ?? null,
    [tree, activePageId],
  );

  if (phase.kind === 'probing') {
    return <Center>Loading…</Center>;
  }

  if (phase.kind === 'error') {
    return (
      <Center>
        <div className="text-lg">🔒</div>
        <div className="mt-2 text-sm text-zinc-500">{phase.message}</div>
      </Center>
    );
  }

  if (phase.kind === 'password-required') {
    return (
      <Center>
        <h1 className="text-lg font-semibold">Password required</h1>
        <p className="mt-1 text-sm text-zinc-500">This page is protected.</p>
        <form onSubmit={handleUnlock} className="mt-4 space-y-2">
          <input
            type="password"
            autoFocus
            required
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            placeholder="Password"
          />
          {phase.attempted && (
            <div className="text-xs text-red-500">Incorrect password.</div>
          )}
          <button
            type="submit"
            className="w-full rounded bg-zinc-900 px-3 py-1.5 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            Unlock
          </button>
        </form>
      </Center>
    );
  }

  if (phase.kind === 'loading-tree') return <Center>Loading…</Center>;

  // viewing
  return (
    <div className="flex h-full min-h-screen">
      {tree.length > 1 && (
        <aside className="w-60 shrink-0 border-r border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-2 text-[10px] uppercase tracking-wider text-zinc-500">
            Shared pages
          </div>
          {tree.map((n) => (
            <button
              key={n.id}
              onClick={() => setActivePageId(n.id)}
              className={`block w-full truncate rounded px-2 py-1 text-left text-sm hover:bg-zinc-200/60 dark:hover:bg-zinc-800/60 ${
                n.id === activePageId ? 'bg-zinc-200/60 dark:bg-zinc-800/60' : ''
              }`}
              style={{ paddingLeft: 8 + depthOf(n, tree) * 12 }}
            >
              <span className="mr-1">{n.icon}</span>
              {n.title || 'Untitled'}
            </button>
          ))}
        </aside>
      )}
      <main className="flex-1 overflow-auto">
        {activePage && (
          <article className="mx-auto max-w-2xl p-8">
            {activePage.coverUrl && (
              <img
                src={activePage.coverUrl}
                alt=""
                className="mb-6 h-48 w-full rounded object-cover"
              />
            )}
            <div className="mb-4 flex items-center gap-2">
              <span className="text-3xl">{activePage.icon}</span>
              <h1 className="text-3xl font-semibold">{activePage.title || 'Untitled'}</h1>
            </div>
            <PublicBlockRenderer blocks={blocks} />
          </article>
        )}
      </main>
    </div>
  );
}

function depthOf(node: PublicPageNode, all: PublicPageNode[]): number {
  let d = 0;
  let cur: PublicPageNode | undefined = node;
  while (cur?.parentId) {
    const parent: PublicPageNode | undefined = all.find((n) => n.id === cur!.parentId);
    if (!parent) break;
    cur = parent;
    d++;
    if (d > 32) break;
  }
  return d;
}

function Center({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-6 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        {children}
      </div>
    </div>
  );
}
