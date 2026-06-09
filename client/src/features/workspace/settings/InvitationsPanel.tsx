import { useEffect, useState } from 'react';
import { invitationsApi, type InvitationDTO } from '@/services/invitations.api';
import type { WorkspaceDTO } from '@/services/workspaces.api';

interface Props {
  ws: WorkspaceDTO;
  canAdmin: boolean;
}

type AssignableRole = 'admin' | 'member' | 'guest';

/**
 * Invitations panel. Lists pending + historical invitations and lets admins
 * create / resend / revoke. The list is intentionally non-realtime — we
 * refetch after each mutation rather than maintain a fragile websocket here.
 */
export function InvitationsPanel({ ws, canAdmin }: Props): JSX.Element {
  const [items, setItems] = useState<InvitationDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [draftEmail, setDraftEmail] = useState('');
  const [draftRole, setDraftRole] = useState<AssignableRole>('member');

  const load = async () => {
    try {
      setItems(await invitationsApi.list(ws.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load invitations');
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws.id]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = draftEmail.trim().toLowerCase();
    if (!email) return;
    setBusy('create');
    setError(null);
    try {
      await invitationsApi.create(ws.id, { email, role: draftRole });
      setDraftEmail('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create invitation');
    } finally {
      setBusy(null);
    }
  };

  const resend = async (id: string) => {
    setBusy(id);
    setError(null);
    try {
      await invitationsApi.resend(ws.id, id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to resend');
    } finally {
      setBusy(null);
    }
  };

  const revoke = async (id: string) => {
    if (!confirm('Revoke this invitation? The link will stop working immediately.')) return;
    setBusy(id);
    setError(null);
    try {
      await invitationsApi.revoke(ws.id, id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to revoke');
    } finally {
      setBusy(null);
    }
  };

  if (!items) return <div className="text-zinc-500">Loading invitations…</div>;

  const pending = items.filter((i) => !i.acceptedAt && !i.revokedAt);
  const past = items.filter((i) => i.acceptedAt || i.revokedAt);

  return (
    <div className="space-y-8">
      {canAdmin && (
        <form onSubmit={create} className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[14rem]">
            <label className="block text-xs text-zinc-500">Email</label>
            <input
              type="email"
              required
              value={draftEmail}
              onChange={(e) => setDraftEmail(e.target.value)}
              placeholder="teammate@company.com"
              className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-500">Role</label>
            <select
              value={draftRole}
              onChange={(e) => setDraftRole(e.target.value as AssignableRole)}
              className="rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="admin">Admin</option>
              <option value="member">Member</option>
              <option value="guest">Guest</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={busy === 'create'}
            className="rounded bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {busy === 'create' ? 'Sending…' : 'Send invite'}
          </button>
        </form>
      )}

      {error && (
        <div className="rounded bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950/40">
          {error}
        </div>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold">
          Pending <span className="text-zinc-500">({pending.length})</span>
        </h2>
        {pending.length === 0 ? (
          <div className="text-sm text-zinc-500">No pending invitations.</div>
        ) : (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {pending.map((i) => (
              <li key={i.id} className="flex items-center gap-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="truncate">{i.email}</div>
                  <div className="text-xs text-zinc-500">
                    {i.role} · expires {new Date(i.expiresAt).toLocaleDateString()}
                  </div>
                </div>
                {canAdmin && (
                  <>
                    <button
                      onClick={() => void resend(i.id)}
                      disabled={busy === i.id}
                      className="rounded px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      Resend
                    </button>
                    <button
                      onClick={() => void revoke(i.id)}
                      disabled={busy === i.id}
                      className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-950/30"
                    >
                      Revoke
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {past.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-zinc-500">History</h2>
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {past.map((i) => (
              <li key={i.id} className="flex items-center gap-3 py-2 text-sm text-zinc-500">
                <div className="min-w-0 flex-1 truncate">{i.email}</div>
                <span className="text-xs">
                  {i.acceptedAt ? 'Accepted' : 'Revoked'} ·{' '}
                  {new Date(i.acceptedAt ?? i.revokedAt ?? i.createdAt).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
