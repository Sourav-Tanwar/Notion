/**
 * Restore a page's Yjs state + block tree from an archived revision.
 *
 * Called by the realtime process's `/__internal__/restore` handler; the
 * REST process forwards `{pageId, revisionId, actorUserId}` here after
 * authorization. Living in the realtime process keeps a single owner for
 * the live `Y.Doc`.
 *
 * What gets restored
 * ------------------
 *  1) **Block tree** (`BlockModel`): parent / order / type / props are
 *     overwritten from the row's `tree[]` projection. Blocks present
 *     today but absent in the snapshot are hard-deleted; blocks present
 *     in the snapshot but missing today are re-inserted with their old
 *     ids. This is what makes "restore" actually undo a delete or a
 *     reorder rather than just a text rewrite.
 *
 *  2) **Live Yjs doc** (`blocks` Y.Map): for each id in the restored
 *     tree, replace the live `Y.XmlFragment` content with the historical
 *     fragment (creating a fresh fragment if the id was new); for each
 *     id no longer in the tree, delete the map entry. Connected clients
 *     receive the rollback as Yjs updates and rerender in place.
 *
 * Before mutating anything we archive a "before" snapshot tagged with
 * `cause: 'restore'` and the actor's user id. The REST endpoint surfaces
 * this row's id so the UI can offer a one-click Undo.
 *
 * Cold-page path (no clients connected): we still write the new state
 * to `DocSnapshotModel` and apply the tree to `BlockModel`. No live
 * mutation is needed because the next client load will read the new
 * snapshot fresh.
 */

import type { Hocuspocus } from '@hocuspocus/server';
import { Types } from 'mongoose';
import * as Y from 'yjs';
import { DocSnapshotModel } from './snapshot.model';
import { DocHistoryModel } from './history.model';
import { BlockModel } from '../modules/blocks/blocks.model';
import { PageModel } from '../modules/pages/pages.model';
import { captureBlockTree, hashState, loadDocument } from './persistence';

const BLOCKS_MAP_KEY = 'blocks';

export interface RestoreResult {
  ok: true;
  blocksUpdated: number;
  /** Whether the live room was mutated (true) or only the cold snapshot. */
  live: boolean;
  /** History row id of the auto-archived "before" snapshot, for Undo. */
  beforeRevisionId: string | null;
  /** Original revision number that was restored. */
  revision: number;
}

interface TreeNode {
  id: string;
  parentId: string | null;
  order: number;
  type: string;
  props: Record<string, unknown>;
}

export class RestoreError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'RestoreError';
  }
}

export async function restoreSnapshot(
  instance: Hocuspocus,
  pageId: string,
  revisionId: string,
  actorUserId: string | null,
): Promise<RestoreResult> {
  const row = await DocHistoryModel.findOne({ _id: revisionId, pageId }).lean();
  if (!row) throw new RestoreError('RevisionNotFound', 404);

  const state = coerceState(row.state);
  const tree = ((row.tree ?? []) as unknown as TreeNode[]).map(normalizeTreeNode);

  // Capture a "before" snapshot first so the Undo affordance works even
  // if the work below partially fails. We tolerate archive failures —
  // missing Undo is annoying, blocking a restore is worse.
  const beforeRevisionId = await archiveBeforeRestore(
    instance,
    pageId,
    actorUserId,
  ).catch((err) => {
    // eslint-disable-next-line no-console
    console.warn('[restore] before-snapshot archive failed (non-fatal)', err);
    return null;
  });

  await applyTreeToBlockModel(pageId, tree);

  const live = instance.documents.has(pageId);
  if (live) {
    await mutateLiveRoom(instance, pageId, state, tree);
  } else {
    await overwriteColdSnapshot(pageId, state);
  }

  return {
    ok: true,
    blocksUpdated: tree.length,
    live,
    beforeRevisionId,
    revision: row.revision ?? 0,
  };
}

function coerceState(raw: unknown): Uint8Array {
  if (raw instanceof Uint8Array) return raw;
  if (raw && typeof raw === 'object' && 'buffer' in (raw as Record<string, unknown>)) {
    const inner = (raw as { buffer: unknown }).buffer;
    if (inner instanceof Uint8Array) return inner;
    return new Uint8Array(inner as ArrayBuffer);
  }
  throw new RestoreError('CorruptHistorySnapshot', 500);
}

