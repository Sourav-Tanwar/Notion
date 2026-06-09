/**
 * Live block-list refresh.
 *
 * Inline text already syncs CRDT-style via the Y.Doc fragments. Structural
 * changes to the block list (create / delete / reorder) still travel
 * through REST, so without a nudge the other tab only sees them on the
 * next page reload.
 *
 * The server side (`realtime/notify.ts`) bumps a `rev` map entry on the
 * page's live Y.Doc after every structural REST mutation. This hook
 * subscribes to that map and, on observing a bump, refetches the page's
 * block list. The store's `fetchPage` merge logic preserves any in-flight
 * local edits (dirty / deletedBuffer), so a refetch racing against a
 * user keystroke is safe.
 *
 * Self-suppression: we tag every bump with `origin: awareness.clientID`
 * so the tab that caused the change can skip its own refetch (it already
 * applied the change locally + sent it via REST).
 */

import { useEffect } from 'react';
import { useCollab } from './CollabContext';
import { useBlocksStore } from '@/stores/blocks.store';
import type { ID } from '@/types/domain';

interface RevPayload {
  ts: number;
  origin: number | null;
}

export function useBlocksLiveRefresh(pageId: ID): void {
  const { doc, awareness } = useCollab();

  useEffect(() => {
    const rev = doc.getMap('rev');
    // Anchor: ignore the initial value present at mount (it's either
    // missing or carries the snapshot's last value, which we definitely
    // already reflect via the routine fetchPage call in Editor).
    let initialSeen = rev.get('blocks') as RevPayload | undefined;

    const onChange = () => {
      const next = rev.get('blocks') as RevPayload | undefined;
      if (!next) return;
      if (initialSeen && next.ts === initialSeen.ts) return;
      initialSeen = next;
      // Skip refetch if WE were the originator — the local store is
      // already authoritative for our own mutation.
      if (next.origin != null && next.origin === awareness.clientID) return;
      void useBlocksStore.getState().fetchPage(pageId);
    };

    rev.observe(onChange);
    return () => rev.unobserve(onChange);
  }, [doc, awareness, pageId]);
}
