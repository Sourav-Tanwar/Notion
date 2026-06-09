import { useEffect, useState } from 'react';
import { Avatar } from '@/components/Avatar';
import { useAuthStore } from '@/stores/auth.store';
import { workspacesApi, type MemberDTO, type WorkspaceDTO } from '@/services/workspaces.api';

interface Props {
  ws: WorkspaceDTO;
  canAdmin: boolean;
}

type AssignableRole = 'admin' | 'member' | 'guest';
const ASSIGNABLE: AssignableRole[] = ['admin', 'member', 'guest'];

export function MembersPanel({ ws, canAdmin }: Props): JSX.Element {
  const [members, setMembers] = useState<MemberDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const me = useAuthStore((s) => s.user);

  useEffect(() => {
    (async () => {
      try {
        setMembers(await workspacesApi.listMembers(ws.id));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load members');
      }
    })();
  }, [ws.id]);

  const changeRole = async (userId: string, role: AssignableRole) => {
    setBusy(userId);
    setError(null);
    try {
      const next = await workspacesApi.updateMember(ws.id, userId, role);
      setMembers((cur) => (cur ?? []).map((m) => (m.userId === userId ? next : m)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update role');
    } finally {
      setBusy(null);
    }
  };

  const remove = async (userId: string, name: string) => {
    if (!confirm(`Remove ${name} from the workspace?`)) return;
    setBusy(userId);
    setError(null);
    try {
      await workspacesApi.removeMember(ws.id, userId);
      setMembers((cur) => (cur ?? []).filter((m) => m.userId !== userId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove member');
    } finally {
      setBusy(null);
    }
  };

  if (!members) return <div className="text-zinc-500">Loading members…</div>;

  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold">
        Members <span className="text-zinc-500">({members.length})</span>
      </h2>
      {error && (
        <div className="mb-3 rounded bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950/40">
          {error}
        </div>
      )}
      <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
        {members.map((m) => {
          const isSelf = m.userId === me?.id;
          const canEdit = canAdmin && !isSelf && m.role !== 'owner';
          return (
            <li key={m.id} className="flex items-center gap-3 py-2">
              <Avatar user={m.user} size={8} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">
                  {m.user?.name || m.user?.email || '—'}
                  {isSelf && (
                    <span className="ml-2 text-xs text-zinc-400">(you)</span>
                  )}
                </div>
                <div className="truncate text-xs text-zinc-500">{m.user?.email}</div>
              </div>
              <div className="flex items-center gap-2">
                {canEdit ? (
                  <select
                    value={m.role}
                    disabled={busy === m.userId}
                    onChange={(e) => void changeRole(m.userId, e.target.value as AssignableRole)}
                    className="rounded border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    {ASSIGNABLE.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="rounded bg-zinc-100 px-2 py-0.5 text-[10px] uppercase text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                    {m.role}
                  </span>
                )}
                {canEdit && (
                  <button
                    onClick={() =>
                      void remove(m.userId, m.user?.name || m.user?.email || 'member')
                    }
                    disabled={busy === m.userId}
                    className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-950/30"
                  >
                    Remove
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
