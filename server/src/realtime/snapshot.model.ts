/**
 * Persisted Yjs document snapshots — one row per page.
 *
 * We keep the FULL Y.Doc binary state (`Y.encodeStateAsUpdate`) rather than
 * an append-only update log. Rationale:
 *
 *   1) Hocuspocus already debounces `onStoreDocument` (~2s after last edit
 *      by default), so we're writing at human-scale frequency, not per
 *      keystroke. A single document blob per page is plenty.
 *   2) `onLoadDocument` does one indexed read + `Y.applyUpdate` — O(state),
 *      no replay-the-log cost.
 *   3) Updates merge in Yjs by union; rewriting the whole state on each
 *      save is correct under any concurrency model. An update log would
 *      need a compaction job anyway and adds two failure modes (gap, dup).
 *
 * Trade-off: we don't have per-edit forensics. If we ever need that we can
 * add a separate `docupdates` collection that pushes the *delta* of each
 * store; for now the snapshot is the durable artifact.
 */

import { Schema, model, type InferSchemaType } from 'mongoose';

const docSnapshotSchema = new Schema(
  {
    /** The page id (same as Hocuspocus `documentName`). */
    _id: { type: String, required: true },
    /** Encoded Y.Doc state — `Y.encodeStateAsUpdate(doc)`. */
    state: { type: Buffer, required: true },
    /** Increment on every successful upsert. Useful for debugging drift. */
    revision: { type: Number, default: 0 },
  },
  { timestamps: true, _id: false },
);

export type DocSnapshot = InferSchemaType<typeof docSnapshotSchema>;
export const DocSnapshotModel = model('DocSnapshot', docSnapshotSchema);
