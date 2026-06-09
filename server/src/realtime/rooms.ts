import type { Hocuspocus } from '@hocuspocus/server';
import * as Y from 'yjs';
import type { RealtimePrincipal } from './auth';
import {
  loadDocument,
  storeDocument,
  dropCorruptSnapshot,
  SnapshotTooLargeError,
} from './persistence';

/**
 * Room lifecycle wiring.
 *
 * Hocuspocus calls `onLoadDocument` exactly once per room (the first
 * connection), and `onStoreDocument` debounced after edits (default ~2s
 * after the last change). Both flow through the Mongo persistence adapter.
 *
 * Awareness (8.2) installs its own hook into the same `configure` call
 * site as needed; no changes here.
 */
export function wireRoomLifecycle(server: Hocuspocus): void {
  server.configure({
    onConnect: async () => {
      // `onConnect` fires on the raw WebSocket open, BEFORE `onAuthenticate`
      // has set the connection context — `data.context.user` is intentionally
      // undefined here. We rely on `onAuthenticate` (see ./auth.ts) to be the
      // authoritative gate: if it throws, Hocuspocus refuses to deliver any
      // Yjs traffic on this socket. Don't reject inside `onConnect`, or every
      // connection will be torn down before auth even runs.
    },

    /**
     * Post-auth hook. By the time `connected` fires the principal is on
     * `data.context.user`. This is the right place for join logging.
     */
    connected: async (data) => {
      const p = data.context.user as RealtimePrincipal | undefined;
      // eslint-disable-next-line no-console
      console.log(
        `[realtime] connect page=${data.documentName} user=${p?.userId ?? '?'} level=${p?.level ?? '?'} readonly=${data.connection.readOnly}`,
      );
    },

    onDisconnect: async (data) => {
      const p = data.context.user as RealtimePrincipal | undefined;
      // eslint-disable-next-line no-console
      console.log(
        `[realtime] disconnect page=${data.documentName} user=${p?.userId ?? '?'}`,
      );
    },

    /**
     * Rehydrate the room from Mongo. We apply the snapshot onto the
     * incoming `document` (which Hocuspocus pre-constructs) — returning a
     * new Y.Doc isn't supported by the API. If no snapshot exists yet, we
     * leave the doc untouched and let the first client seed it from REST.
     */
    onLoadDocument: async ({ documentName, document }) => {
      const state = await loadDocument(documentName);
      if (state) {
        try {
          Y.applyUpdate(document, state);
        } catch (err) {
          // Corrupt snapshot would otherwise abort the load and break the
          // room for every client. Drop it and continue with an empty doc;
          // the first connecting client will reseed from REST.
          // eslint-disable-next-line no-console
          console.error(
            `[realtime] corrupt snapshot for page=${documentName}, dropping`,
            err,
          );
          await dropCorruptSnapshot(documentName);
        }
      }
      // eslint-disable-next-line no-console
      console.log(`[realtime] loaded page=${documentName} hasSnapshot=${!!state}`);
      return document;
    },

    onChange: async ({ documentName, context }) => {
      const p = context.user as RealtimePrincipal | undefined;
      // eslint-disable-next-line no-console
      console.log(`[realtime] change page=${documentName} from=${p?.userId ?? '?'}`);
    },

    /**
     * Persist + reconcile. Hocuspocus debounces this for us; we don't
     * batch further. Errors here are logged but do NOT propagate — failing
     * a single persist must not tear down a live room.
     */
    onStoreDocument: async ({ documentName, document }) => {
      try {
        await storeDocument(documentName, document);
        // eslint-disable-next-line no-console
        console.log(`[realtime] stored page=${documentName}`);
      } catch (err) {
        if (err instanceof SnapshotTooLargeError) {
          // Loud-but-non-fatal: editing continues, only persistence is
          // paused until the doc shrinks below the cap.
          // eslint-disable-next-line no-console
          console.warn(`[realtime] ${err.message} — persistence paused for this page`);
          return;
        }
        // eslint-disable-next-line no-console
        console.error(`[realtime] storeDocument failed page=${documentName}`, err);
      }
    },
  });
}
