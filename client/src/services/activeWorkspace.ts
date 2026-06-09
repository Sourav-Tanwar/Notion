/**
 * Active-workspace registry.
 *
 * The HTTP client reads `getActiveWorkspaceId()` and stamps it onto every
 * request as the `x-workspace-id` header — this is how the server's
 * `workspaceGuard` resolves which tenant the call belongs to.
 *
 * Persisted to `localStorage` so a page reload picks up where the user was.
 * The active id is NOT the source of truth for "do I have access to this
 * workspace?" — that's always verified by the server on each request.
 *
 * Why not put this in Zustand? Two reasons:
 *  1. It's read inside `http.ts`, which is imported by the auth store —
 *     a Zustand workspace store would create a circular import.
 *  2. We want a synchronous getter callable from non-React code (interceptors,
 *     test setup) without subscribing to a React hook.
 *
 * The Zustand `workspace.store.ts` (added in Slice 7.6) wraps this with
 * reactive selectors for the switcher UI.
 */

const STORAGE_KEY = 'notion.activeWorkspaceId';

let current: string | null = (() => {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
  } catch {
    return null;
  }
})();

const listeners = new Set<(id: string | null) => void>();

export function getActiveWorkspaceId(): string | null {
  return current;
}

export function setActiveWorkspaceId(id: string | null): void {
  if (id === current) return;
  current = id;
  try {
    if (typeof localStorage !== 'undefined') {
      if (id) localStorage.setItem(STORAGE_KEY, id);
      else localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    /* private mode / quota — fine, in-memory wins */
  }
  for (const fn of listeners) fn(id);
}

export function subscribeActiveWorkspace(fn: (id: string | null) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
