import { Schema, model, Types, type InferSchemaType } from 'mongoose';

/**
 * Inline databases ("table view" v1).
 *
 * A database is an independent entity referenced from a page by a `database`
 * block (which stores `props.databaseId`). The block is just an anchor; all
 * schema + data live here so we never bloat the block document or the Yjs doc.
 *
 *  - `columns` is the ordered property schema (the table's columns).
 *  - Rows live in a sibling collection so a wide table doesn't grow one
 *    unbounded document.
 */

export const COLUMN_TYPES = ['text', 'number', 'select', 'checkbox', 'date', 'url', 'email', 'phone'] as const;
export type ColumnType = (typeof COLUMN_TYPES)[number];

const optionSchema = new Schema(
  {
    id: { type: String, required: true },
    name: { type: String, default: '' },
    color: { type: String, default: 'gray' },
  },
  { _id: false },
);

const columnSchema = new Schema(
  {
    id: { type: String, required: true },
    name: { type: String, default: '' },
    type: { type: String, enum: COLUMN_TYPES, default: 'text' },
    /** Only meaningful for `select` columns. */
    options: { type: [optionSchema], default: undefined },
  },
  { _id: false },
);

const databaseSchema = new Schema(
  {
    workspaceId: { type: Types.ObjectId, ref: 'Workspace', required: true, index: true },
    pageId: { type: Types.ObjectId, ref: 'Page', required: true, index: true },
    title: { type: String, default: 'Untitled database' },
    columns: { type: [columnSchema], default: [] },
  },
  { timestamps: true },
);

const rowSchema = new Schema(
  {
    _id: { type: String, required: true }, // client/server-generated UUID
    databaseId: { type: Types.ObjectId, ref: 'Database', required: true, index: true },
    workspaceId: { type: Types.ObjectId, ref: 'Workspace', required: true, index: true },
    /** Map of columnId → value. Value shape depends on the column type. */
    cells: { type: Schema.Types.Mixed, default: {} },
    order: { type: Number, default: 0 },
  },
  { timestamps: true, _id: false },
);

rowSchema.index({ databaseId: 1, order: 1 });

export type Database = InferSchemaType<typeof databaseSchema>;
export type DatabaseRow = InferSchemaType<typeof rowSchema>;
export const DatabaseModel = model('Database', databaseSchema);
export const DatabaseRowModel = model('DatabaseRow', rowSchema);
