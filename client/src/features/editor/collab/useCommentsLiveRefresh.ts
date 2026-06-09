/**
 * Live comments refresh.
 *
 * Comments travel over REST (not the CRDT), so a peer adding / resolving a
 * comment is invisible until reload. The REST process bumps `rev.comments`
 * on the page's live Y.Doc after every comment mutation; this hook observes
 * that beacon and refetches the page's comment list.
 *
 * Mirrors `useBlocksLiveRefresh`. No self-suppression: comment writes here
 * already `await fetchPage` after mutating, so a redundant refetch from our
 * own bump is harmless and keeps the code simple.
 */

import { useEffect } from 'react';
import { useCollab } from './CollabContext';
import { useCommentsStore } from '@/stores/comments.store';
import type { ID } from '@/types/domain';

interface RevPayload {
  ts: number;
  origin: number | null;
}

export function useCommentsLiveRefresh(pageId: ID): void {
  const { doc } = useCollab();

  useEffect(() => {
    const rev = doc.getMap('rev');
    let lastSeen = rev.get('comments') as RevPayload | undefined;

    const onChange = (): void => {
      const next = rev.get('comments') as RevPayload | undefined;
      if (!next) return;
      if (lastSeen && next.ts === lastSeen.ts) return;
      lastSeen = next;
      void useCommentsStore.getState().fetchPage(pageId);
    };

    rev.observe(onChange);
    return () => rev.unobserve(onChange);
  }, [doc, pageId]);
}
