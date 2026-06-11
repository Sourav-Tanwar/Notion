/**
 * Live inline-database refresh.
 *
 * Database rows/columns are persisted via REST (not Yjs), so peers won't see
 * each other's cell edits until reload unless we nudge a refetch. The server
 * bumps `rev.database` on the page's live Y.Doc after every database mutation;
 * this hook observes that beacon and reloads all database entities currently
 * referenced by `database` blocks on this page.
 */

import { useEffect } from 'react';
import { useCollab } from './CollabContext';
import { useBlocksStore } from '@/stores/blocks.store';
import { useDatabaseStore } from '@/stores/database.store';
import type { ID } from '@/types/domain';

interface RevPayload {
  ts: number;
  origin: number | null;
}

export function useDatabaseLiveRefresh(pageId: ID): void {
  const { doc } = useCollab();

  useEffect(() => {
    const rev = doc.getMap('rev');
    let lastSeen = rev.get('database') as RevPayload | undefined;

    const onChange = (): void => {
      const next = rev.get('database') as RevPayload | undefined;
      if (!next) return;
      if (lastSeen && next.ts === lastSeen.ts) return;
      lastSeen = next;

      const state = useBlocksStore.getState();
      const root = state.rootByPage[pageId] ?? [];
      const queue = [...root];
      const seenDb = new Set<string>();
      while (queue.length) {
        const id = queue.shift()!;
        const b = state.byId[id];
        if (!b) continue;
        if (b.type === 'database') {
          const dbId = typeof b.props.databaseId === 'string' ? b.props.databaseId : '';
          if (dbId) seenDb.add(dbId);
        }
        const kids = state.childrenOf[id] ?? [];
        for (const k of kids) queue.push(k);
      }

      for (const dbId of seenDb) {
        void useDatabaseStore.getState().load(dbId);
      }
    };

    rev.observe(onChange);
    return () => rev.unobserve(onChange);
  }, [doc, pageId]);
}
