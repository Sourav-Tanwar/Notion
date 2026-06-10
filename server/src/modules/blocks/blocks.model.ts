import { Schema, model, Types, type InferSchemaType } from 'mongoose';

export const BLOCK_TYPES = [
  'text',
  'heading',
  'heading2',
  'heading3',
  'todo',
  'bullet',
  'numbered',
  'code',
  'toggle',
  'callout',
  'quote',
  'divider',
  'image',
  'video',
  'file',
  'bookmark',
  'toc',
  'columns',
  'column',
  'database',
  'table',
  'ai',
] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

const blockSchema = new Schema(
  {
    // Client-generated IDs (UUID) make optimistic updates idempotent and let
    // Yjs (Phase 8) reuse the same id space for CRDT block nodes.
    _id: { type: String, required: true },
    /**
     * Denormalised from the parent page. We pay a write on page-move to keep
     * it correct and skip a JOIN on every read — block listing is the single
     * hottest query in the editor.
     */
    workspaceId: { type: Types.ObjectId, ref: 'Workspace', required: true, index: true },
    pageId: { type: Types.ObjectId, ref: 'Page', required: true, index: true },
    parentId: { type: String, default: null, index: true }, // null = top-level on page; otherwise parent block id
    type: { type: String, enum: BLOCK_TYPES, required: true },
    text: { type: String, default: '' },
    order: { type: Number, default: 0, index: true },
    props: { type: Schema.Types.Mixed, default: {} }, // e.g. { checked: boolean, language: 'ts' }
  },
  { timestamps: true, _id: false },
);

blockSchema.index({ pageId: 1, parentId: 1, order: 1 });
// Defence-in-depth: lets the query planner reject cross-workspace id sniffs.
blockSchema.index({ workspaceId: 1, pageId: 1 });

export type Block = InferSchemaType<typeof blockSchema>;
export const BlockModel = model('Block', blockSchema);
