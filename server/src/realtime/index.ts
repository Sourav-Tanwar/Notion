/**
 * Realtime server (Hocuspocus + Yjs).
 *
 * Architecture
 * ------------
 * - Each PAGE is a Yjs document. The Hocuspocus "documentName" is the
 *   page id, so rooms have natural per-page isolation. The Editor will
 *   bind a Y.XmlFragment to ProseMirror in Slice 8.2; the Sidebar metadata
 *   (titles, icons, etc.) still flows through the REST API.
 *
 * - AuthN: every connection presents the user's short-lived access JWT in
 *   the `token` provider option. We verify with the same secret + algorithm
 *   as the REST API. Connections without a valid token are rejected at
 *   handshake — no anonymous "view" hits this server (public share links
 *   stay on the REST viewer).
 *
 * - AuthZ: after JWT verification, we resolve the page → workspace, look up
 *   membership + grants via `pagePermissionsService`, and decide read-only
 *   vs read-write. We attach the resolved principal to the connection
 *   context so the rest of Hocuspocus can use it without re-querying.
 *
 * - Persistence: not handled here. Slice 8.3 plugs in a Mongo adapter that
 *   reconciles Yjs updates back into the `Block` collection so non-realtime
 *   API consumers still see consistent state. For now updates live only in
 *   memory; a server restart drops in-flight collab state, which is fine
 *   for local development.
 *
 * Why a separate port / process boundary
 * --------------------------------------
 * Express handles request/response cycles; Hocuspocus handles long-lived
 * WebSocket connections. Co-hosting them in one Node process at one port
 * is possible (Hocuspocus can attach to an existing http server), but
 * separating them makes scaling decisions trivial — one process serves
 * REST, N processes serve realtime, fronted by a sticky load balancer.
 * Defaulting to a dedicated REALTIME_PORT mirrors that production layout
 * even in dev.
 */

import { Hocuspocus } from '@hocuspocus/server';
import { env } from '../config/env';
import { authenticate } from './auth';
import { wireRoomLifecycle } from './rooms';
import { restoreSnapshot, RestoreError } from './restore';
import { loadDocument, maybeArchiveHistory } from './persistence';
import { DocSnapshotModel } from './snapshot.model';
import * as Y from 'yjs';

