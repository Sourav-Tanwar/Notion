/**
 * Mongo persistence + Block reconciliation for the realtime layer.
 *
 * Two responsibilities:
 *
 *  1) `loadDocument(pageId)`: rehydrate a Y.Doc from the latest snapshot in
 *     Mongo so a fresh Hocuspocus process serves the live state to the next
 *     connecting client. Without this, a server restart would silently
 *     orphan in-flight collab edits.
 *
 *  2) `storeDocument(pageId, ydoc)`: persist the encoded Y.Doc state AND
 *     reconcile each block's HTML back into `BlockModel.text`. The Y.Doc is
 *     the live runtime; `Block.text` is the REST-facing snapshot consumed
 *     by the public-share viewer, search, copy-to-plaintext, and any
 *     non-collaborative read path. Reconciliation keeps both consistent
 *     without forcing every consumer onto a WebSocket.
 *
 * Reconciliation uses `bulkWrite` with `unordered: true` so a single block
 * failing (e.g. it was deleted out from under the room) doesn't abort the
 * rest of the page's writes. We skip writes when the rendered HTML equals
 * the stored value to avoid churning `updatedAt` on idle blocks.
 */

import * as Y from 'yjs';
import { createHash } from 'node:crypto';
import { DocSnapshotModel } from './snapshot.model';
import { DocHistoryModel } from './history.model';
import { BlockModel } from '../modules/blocks/blocks.model';
import { fragmentToHtml } from './yjsToHtml';
import { env } from '../config/env';

const BLOCKS_MAP_KEY = 'blocks';

/**
 * Thrown when an encoded snapshot exceeds `env.maxSnapshotBytes`. The
 * realtime room stays alive (in-memory state is unaffected); only the
 * persistence write is skipped, so connected clients keep editing and the
 * next successful store after a shrink will catch up.
 */
export class SnapshotTooLargeError extends Error {
  constructor(public pageId: string, public bytes: number) {
    super(`snapshot for page=${pageId} is ${bytes} bytes, exceeds limit ${env.maxSnapshotBytes}`);
    this.name = 'SnapshotTooLargeError';
  }
}

export async function loadDocument(pageId: string): Promise<Uint8Array | null> {
  const snap = await DocSnapshotModel.findById(pageId).lean();
  if (!snap) return null;
  // Mongoose can hand the binary back as a Node Buffer (a Uint8Array
  // subclass), a BSON `Binary` wrapper (`{ buffer, sub_type }`), or an
  // ArrayBuffer view depending on driver version. The wrapper looks
  // syntactically valid but decodes to garbage in `Y.applyUpdate`,
  // which throws "Unexpected end of array" — the same corruption mode
  // that bit the history-preview path. Normalize once here.
  const raw = snap.state as unknown;
  let state: Uint8Array | null = null;
  if (raw instanceof Uint8Array) {
    state = raw;
  } else if (raw && typeof raw === 'object' && 'buffer' in (raw as Record<string, unknown>)) {
    const inner = (raw as { buffer: unknown }).buffer;
    state = inner instanceof Uint8Array ? inner : new Uint8Array(inner as ArrayBuffer);
  }
  if (!state || state.byteLength === 0) return null;
  return state;
}

/**
 * Drop a corrupted snapshot so the next load falls back to REST seeding.
 * Called when `Y.applyUpdate` throws in `onLoadDocument`.
 */
export async function dropCorruptSnapshot(pageId: string): Promise<void> {
  await DocSnapshotModel.deleteOne({ _id: pageId });
}

export async function storeDocument(pageId: string, doc: Y.Doc): Promise<void> {
  const state = Y.encodeStateAsUpdate(doc);
  const bytes = state.byteLength;

  if (bytes > env.maxSnapshotBytes) {
    // Refuse the write but keep the room alive — in-memory state is
    // unaffected, peers keep editing, and the next store after a shrink
    // (block delete, etc.) will succeed.
    throw new SnapshotTooLargeError(pageId, bytes);
  }

  // Upsert + atomic revision bump in a single round-trip.
  const updated = await DocSnapshotModel.findOneAndUpdate(
    { _id: pageId },
    {
      $set: { state: Buffer.from(state) },
      $inc: { revision: 1 },
      $setOnInsert: { _id: pageId },
    },
    { upsert: true, new: true, lean: true },
  );

  await reconcileBlocks(pageId, doc);
  await maybeArchiveHistory(pageId, state, updated?.revision ?? 0);
}

/**
 * Throttled append into `DocHistoryModel`.
 *
 * Skips when the most recent archive row for this page is younger than
 * `env.historyMinIntervalMs` (keystroke-debounced stores would otherwise
 * fill the archive with near-duplicates) OR when the new state's hash
 * matches the previous row (idle pages where the user typed nothing
 * past the throttle window). After a successful insert, prunes rows
 * past `env.historyRetainCount`.
 *
 * The dedupe hash covers both the Y state AND the captured BlockModel
 * tree. Without the tree component, structural-only mutations driven
 * via REST (reorder, turn-into, delete) leave the Y bytes unchanged
 * and would be silently dropped as duplicates — making tree-restore
 * impossible to test.
 */
