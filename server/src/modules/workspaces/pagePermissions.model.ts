import { Schema, model, Types, type InferSchemaType } from 'mongoose';
import { GRANTABLE_LEVELS } from './pagePermissions';

/**
 * Explicit page-level grant for a single user.
 *
 * Stored as a SPARSE collection: 99% of pages have zero rows here (inheritance
 * + workspace baseline does all the work). This keeps the resolver's working
 * set tiny — a single indexed read across the ancestor chain.
 *
 * `workspaceId` is denormalised from the page so the resolver can clear all
 * grants for a deleted workspace in one query without joining.
 */
const pagePermissionSchema = new Schema(
  {
    workspaceId: { type: Types.ObjectId, ref: 'Workspace', required: true, index: true },
    pageId: { type: Types.ObjectId, ref: 'Page', required: true, index: true },
    userId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    level: { type: String, enum: GRANTABLE_LEVELS, required: true },
    grantedBy: { type: Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

// One row per (page, user). Resolver path uses { pageId, userId }; admin-side
// "who has access to this page" UI uses { pageId } alone (covered by the
// pageId index).
pagePermissionSchema.index({ pageId: 1, userId: 1 }, { unique: true });
// "All pages this guest has explicit access to in workspace X" — used by the
// sidebar filter for guests.
pagePermissionSchema.index({ workspaceId: 1, userId: 1 });

export type PagePermission = InferSchemaType<typeof pagePermissionSchema> & { _id: Types.ObjectId };
export const PagePermissionModel = model('PagePermission', pagePermissionSchema);
