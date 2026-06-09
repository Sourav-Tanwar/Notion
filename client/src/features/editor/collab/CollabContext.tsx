/**
 * CollabContext — one Y.Doc + Hocuspocus provider per page lifecycle.
 *
 * Mounted near the top of the Editor for a given pageId. Everything below
 * (PresenceBar, RemoteCarets, useLocalAwareness, future y-prosemirror
 * bindings) reads from this context.
 *
 * Why a Context (and not a Zustand store):
 *   - The connection is tied 1:1 to the editor mount, not to global state.
 *     Two pages = two providers, and React unmount cleanly tears down.
 *   - The objects we expose (Y.Doc, provider, Awareness) are mutable handles,
 *     not serializable state. Zustand expects diffable values; passing live
 *     CRDT references through it works but invites footguns.
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type * as Y from 'yjs';
import type { HocuspocusProvider } from '@hocuspocus/provider';
import type { Awareness } from 'y-protocols/awareness';
import { connectPage } from '@/services/realtime';

export type CollabStatus = 'connecting' | 'connected' | 'disconnected';

interface CollabValue {
  pageId: string;
  doc: Y.Doc;
  provider: HocuspocusProvider;
  awareness: Awareness;
  status: CollabStatus;
  /** True once the provider has confirmed initial sync with the server. */
  synced: boolean;
}

const CollabContext = createContext<CollabValue | null>(null);

export function useCollab(): CollabValue {
  const ctx = useContext(CollabContext);
  if (!ctx) throw new Error('useCollab called outside <CollabProvider>');
  return ctx;
}

/** Same as useCollab, but returns null when no provider is mounted —
 *  used by leaf components that should silently no-op outside collab. */
export function useCollabOptional(): CollabValue | null {
  return useContext(CollabContext);
}

interface Props {
  pageId: string;
  children: ReactNode;
}

export function CollabProvider({ pageId, children }: Props): JSX.Element {
  // `handle` is recreated when pageId changes; React guarantees that the
  // previous Editor instance unmounts first, so destroy() is safe to call
  // unconditionally in cleanup.
  const handle = useMemo(() => connectPage(pageId), [pageId]);

  // useSyncExternalStore reads the LIVE provider state on every render —
  // no race with status events that fired before our effect subscribed
  // (which used to leave the pill stuck on "Reconnecting…" after a fresh
  // login / page refresh).
  const status = useSyncExternalStore<CollabStatus>(
    (notify) => {
      const { provider } = handle;
      const handler = () => notify();
      provider.on('status', handler);
      provider.on('synced', handler);
      provider.on('disconnect', handler);
      return () => {
        provider.off('status', handler);
        provider.off('synced', handler);
        provider.off('disconnect', handler);
      };
    },
    () => {
      const s = handle.provider.status as unknown as string;
      if (s === 'connected') return 'connected';
      if (s === 'disconnected') return 'disconnected';
      return 'connecting';
    },
  );

  const synced = useSyncExternalStore<boolean>(
    (notify) => {
      const { provider } = handle;
      const handler = () => notify();
      provider.on('synced', handler);
      provider.on('disconnect', handler);
      provider.on('status', handler);
      return () => {
        provider.off('synced', handler);
        provider.off('disconnect', handler);
        provider.off('status', handler);
      };
    },
    () => handle.provider.isSynced,
  );

  // Destroy the provider on unmount / pageId change.
  useEffect(() => {
    return () => {
      handle.destroy();
    };
  }, [handle]);

  const value = useMemo<CollabValue>(
    () => ({
      pageId,
      doc: handle.doc,
      provider: handle.provider,
      awareness: handle.provider.awareness!,
      status,
      synced,
    }),
    [handle, status, synced, pageId],
  );

  return <CollabContext.Provider value={value}>{children}</CollabContext.Provider>;
}
