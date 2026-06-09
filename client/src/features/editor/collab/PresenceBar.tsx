/**
 * Avatar pills for the collaborators currently on this page.
 *
 * Dedupes by `user.id` because the same human can have multiple tabs open,
 * each producing its own awareness clientId. We show one pill per human and
 * count tabs in a tooltip.
 */

import { useMemo } from 'react';
import { useAwarenessStates } from './useAwarenessStates';

const MAX_VISIBLE = 5;

export function PresenceBar(): JSX.Element | null {
  const remote = useAwarenessStates();

  const users = useMemo(() => {
    const byUser = new Map<string, { name: string; color: string; avatarUrl: string | null; tabs: number }>();
    for (const { state } of remote) {
      const u = state.user;
      const prev = byUser.get(u.id);
      if (prev) prev.tabs += 1;
      else byUser.set(u.id, { name: u.name, color: u.color, avatarUrl: u.avatarUrl, tabs: 1 });
    }
    return [...byUser.values()];
  }, [remote]);

  if (users.length === 0) return null;

  const visible = users.slice(0, MAX_VISIBLE);
  const overflow = users.length - visible.length;

  return (
    <div className="flex items-center" aria-label="Collaborators on this page">
      {visible.map((u, i) => (
        <Pill key={u.name + i} name={u.name} color={u.color} avatarUrl={u.avatarUrl} tabs={u.tabs} />
      ))}
      {overflow > 0 && (
        <span className="ml-1 rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
          +{overflow}
        </span>
      )}
    </div>
  );
}

function Pill({
  name,
  color,
  avatarUrl,
  tabs,
}: {
  name: string;
  color: string;
  avatarUrl: string | null;
  tabs: number;
}): JSX.Element {
  const initial = (name || '?').trim().charAt(0).toUpperCase();
  const label = tabs > 1 ? `${name} (${tabs} tabs)` : name;
  return (
    <div
      title={label}
      className="-ml-1.5 inline-flex h-6 w-6 items-center justify-center overflow-hidden rounded-full border-2 border-white text-[10px] font-semibold text-white shadow-sm dark:border-zinc-900"
      style={{ background: color }}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <span>{initial}</span>
      )}
    </div>
  );
}