function normalizeTreeNode(n: TreeNode): TreeNode {
  return {
    id: String(n.id),
    parentId: n.parentId == null ? null : String(n.parentId),
    order: typeof n.order === 'number' ? n.order : 0,
    type: String(n.type),
    props: (n.props ?? {}) as Record<string, unknown>,
  };
}

/**
 * Archive the page's *current* state as a new history row tagged
 * `cause: 'restore'`, so the Undo button has something to point at.
 *
 * Source of truth for the bytes:
 *   - If a live room exists, encode from its in-memory `Y.Doc` (it's
 *     fresher than the on-disk snapshot, which lags by Hocuspocus's
 *     debounce window).
 *   - Otherwise read `DocSnapshotModel`.
 */
async function archiveBeforeRestore(
  instance: Hocuspocus,
  pageId: string,
  actorUserId: string | null,
): Promise<string | null> {
  let state: Uint8Array | null = null;
  if (instance.documents.has(pageId)) {
    const conn = await instance.openDirectConnection(pageId);
    try {
      await conn.transact((doc) => {
        state = Y.encodeStateAsUpdate(doc);
      });
    } finally {
      await conn.disconnect();
    }
  } else {
    state = await loadDocument(pageId);
  }
  if (!state || state.byteLength === 0) return null;

  const tree = await captureBlockTree(pageId);
  const created = await DocHistoryModel.create({
    pageId,
    state: Buffer.from(state),
    revision: 0,
    sizeBytes: state.byteLength,
    contentHash: hashState(state),
    cause: 'restore',
    createdBy: actorUserId ? new Types.ObjectId(actorUserId) : null,
    tree,
  });
  return String(created._id);
}

async function applyTreeToBlockModel(pageId: string, tree: TreeNode[]): Promise<void> {
  const page = await PageModel.findById(pageId).select('workspaceId').lean();
  if (!page) throw new RestoreError('PageNotFound', 404);
  const workspaceId = page.workspaceId;

  const current = await BlockModel.find({ pageId }).select('_id').lean();
  const currentIds = new Set(current.map((r) => r._id as unknown as string));
  const targetIds = new Set(tree.map((n) => n.id));

  // Hard-delete blocks that don't exist at the target revision. Blocks
  // have no trash and the snapshot is the explicit user-chosen truth.
  const toDelete = current
    .map((r) => r._id as unknown as string)
    .filter((id) => !targetIds.has(id));
  if (toDelete.length) {
    await BlockModel.deleteMany({ _id: { $in: toDelete }, pageId });
  }

  // eslint-disable-next-line no-console
  console.log('[restore] applyTree', {
    pageId,
    treeSize: tree.length,
    currentCount: current.length,
    deleted: toDelete.length,
    toReinsert: tree.filter((n) => !currentIds.has(n.id)).map((n) => n.id),
  });

  if (tree.length === 0) return;

  const ops = tree.map((n) => {
    const exists = currentIds.has(n.id);
    if (exists) {
      return {
        updateOne: {
          filter: { _id: n.id, pageId },
          update: {
            $set: {
              parentId: n.parentId,
              order: n.order,
              type: n.type,
              props: n.props,
            },
          },
        },
      };
    }
    // Re-insert a previously-deleted block. `text` is filled by the
    // normal reconcile pass that runs after `storeDocument`; we seed it
    // empty here and let the next debounced flush fix it up.
    return {
      updateOne: {
        filter: { _id: n.id },
        update: {
          $setOnInsert: {
            _id: n.id,
            workspaceId,
            pageId,
            parentId: n.parentId,
            order: n.order,
            type: n.type,
            props: n.props,
            text: '',
          },
        },
        upsert: true,
      },
    };
  });
  const writeResult = await BlockModel.bulkWrite(
    ops as Parameters<typeof BlockModel.bulkWrite>[0],
    { ordered: false },
  );
  // eslint-disable-next-line no-console
  console.log('[restore] bulkWrite result', {
    pageId,
    upsertedCount: writeResult.upsertedCount,
    matchedCount: writeResult.matchedCount,
    modifiedCount: writeResult.modifiedCount,
    upsertedIds: writeResult.upsertedIds,
  });
  const after = await BlockModel.countDocuments({ pageId });
  // eslint-disable-next-line no-console
  console.log('[restore] BlockModel count after restore', { pageId, count: after });
}

