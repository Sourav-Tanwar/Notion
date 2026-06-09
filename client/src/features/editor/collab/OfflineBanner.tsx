/**
 * Editor-wide offline banner.
 *
 * The `StatusPill` in the header surfaces the same information, but only
 * users who already know to look in the corner will notice it. When the
 * WebSocket is actually down, we want a loud-but-non-modal strip across
 * the top of the editor so the user is never silently editing into a
 * void.
 *
 * Behaviour
 * ---------
 * - Renders nothing while connected+synced (the steady state).
 * - Shows a yellow "Working offline" strip while not connected. Edits
 *   are still accepted — `y-indexeddb` persists them locally and they'll
 *   replay on reconnect.
 * - On the disconnected→connected+synced transition, flashes a small
 *   green "Synced" toast for ~2s so the user knows their changes landed.
 *
 * We deliberately avoid blocking input or showing a modal: a user mid-
 * keystroke during a network blip should never lose their flow.
 */

import { useEffect, useRef, useState } from 'react';
import { useCollab } from './CollabContext';

const SYNCED_TOAST_MS = 2000;

export function OfflineBanner(): JSX.Element | null {
  const { status, synced } = useCollab();
  const wasOffline = useRef(false);
  const [showSynced, setShowSynced] = useState(false);

  const live = status === 'connected' && synced;

  useEffect(() => {
    if (!live) {
      wasOffline.current = true;
      return;
    }
    if (wasOffline.current) {
      wasOffline.current = false;
      setShowSynced(true);
      const t = setTimeout(() => setShowSynced(false), SYNCED_TOAST_MS);
      return () => clearTimeout(t);
    }
  }, [live]);

  if (!live) {
    const label =
      status === 'connecting' ? 'Reconnecting…' : 'Working offline — changes will sync when reconnected';
    return (
      <div
        role="status"
        aria-live="polite"
        className="sticky top-0 z-30 flex items-center justify-center gap-2 border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200"
      >
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
        {label}
      </div>
    );
  }

  if (showSynced) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none sticky top-0 z-30 flex items-center justify-center gap-2 border-b border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200"
      >
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Synced
      </div>
    );
  }

  return null;
}
