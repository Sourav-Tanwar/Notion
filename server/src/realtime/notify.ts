/**
 * Cross-process notification from the REST API → realtime (Hocuspocus).
 *
 * Why this exists
 * ---------------
 * Inline TEXT inside a block is already a CRDT operation that flows over
 * the WebSocket between clients in real time. STRUCTURAL changes to the
 * block list (create / delete / reorder) still travel through REST and
 * land in Mongo, so other tabs only see them after a manual reload.
 *
 * We close that gap by having the REST process ping the realtime process
 * after every structural mutation. The realtime process then bumps a tiny
 * `rev` map entry on the page's live Y.Doc, which fans out as a Y update
 * to every connected client. Clients observe the bump and refetch the
 * block list (merging to preserve any in-flight local edits).
 *
 * This deliberately keeps Mongo as the source of truth for blocks. The
 * Y.Doc carries only inline content + a small "something changed" beacon
 * for the list. Moving the full block list into the CRDT is possible
 * (and a logical Phase 9.x next step) but is a much larger refactor;
 * this design ships realtime block-list propagation today without
 * rewriting the optimistic-UI Zustand store.
 *
 * Failure mode
 * ------------
 * The realtime process being down or slow MUST NOT fail or delay a REST
 * mutation. Callers fire-and-forget; we log and swallow on error so a
 * planned realtime restart doesn't surface as a 500 on every user write.
 */

import { env } from '../config/env';

export interface NotifyBlocksOptions {
  /**
   * Client id of the originator (Yjs awareness clientId). The realtime
   * process echoes this back in the rev payload so the originating tab
   * can suppress its own refetch.
   */
  originClientId?: number;
}

export function notifyBlocksChanged(pageId: string, opts: NotifyBlocksOptions = {}): void {
  // Fire and forget — REST callers do not await this.
  void doNotify(pageId, opts).catch((err) => {
    // eslint-disable-next-line no-console
    console.warn('[notify] blocks-changed failed (non-fatal)', {
      pageId,
      error: err instanceof Error ? err.message : String(err),
    });
  });
}

async function doNotify(pageId: string, opts: NotifyBlocksOptions): Promise<void> {
  const url = `${env.realtimeInternalUrl}/__internal__/notify-blocks`;
  // 1s timeout: if realtime is wedged, fall back to "next page reload
  // shows the change" rather than blocking the REST response.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 1000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-secret': env.internalBroadcastSecret,
      },
      body: JSON.stringify({ pageId, originClientId: opts.originClientId }),
      signal: ctrl.signal,
    });
    if (!res.ok && res.status !== 204) {
      throw new Error(`notify-blocks returned ${res.status}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Tell connected clients that the comment set for this page changed
 * (new comment / reply / edit / delete / resolve). Bumps `rev.comments`
 * on the live Y.Doc; clients refetch the comment list on observe.
 *
 * Same fire-and-forget + realtime-down-is-non-fatal contract as
 * `notifyBlocksChanged`. Reuses the `/__internal__/notify-blocks` route
 * with an explicit `key` so we don't need a second internal endpoint.
 */
export function notifyCommentsChanged(pageId: string): void {
  void doNotifyRev(pageId, 'comments').catch((err) => {
    // eslint-disable-next-line no-console
    console.warn('[notify] comments-changed failed (non-fatal)', {
      pageId,
      error: err instanceof Error ? err.message : String(err),
    });
  });
}

async function doNotifyRev(pageId: string, key: string): Promise<void> {
  const url = `${env.realtimeInternalUrl}/__internal__/notify-blocks`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 1000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-secret': env.internalBroadcastSecret,
      },
      body: JSON.stringify({ pageId, key }),
      signal: ctrl.signal,
    });
    if (!res.ok && res.status !== 204) {
      throw new Error(`notify-blocks(${key}) returned ${res.status}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

export interface RestoreResultPayload {
  ok: true;
  blocksUpdated: number;
  live: boolean;
  beforeRevisionId: string | null;
  revision: number;
}

/**
 * Synchronously ask the realtime process to restore a page from the
 * named history revision.
 *
 * Unlike `notifyBlocksChanged`, this MUST await the response — restore
 * is a destructive write the user explicitly confirmed, and the REST
 * caller surfaces success/failure back to the UI. We use a longer
 * timeout to allow for the live transaction + tree reconcile work.
 *
 * The realtime process re-fetches the snapshot row itself; we send only
 * identifiers, not megabytes of state.
 */
export async function requestRestore(
  pageId: string,
  revisionId: string,
  actorUserId: string | null,
): Promise<RestoreResultPayload> {
  const url = `${env.realtimeInternalUrl}/__internal__/restore`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-secret': env.internalBroadcastSecret,
      },
      body: JSON.stringify({ pageId, revisionId, actorUserId }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`restore returned ${res.status}: ${text}`);
    }
    return (await res.json()) as RestoreResultPayload;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fire-and-forget request to archive the page's current state into
 * history. Called by the REST process after structural mutations
 * (reorder / upsert / delete) so that tree-only changes — which never
 * trigger Hocuspocus's `onStoreDocument` — still produce history rows.
 *
 * Throttled and deduped on the realtime side; safe to call after every
 * structural write. Failures are logged and swallowed so realtime
 * downtime can never break a REST mutation.
 */
export function requestArchive(pageId: string): void {
  void doRequestArchive(pageId).catch((err) => {
    // eslint-disable-next-line no-console
    console.warn('[notify] archive failed (non-fatal)', {
      pageId,
      error: err instanceof Error ? err.message : String(err),
    });
  });
}

async function doRequestArchive(pageId: string): Promise<void> {
  const url = `${env.realtimeInternalUrl}/__internal__/archive`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-secret': env.internalBroadcastSecret,
      },
      body: JSON.stringify({ pageId }),
      signal: ctrl.signal,
    });
    if (!res.ok && res.status !== 204) {
      throw new Error(`archive returned ${res.status}`);
    }
  } finally {
    clearTimeout(timer);
  }
}