/**
 * Apply the historical state to the live Y.Doc:
 *   - Add fresh fragments for ids in `tree` but missing from `liveBlocks`.
 *   - Replace existing fragments' content with their historical counterparts.
 *   - Delete fragments for ids no longer in `tree`.
 *
 * All performed inside one `transact` so connected clients receive a
 * single coalesced update.
 */
async function mutateLiveRoom(
  instance: Hocuspocus,
  pageId: string,
  state: Uint8Array,
  tree: TreeNode[],
): Promise<void> {
  const histDoc = new Y.Doc();
  Y.applyUpdate(histDoc, state);
  const histBlocks = histDoc.getMap<Y.XmlFragment>(BLOCKS_MAP_KEY);
  const targetIds = new Set(tree.map((n) => n.id));

  const conn = await instance.openDirectConnection(pageId);
  try {
    await conn.transact((liveDoc) => {
      const liveBlocks = liveDoc.getMap<Y.XmlFragment>(BLOCKS_MAP_KEY);

      // Drop fragments that no longer have a corresponding block.
      const liveKeys = Array.from(liveBlocks.keys());
      for (const key of liveKeys) {
        if (!targetIds.has(key)) liveBlocks.delete(key);
      }

      // Upsert each target block's content from the historical fragment.
      for (const node of tree) {
        const hist = histBlocks.get(node.id);
        let live = liveBlocks.get(node.id);
        if (!(live instanceof Y.XmlFragment)) {
          live = new Y.XmlFragment();
          liveBlocks.set(node.id, live);
        }
        replaceFragmentContent(live, hist instanceof Y.XmlFragment ? hist : undefined);
      }

      // Bump the `rev` beacon so connected clients refetch the block
      // list from REST. Restore changes structure (parent/order/type and
      // re-inserted/deleted blocks) — that's owned by `BlockModel`, not
      // the Y.Doc, so the Y update alone won't surface it. `origin: null`
      // means every client (including the initiator) refetches; the
      // initiator already closed the modal so a refetch is fine.
      liveDoc.getMap('rev').set('blocks', { ts: Date.now(), origin: null });
    });
  } finally {
    await conn.disconnect();
    histDoc.destroy();
  }
}

async function overwriteColdSnapshot(pageId: string, state: Uint8Array): Promise<void> {
  await DocSnapshotModel.findOneAndUpdate(
    { _id: pageId },
    {
      $set: { state: Buffer.from(state) },
      $inc: { revision: 1 },
      $setOnInsert: { _id: pageId },
    },
    { upsert: true },
  );
}

/**
 * Replace `target`'s children with deep clones of `source`'s children.
 *
 * Y types are doc-bound once attached, so we can't move the source nodes
 * directly. Walk the source tree and create fresh, unattached
 * `Y.XmlElement` / `Y.XmlText` mirrors, then attach them to the target
 * in one push. If `source` is missing, the target is just cleared.
 */
function replaceFragmentContent(
  target: Y.XmlFragment,
  source: Y.XmlFragment | undefined,
): void {
  if (target.length > 0) target.delete(0, target.length);
  if (!source) return;

  const clones: (Y.XmlElement | Y.XmlText)[] = [];
  for (const child of source.toArray()) {
    if (child instanceof Y.XmlText) {
      clones.push(cloneXmlText(child));
    } else if (child instanceof Y.XmlElement) {
      clones.push(cloneXmlElement(child));
    }
  }
  if (clones.length) target.push(clones);
}

function cloneXmlElement(src: Y.XmlElement): Y.XmlElement {
  const out = new Y.XmlElement(src.nodeName);
  const attrs = src.getAttributes();
  for (const k of Object.keys(attrs)) {
    out.setAttribute(k, attrs[k] as string);
  }
  for (const child of src.toArray()) {
    if (child instanceof Y.XmlText) {
      out.push([cloneXmlText(child)]);
    } else if (child instanceof Y.XmlElement) {
      out.push([cloneXmlElement(child)]);
    }
  }
  return out;
}

function cloneXmlText(src: Y.XmlText): Y.XmlText {
  const out = new Y.XmlText();
  const delta = src.toDelta();
  if (delta.length) out.applyDelta(delta);
  return out;
}