export async function maybeArchiveHistory(
  pageId: string,
  state: Uint8Array,
  revision: number,
): Promise<void> {
  if (env.historyRetainCount <= 0) return;

  const tree = await captureBlockTree(pageId);
  const hash = hashStateAndTree(state, tree);
  const latest = await DocHistoryModel.findOne({ pageId })
    .sort({ createdAt: -1 })
    .select('createdAt contentHash')
    .lean();
  if (latest) {
    const tooSoon =
      Date.now() - new Date(latest.createdAt).getTime() < env.historyMinIntervalMs;
    if (tooSoon) return;
    if (latest.contentHash && latest.contentHash === hash) return;
  }

  await DocHistoryModel.create({
    pageId,
    state: Buffer.from(state),
    revision,
    sizeBytes: state.byteLength,
    contentHash: hash,
    cause: 'autosave',
    createdBy: null,
    tree,
  });

  // Retention: keep newest N, drop the rest. We do this with a sort+skip
  // rather than an aggregation to keep the index usage straightforward.
  const overflow = await DocHistoryModel.find({ pageId })
    .sort({ createdAt: -1 })
    .skip(env.historyRetainCount)
    .select('_id')
    .lean();
  if (overflow.length) {
    await DocHistoryModel.deleteMany({ _id: { $in: overflow.map((r) => r._id) } });
  }
}

export function hashState(state: Uint8Array): string {
  return createHash('sha256').update(state).digest('hex');
}

/**
 * Combined fingerprint of the Y state + the structural block tree.
 * Tree entries are sorted by id so Mongo's iteration order doesn't
 * destabilize the hash. Used by `maybeArchiveHistory` so reorder /
 * turn-into / parent changes (which leave the Y bytes untouched but
 * mutate `BlockModel`) bust the dedupe and produce a new history row.
 */
export function hashStateAndTree(
  state: Uint8Array,
  tree: { id: string; parentId: string | null; order: number; type: string; props: Record<string, unknown> }[],
): string {
  const sorted = [...tree].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const treeBuf = Buffer.from(
    JSON.stringify(
      sorted.map((n) => ({
        id: n.id,
        parentId: n.parentId,
        order: n.order,
        type: n.type,
        props: n.props ?? {},
      })),
    ),
    'utf8',
  );
  return createHash('sha256').update(state).update(treeBuf).digest('hex');
}

/**
 * Snapshot of `BlockModel` for a page, in the shape the history row's
 * `tree[]` field stores. Used both by autosave archiving and by the
 * "before" snapshot taken at the start of a restore.
 */
export async function captureBlockTree(pageId: string): Promise<
  {
    id: string;
    parentId: string | null;
    order: number;
    type: string;
    props: Record<string, unknown>;
  }[]
> {
  const rows = await BlockModel.find({ pageId })
    .select('_id parentId order type props')
    .lean();
  return rows.map((r) => ({
    id: r._id as unknown as string,
    parentId: (r.parentId as string | null) ?? null,
    order: typeof r.order === 'number' ? r.order : 0,
    type: r.type as string,
    props: (r.props as Record<string, unknown>) ?? {},
  }));
}

/**
 * Reconcile each Y.XmlFragment in `ydoc.getMap('blocks')` back into
 * `BlockModel.text`. We don't create blocks here — the block document is
 * created via the REST API and we only sync its inline content. Orphan
 * fragments (a fragment whose block id no longer exists in Mongo) are
 * ignored; they'll be GC'd when the page is permanently deleted.
 */
async function reconcileBlocks(pageId: string, doc: Y.Doc): Promise<void> {
  const blocks = doc.getMap<Y.XmlFragment>(BLOCKS_MAP_KEY);
  if (blocks.size === 0) return;

  const blockIds: string[] = [];
  const rendered = new Map<string, string>();
  blocks.forEach((frag, id) => {
    if (!(frag instanceof Y.XmlFragment)) return;
    blockIds.push(id);
    rendered.set(id, fragmentToHtml(frag));
  });

  if (blockIds.length === 0) return;

  // Filter to blocks that actually exist on this page AND whose text
  // differs from what we'd write. Two motivations:
  //   - Skip orphan fragments left behind by a delete-then-rename storm.
  //   - Avoid bumping `updatedAt` on idle blocks (rendering yields the same
  //     HTML when only a peer's cursor moved).
  const current = await BlockModel.find(
    { _id: { $in: blockIds }, pageId },
    { _id: 1, text: 1 },
  ).lean();

  const ops = [] as { updateOne: { filter: object; update: object } }[];
  for (const row of current) {
    const id = row._id as unknown as string;
    const next = rendered.get(id);
    if (next === undefined) continue;
    if (row.text === next) continue;
    ops.push({
      updateOne: {
        filter: { _id: id, pageId },
        update: { $set: { text: next } },
      },
    });
  }

  if (ops.length === 0) return;
  await BlockModel.bulkWrite(ops, { ordered: false });
}
