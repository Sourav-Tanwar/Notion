import { Schema, model, Types, type InferSchemaType } from 'mongoose';

const pageSchema = new Schema(
  {
    /**
     * Auth key. Every page lives in exactly one workspace; all permission
     * checks pivot on this field. Required for new pages — the 7.2 backfill
     * script stamps it onto legacy documents that predate multi-tenancy.
     */
    workspaceId: { type: Types.ObjectId, ref: 'Workspace', required: true, index: true },
    /** "Created by" metadata. NOT a security boundary anymore. */
    ownerId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    parentId: { type: Types.ObjectId, ref: 'Page', default: null, index: true },
    title: { type: String, default: 'Untitled' },
    icon: { type: String, default: '📄' },
    /** Full-bleed banner image URL shown above the title. */
    coverUrl: { type: String, default: null },
    /** True if pinned to the Favorites section in the sidebar. */
    favorite: { type: Boolean, default: false, index: true },
    /** Soft-delete marker. Pages with archivedAt !== null are in Trash. */
    archivedAt: { type: Date, default: null, index: true },
    /** True if this page is saved as a reusable template (hidden from the tree). */
    isTemplate: { type: Boolean, default: false, index: true },
    /** Page layout: render content edge-to-edge instead of the centered column. */
    fullWidth: { type: Boolean, default: false },
    /** Page typography: render body text one step smaller. */
    smallText: { type: Boolean, default: false },
    /** Read-only lock: content cannot be edited while true. */
    locked: { type: Boolean, default: false },
    order: { type: Number, default: 0, index: true },
  },
  { timestamps: true },
);

// Hot path: sidebar tree query within a workspace.
pageSchema.index({ workspaceId: 1, parentId: 1, order: 1 });
// Trash listing.
pageSchema.index({ workspaceId: 1, archivedAt: 1 });
// Per-user favorites are still user-scoped ("my favorites across workspaces").
pageSchema.index({ ownerId: 1, favorite: 1 });

export type Page = InferSchemaType<typeof pageSchema> & { _id: Types.ObjectId };
export const PageModel = model('Page', pageSchema);
