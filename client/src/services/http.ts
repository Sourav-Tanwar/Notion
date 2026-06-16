/**
 * Tokens & HTTP client.
 *
 * Design:
 *  - Access token lives ONLY in module-scoped memory; never localStorage. Hard
 *    refresh loses it, but hydration calls /refresh (httpOnly cookie) to
 *    recover. Trade-off: kills the dominant XSS exfiltration surface for
 *    long-lived auth in exchange for one extra network round-trip on load.
 *  - Refresh token is an httpOnly cookie scoped to `/api/auth`. CSRF mitigated
 *    by SameSite=Lax + state mutations always carrying the Bearer header.
 *  - On 401 we attempt exactly one /refresh before failing. Concurrent 401s
 *    coalesce into a single refresh promise to avoid thundering-herd refresh.
 */

let accessToken: string | null = null;
const listeners = new Set<(t: string | null) => void>();

export const tokens = {
  get: () => accessToken,
  set(t: string | null) {
    accessToken = t;
    for (const l of listeners) l(t);
  },
  subscribe(fn: (t: string | null) => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

// Re-export for convenience. The active workspace id is stamped onto every
// request as `x-workspace-id` so the server's workspaceGuard can resolve the
// active tenant without the SPA having to thread it through every call site.
import { getActiveWorkspaceId } from './activeWorkspace';

// Base URL for the API. In production the SPA (Vercel) and the API (Render)
// live on different origins, so VITE_API_ORIGIN is baked in at build time.
// Locally it's empty, so requests stay relative and the Vite dev proxy / same
// origin handles them.
const API_ORIGIN = (import.meta.env.VITE_API_ORIGIN as string | undefined)?.replace(/\/+$/, '') ?? '';

/** Public so full-page redirects (e.g. OAuth start) can target the API origin too. */
export const apiOrigin = () => API_ORIGIN;

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

interface Options extends RequestInit {
  json?: unknown;
  auth?: boolean;
  _retried?: boolean;
}

let refreshing: Promise<boolean> | null = null;

export async function tryRefresh(): Promise<boolean> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const res = await fetch(`${API_ORIGIN}/api/auth/refresh`, { method: 'POST', credentials: 'include' });
      if (!res.ok) return false;
      const data = (await res.json()) as { accessToken: string };
      tokens.set(data.accessToken);
      return true;
    } catch {
      return false;
    } finally {
      setTimeout(() => (refreshing = null), 0);
    }
  })();
  return refreshing;
}

export async function api<T = unknown>(path: string, opts: Options = {}): Promise<T> {
  const { json, auth = true, headers, _retried = false, ...rest } = opts;
  const h = new Headers(headers);
  if (json !== undefined) h.set('Content-Type', 'application/json');
  if (auth && accessToken) h.set('Authorization', `Bearer ${accessToken}`);
  // Only the workspace endpoints themselves are exempt — they discover/create
  // the workspace and so cannot require it as input.
  if (auth && !path.startsWith('/workspaces') && !h.has('x-workspace-id')) {
    const ws = getActiveWorkspaceId();
    if (ws) h.set('x-workspace-id', ws);
  }

  const res = await fetch(`${API_ORIGIN}/api${path}`, {
    ...rest,
    headers: h,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    credentials: 'include',
  });

  if (res.status === 401 && auth && !_retried && path !== '/auth/refresh') {
    const ok = await tryRefresh();
    if (ok) return api<T>(path, { ...opts, _retried: true });
    tokens.set(null);
  }

  const text = await res.text();
  const data = text ? safeJson(text) : undefined;
  if (!res.ok) {
    throw new ApiError(
      res.status,
      (data as { error?: string })?.error ?? res.statusText,
      (data as { details?: unknown })?.details,
    );
  }
  return data as T;
}

function safeJson(s: string): unknown {
  try { return JSON.parse(s); } catch { return undefined; }
}

export async function apiUpload<T>(path: string, form: FormData): Promise<T> {
  const h = new Headers();
  if (accessToken) h.set('Authorization', `Bearer ${accessToken}`);
  const ws = getActiveWorkspaceId();
  if (ws && !path.startsWith('/workspaces')) h.set('x-workspace-id', ws);
  const res = await fetch(`${API_ORIGIN}/api${path}`, { method: 'POST', body: form, headers: h, credentials: 'include' });
  if (res.status === 401) {
    const ok = await tryRefresh();
    if (ok) {
      const h2 = new Headers();
      if (accessToken) h2.set('Authorization', `Bearer ${accessToken}`);
      if (ws && !path.startsWith('/workspaces')) h2.set('x-workspace-id', ws);
      const res2 = await fetch(`${API_ORIGIN}/api${path}`, { method: 'POST', body: form, headers: h2, credentials: 'include' });
      const t2 = await res2.text();
      const d2 = t2 ? safeJson(t2) : undefined;
      if (!res2.ok) throw new ApiError(res2.status, (d2 as { error?: string })?.error ?? res2.statusText);
      return d2 as T;
    }
  }
  const text = await res.text();
  const data = text ? safeJson(text) : undefined;
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string })?.error ?? res.statusText);
  return data as T;
}
