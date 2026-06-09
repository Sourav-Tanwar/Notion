/**
 * Connection status indicator.
 *
 * We surface "Reconnecting…" and "Offline" prominently because the failure
 * mode of silent realtime drift is invisible data loss in users' minds.
 * Green/connected state is intentionally subtle.
 */

import { useCollab } from './CollabContext';

export function StatusPill(): JSX.Element {
  const { status, synced } = useCollab();

  const { label, dot } =
    status === 'connected' && synced
      ? { label: 'Live', dot: 'bg-emerald-500' }
      : status === 'connected'
      ? { label: 'Syncing…', dot: 'bg-amber-500' }
      : status === 'connecting'
      ? { label: 'Reconnecting…', dot: 'bg-amber-500 animate-pulse' }
      : { label: 'Offline', dot: 'bg-zinc-400' };

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
      aria-live="polite"
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}
