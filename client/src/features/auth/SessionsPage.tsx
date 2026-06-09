import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSessionsStore } from '@/stores/sessions.store';

/**
 * Active devices / sessions page.
 *
 * Each row is one refresh-token family (see server `sessions.service.ts`).
 * Killing a row revokes every token in the family server-side, which
 * immediately stops that browser from refreshing its access token — the next
 * 401 → /refresh attempt will fail and the SPA there will drop to /login.
 */
export function SessionsPage(): JSX.Element {
  const { sessions, loading, error, fetch, revoke, revokeOthers } = useSessionsStore();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyOthers, setBusyOthers] = useState(false);

  useEffect(() => {
    void fetch();
  }, [fetch]);

  const otherCount = sessions.filter((s) => !s.current).length;

  async function handleRevoke(id: string) {
    setBusyId(id);
    try {
      await revoke(id);
    } finally {
      setBusyId(null);
    }
  }

  async function handleRevokeOthers() {
    setBusyOthers(true);
    try {
      await revokeOthers();
    } finally {
      setBusyOthers(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <header className="space-y-2">
        <Link to="/settings/account" className="text-xs text-accent hover:underline">
          ← Back to account
        </Link>
        <h1 className="text-xl font-semibold">Active sessions</h1>
        <p className="text-sm text-zinc-500">
          Devices currently signed in to your account. Revoke any you don&apos;t recognise.
        </p>
      </header>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">{sessions.length} session{sessions.length === 1 ? '' : 's'}</h2>
          {otherCount > 0 && (
            <button
              type="button"
              onClick={handleRevokeOthers}
              disabled={busyOthers}
              className="rounded-md border border-border bg-canvas px-3 py-1.5 text-sm hover:bg-sidebar disabled:opacity-50"
            >
              {busyOthers ? 'Signing out…' : `Sign out ${otherCount} other device${otherCount === 1 ? '' : 's'}`}
            </button>
          )}
        </div>

        {loading && sessions.length === 0 ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-zinc-500">No active sessions.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium">{s.device || 'Unknown device'}</p>
                    {s.current && (
                      <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-emerald-500">
                        This device
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500">
                    {s.ip || 'unknown ip'} · last active {formatRelative(s.lastActiveAt)}
                  </p>
                </div>
                {!s.current && (
                  <button
                    type="button"
                    onClick={() => handleRevoke(s.id)}
                    disabled={busyId === s.id}
                    className="rounded-md px-3 py-1.5 text-sm text-red-500 hover:bg-red-500/10 disabled:opacity-50"
                  >
                    {busyId === s.id ? 'Revoking…' : 'Revoke'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