export function buildRealtimeServer(): Hocuspocus {
  const server = new Hocuspocus({
    name: 'notion-clone-realtime',
    port: env.realtimePort,
    timeout: 30_000, // idle ping/pong window

    /**
     * Auth runs on every new connection (per tab). We MUST throw on any
     * authn/authz failure; returning resolves the connection as guest, which
     * Hocuspocus would then treat as a writer.
     */
    async onAuthenticate(data) {
      return authenticate(data);
    },

    /**
     * Internal HTTP endpoints, served on the same port as the WS upgrade.
     *
     * `POST /__internal__/notify-blocks` — invoked by the REST process after
     * structural block mutations (create / delete / reorder). Body:
     * `{ pageId: string, originClientId?: number }`. We mutate a tiny
     * `Y.Map('rev')` entry on the page's live Y.Doc so every connected
     * client observes a Y update and can react (refetch the block list).
     *
     * Auth: shared secret header. Internal-only; never expose to the
     * public load balancer.
     *
     * Hocuspocus convention: returning normally lets it write its default
     * "200 OK" response on top of ours. To short-circuit cleanly, we end
     * the response ourselves and then throw a falsy value — the framework
     * interprets that as "hook handled it, stop processing" and does NOT
     * re-throw. See `hocuspocus-server.cjs` `requestHandler`.
     */
    async onRequest(data) {
      const { request, response, instance } = data;
      if (request.method !== 'POST') return;

      // Shared-secret gate for all internal routes. Internal-only by
      // design — never expose `/__internal__/*` past the LB.
      const isInternal = request.url?.startsWith('/__internal__/') ?? false;
      if (!isInternal) return;

      const secret = request.headers['x-internal-secret'];
      if (secret !== env.internalBroadcastSecret) {
        response.statusCode = 401;
        response.end('unauthorized');
        // eslint-disable-next-line no-throw-literal
        throw null;
      }

      try {
        if (request.url === '/__internal__/notify-blocks') {
          await handleNotifyBlocks(request, response, instance);
        } else if (request.url === '/__internal__/restore') {
          await handleRestore(request, response, instance);
        } else if (request.url === '/__internal__/archive') {
          await handleArchive(request, response, instance);
        } else {
          response.statusCode = 404;
          response.end('not found');
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[realtime] internal route failed', { url: request.url, err });
        if (!response.writableEnded) {
          response.statusCode = 500;
          response.end('internal');
        }
      }

      // Short-circuit Hocuspocus's default 200 OK responder.
      // eslint-disable-next-line no-throw-literal
      throw null;
    },
  });

  wireRoomLifecycle(server);
  return server;
}

async function readJsonBody<T>(request: import('http').IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const c of request) chunks.push(c as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as T;
}

async function handleNotifyBlocks(
  request: import('http').IncomingMessage,
  response: import('http').ServerResponse,
  instance: Hocuspocus,
): Promise<void> {
  const body = await readJsonBody<{ pageId?: string; originClientId?: number; key?: string }>(request);
  const pageId = body.pageId;
  if (!pageId || typeof pageId !== 'string') {
    response.statusCode = 400;
    response.end('pageId required');
    return;
  }
  if (!instance.documents.has(pageId)) {
    // No clients connected — nothing to broadcast. Forcing the room
    // open here would leak a Y.Doc per REST write.
    response.statusCode = 204;
    response.end();
    return;
  }
  // `key` lets one route bump different rev channels (blocks / comments / …)
  // without standing up a near-identical internal endpoint per channel.
  const revKey = typeof body.key === 'string' && body.key ? body.key : 'blocks';
  const conn = await instance.openDirectConnection(pageId);
  try {
    await conn.transact((doc) => {
      const rev = doc.getMap('rev');
      rev.set(revKey, {
        ts: Date.now(),
        origin: body.originClientId ?? null,
      });
    });
  } finally {
    await conn.disconnect();
  }
  response.statusCode = 204;
  response.end();
}

/**
 * `POST /__internal__/restore`
 *
 * Headers: `x-internal-secret`.
 * Body: JSON `{ pageId, revisionId, actorUserId? }`.
 * Response: JSON `{ ok, blocksUpdated, live, beforeRevisionId, revision }`.
 *
 * The realtime process re-fetches the history row itself (cheap indexed
 * lookup) — REST only forwards identifiers + the acting user. Keeping
 * row-loading on this side means the same Mongoose connection that owns
 * the live `Y.Doc` also owns the read, and we don't have to ship
 * megabyte-sized state bodies between processes.
 */
async function handleRestore(
  request: import('http').IncomingMessage,
  response: import('http').ServerResponse,
  instance: Hocuspocus,
): Promise<void> {
  const body = await readJsonBody<{
    pageId?: string;
    revisionId?: string;
    actorUserId?: string | null;
  }>(request);
  if (!body.pageId || !body.revisionId) {
    response.statusCode = 400;
    response.end('pageId and revisionId required');
    return;
  }
  try {
    const result = await restoreSnapshot(
      instance,
      body.pageId,
      body.revisionId,
      body.actorUserId ?? null,
    );
    response.statusCode = 200;
    response.setHeader('content-type', 'application/json; charset=utf-8');
    response.end(JSON.stringify(result));
  } catch (err) {
    if (err instanceof RestoreError) {
      response.statusCode = err.status;
      response.setHeader('content-type', 'application/json; charset=utf-8');
      response.end(JSON.stringify({ error: err.message }));
      return;
    }
    throw err;
  }
}

/**
 * `POST /__internal__/archive`
 *
 * Headers: `x-internal-secret`.
 * Body: JSON `{ pageId }`.
 * Response: 204 (always — archiving is best-effort and the throttle
 * inside `maybeArchiveHistory` may legitimately skip).
 *
 * Why this exists
 * ---------------
 * Structural REST mutations (reorder, turn-into, delete) write straight
 * to `BlockModel` and never touch the Y.Doc, so Hocuspocus's
 * `onStoreDocument` never fires for them. Without this endpoint, those
 * changes would never produce a history row and tree-restore would have
 * nothing to restore from.
 *
 * We read the current Y state from the live room when one is open
 * (snapshot-fresh) and fall back to the cold `DocSnapshotModel` row
 * when no clients are connected. Throttling and dedupe live in
 * `maybeArchiveHistory` — the same code path autosaves use.
 */
async function handleArchive(
  request: import('http').IncomingMessage,
  response: import('http').ServerResponse,
  instance: Hocuspocus,
): Promise<void> {
  const body = await readJsonBody<{ pageId?: string }>(request);
  const pageId = body.pageId;
  if (!pageId || typeof pageId !== 'string') {
    response.statusCode = 400;
    response.end('pageId required');
    return;
  }

  let state: Uint8Array | null = null;
  let revision = 0;
  if (instance.documents.has(pageId)) {
    const conn = await instance.openDirectConnection(pageId);
    try {
      await conn.transact((doc) => {
        state = Y.encodeStateAsUpdate(doc);
      });
    } finally {
      await conn.disconnect();
    }
    const snap = await DocSnapshotModel.findById(pageId).select('revision').lean();
    revision = snap?.revision ?? 0;
  } else {
    state = await loadDocument(pageId);
    const snap = await DocSnapshotModel.findById(pageId).select('revision').lean();
    revision = snap?.revision ?? 0;
  }

  if (!state) {
    // No Y state at all (page never had a collab edit). Use a fresh
    // empty-doc encoding as a placeholder — `Y.applyUpdate` accepts it
    // cleanly during restore, and the tree[] field carries the real
    // structural payload so reordered/turn-into changes still survive.
    state = Y.encodeStateAsUpdate(new Y.Doc());
  }

  await maybeArchiveHistory(pageId, state, revision);
  response.statusCode = 204;
  response.end();
}

/**
 * Standalone entrypoint. We deliberately do NOT couple realtime to the
 * Express bootstrap — `npm run realtime` runs this file. The two processes
 * share env, DB connection (each opens its own pool), and JWT secret.
 */
// Normalize path separators so this guard matches on Windows (`\`) as
// well as POSIX (`/`). Without the replace, `endsWith('realtime/index.ts')`
// silently returns false on Windows and the server never starts listening.
// Accept both `.ts` (dev under tsx) and `.js` (built artifact under node).
if (
  process.argv[1] &&
  /realtime\/index\.[tj]s$/.test(process.argv[1].replace(/\\/g, '/'))
) {
  // Don't let a single bad room (corrupt snapshot, transient DB blip in a
  // persistence hook, etc.) crash the whole realtime process and take
  // every other open page down with it. Log and continue.
  process.on('unhandledRejection', (err) => {
    // eslint-disable-next-line no-console
    console.error('[realtime] unhandledRejection', err);
  });
  process.on('uncaughtException', (err) => {
    // eslint-disable-next-line no-console
    console.error('[realtime] uncaughtException', err);
  });

  void (async () => {
    const { connectDB } = await import('../config/db');
    await connectDB();
    const server = buildRealtimeServer();
    await server.listen();
    // eslint-disable-next-line no-console
    console.log(`[realtime] listening on :${env.realtimePort}`);
  })();
}
