/**
 * Realtime client for one page.
 *
 * Pattern
 * -------
 * `connectPage(pageId)` returns a handle owning:
 *   - a `Y.Doc` (the CRDT replica for this page)
 *   - a `HocuspocusProvider` (WebSocket transport)
 *   - a `destroy()` cleanup that releases both + the token subscription
 *
 * Slice 8.2 will bind a Y.XmlFragment from this doc into ProseMirror via
 * `y-prosemirror`. Slice 8.1 only delivers the transport so the editor can
 * be wired in isolation.
 *
 * Token handling
 * --------------
 * The Hocuspocus provider snapshots the JWT once at construction time. Our
 * access tokens have a short TTL (~15m) and get rotated silently by the
 * HTTP layer. If we did nothing, an idle tab would keep a stale token in
 * memory and the next reconnect (network blip / sleep) would fail authn.
 *
 * Fix: subscribe to `tokens` and, whenever the value changes, call
 * `provider.configuration.token = newToken`. Hocuspocus reads that field
 * on every reconnect attempt, so the next handshake uses the fresh token
 * automatically — no forced disconnect required.
 */

import { HocuspocusProvider } from '@hocuspocus/provider';
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { tokens } from './http';

/**
 * Resolve the realtime WebSocket URL. In dev we default to the same host
 * the SPA was loaded from on port 4001; in prod, set VITE_REALTIME_URL to
 * the public wss:// endpoint.
 */
function resolveRealtimeUrl(): string {
  const fromEnv = import.meta.env.VITE_REALTIME_URL as string | undefined;
  if (fromEnv) return fromEnv;
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.hostname}:4001`;
}

export interface RealtimeHandle {
  doc: Y.Doc;
  provider: HocuspocusProvider;
  /**
   * IndexedDB-backed local persistence for this page's Y.Doc. Hydrates
   * the doc from the browser store before (and independently of) the
   * WebSocket sync, so a reload while offline still shows the user's
   * unsynced edits. Exposed mainly so tests can await `whenSynced`.
   */
  idb: IndexeddbPersistence;
  destroy: () => void;
}

// Module-scoped cache so React 18 StrictMode's dev-only
// setup → cleanup → setup cycle (and tab navigations that revisit the
// same page) reuse the same Y.Doc + WebSocket instead of tearing it down
// and rebuilding. Without this, StrictMode destroys the provider between
// the two effect-setup phases, leaving the second subscriber wired to a
// dead provider — which is why the StatusPill used to sit on
// "Reconnecting…" indefinitely until the user navigated to another page
// (which created a fresh provider).
interface CachedHandle {
  doc: Y.Doc;
  provider: HocuspocusProvider;
  idb: IndexeddbPersistence;
  refs: number;
  unsubscribeToken: () => void;
  teardownTimer: ReturnType<typeof setTimeout> | null;
}
const cache = new Map<string, CachedHandle>();

export function connectPage(pageId: string): RealtimeHandle {
  let entry = cache.get(pageId);

  if (entry) {
    // Re-acquire: bump refcount and cancel any pending teardown that was
    // scheduled by the previous holder's destroy().
    entry.refs += 1;
    if (entry.teardownTimer !== null) {
      clearTimeout(entry.teardownTimer);
      entry.teardownTimer = null;
    }
    return wrapHandle(pageId, entry);
  }

  const doc = new Y.Doc();
  // IndexedDB persistence is attached BEFORE the Hocuspocus provider so
  // any locally-stored state is applied to the doc first; then the
  // provider syncs the resulting state vector with the server. This is
  // what gives us offline-edit survival across reloads and seamless
  // resume after a network drop.
  const idb = new IndexeddbPersistence(`notion:page:${pageId}`, doc);
  const provider = new HocuspocusProvider({
    url: resolveRealtimeUrl(),
    name: pageId,
    document: doc,
    // Function form: Hocuspocus pulls the latest access token on every
    // (re)connect attempt. A bare string would be snapshotted at
    // construction and any rotation / post-login race would leave the
    // socket reconnecting with a stale (or empty) token forever.
    token: () => tokens.get() ?? '',
    preserveConnection: false,
  });

  // Forced reconnect when the token transitions empty→present. Handles
  // the fresh-login race where the provider mounted before the access
  // token had been hydrated by /refresh.
  let lastToken = tokens.get();
  const unsubscribeToken = tokens.subscribe(() => {
    const next = tokens.get();
    const prev = lastToken;
    lastToken = next;
    if (!prev && next) {
      provider.disconnect();
      void provider.connect();
    }
  });

  entry = { doc, provider, idb, refs: 1, unsubscribeToken, teardownTimer: null };
  cache.set(pageId, entry);
  return wrapHandle(pageId, entry);
}

function wrapHandle(pageId: string, entry: CachedHandle): RealtimeHandle {
  let released = false;
  return {
    doc: entry.doc,
    provider: entry.provider,
    idb: entry.idb,
    destroy() {
      if (released) return;
      released = true;
      entry.refs -= 1;
      if (entry.refs > 0) return;
      // Defer real teardown one macrotask so StrictMode's immediate
      // re-setup (which calls connectPage again synchronously) can
      // re-acquire and cancel.
      entry.teardownTimer = setTimeout(() => {
        if (entry.refs > 0) return;
        cache.delete(pageId);
        entry.unsubscribeToken();
        entry.provider.destroy();
        // IndexedDB persistence must be torn down BEFORE the doc so its
        // change observer detaches cleanly. The persisted state on disk
        // is preserved across destroy() — that's the whole point.
        void entry.idb.destroy();
        entry.doc.destroy();
      }, 0);
    },
  };
}
