/**
 * Per-page snapshot archive.
 *
 * `DocSnapshotModel` keeps exactly ONE row per page (the latest state) so
 * `onLoadDocument` is a single indexed read. This collection complements
 * that by appending dated copies for "view past version" / "restore"
 * features and incident recovery (e.g. an overzealous batch delete that
 * a user wants to roll back from yesterday).
 *
 * Append cadence
 * --------------
 * We do NOT append on every `onStoreDocument` — Hocuspocus debounces that
 * roughly to keystroke pauses, which would fill the archive with near-
 * identical rows. Instead `persistence.storeDocument` consults
 * `env.historyMinIntervalMs` and only appends when the most recent entry
 * for that page is older than the window.
 *
 * Retention
 * ---------
 * `env.historyRetainCount` rows per page. On every successful append, any
 * older rows past the cap are deleted. We don't use a Mongo capped
 * collection because that's a single global cap; per-page bounds need
 * explicit pruning.
 *
 * Storage
 * -------
 * Same `Y.encodeStateAsUpdate(doc)` payload format as `DocSnapshotModel`,
 * so any archive row can be passed straight to `Y.applyUpdate` to
 * rehydrate a doc at that point in time.
 */

import { Schema, model, Types, type InferSchemaType } from 'mongoose';

/**
 * Block-tree projection captured alongside each Yjs snapshot.
 *
 * The Yjs doc only carries inline content (per-block `Y.XmlFragment`s).
 * Block structure (parent / order / type / props) lives in `BlockModel`,
 * which is _not_ time-versioned on its own. Without this projection a
 * "restore" can only roll back text, not undo deletes / reorders /
 * type-changes. We mirror just enough of `BlockModel` to drive a faithful
 * structural restore.
 */
const treeNodeSchema = new Schema(
  {
    id: { type: String, required: true },
    parentId: { type: String, default: null },
    order: { type: Number, default: 0 },
    type: { type: String, required: true },
    props: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false },
);

const docHistorySchema = new Schema(
  {
    pageId: { type: String, required: true, index: true },
    state: { type: Buffer, required: true },
    revision: { type: Number, default: 0 },
    sizeBytes: { type: Number, default: 0 },
    /**
     * SHA-256 hex of `state`. Used to dedupe identical autosave appends:
     * the throttle window catches keystroke bursts, but a user who pauses
     * past the window without changing anything would still produce a
     * duplicate row. The hash check is the belt to that suspenders.
     */
    contentHash: { type: String, default: null, index: true },
    /**
     * Why this row exists. Distinguishes the regular debounced autosave
     * from the "before" snapshot we capture immediately prior to a
     * restore (which the Undo affordance points at).
     */
    cause: {
      type: String,
      enum: ['autosave', 'restore', 'manual'],
      default: 'autosave',
    },
    /**
     * For `autosave` rows we leave this null — multiple collaborators
     * may have contributed to a single debounced flush and picking one
     * "author" is misleading. For `restore` / `manual` rows it's the
     * acting user.
     */
    createdBy: { type: Types.ObjectId, ref: 'User', default: null },
    /** Snapshot of the block tree at the moment this row was archived. */
    tree: { type: [treeNodeSchema], default: [] },
  },
  { timestamps: true },
);

// Compound index for the dominant query: "list this page's history newest-first".
docHistorySchema.index({ pageId: 1, createdAt: -1 });

export type DocHistory = InferSchemaType<typeof docHistorySchema>;
export const DocHistoryModel = model('DocHistory', docHistorySchema);
