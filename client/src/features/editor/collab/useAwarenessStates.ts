/**
 * useAwarenessStates — subscribe to remote awareness changes with a
 * cheap shallow snapshot.
 *
 * Awareness fires a `change` event on every peer update. We pull the
 * remote state list once per change, dedupe-by-clientId, and let React
 * diff. The payload is small (<100 bytes per user) so we don't bother
 * memoizing per-client state.
 */

import { useEffect, useState } from 'react';
import { useCollab } from './CollabContext';
import { readRemoteStates, type AwarenessState } from './awareness';

export interface RemoteEntry {
  clientId: number;
  state: AwarenessState;
}

export function useAwarenessStates(): RemoteEntry[] {
  const { awareness } = useCollab();
  const [states, setStates] = useState<RemoteEntry[]>(() => readRemoteStates(awareness));

  useEffect(() => {
    const onChange = () => setStates(readRemoteStates(awareness));
    awareness.on('change', onChange);
    // Pull once on mount in case peers arrived between context creation
    // and our subscription registering.
    setStates(readRemoteStates(awareness));
    return () => awareness.off('change', onChange);
  }, [awareness]);

  return states;
}
