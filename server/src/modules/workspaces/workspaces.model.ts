import { Schema, model, Types, type InferSchemaType } from 'mongoose';

/**
 * Workspace = top-level tenant boundary. Every page, block, invitation, share
 * link and permission grant is scoped to exactly one workspace. The workspace
 * id is the security key — `ownerId` on Page/Block becomes purely metadata
 * once Slice 7.2 lands.
 *
 * `kind`:
 *  - `personal` → one per user, auto-provisioned on first access. Cannot be
 *                 deleted, cannot have its role membership downgraded below
 *                 owner. Functions as the user's private notebook.
 *  - `team`     → user-created, supports invitations + multi-member roles.
 *
 * `slug` is a short URL-safe identifier used in the workspace switcher and
 * (later) in shareable URLs. Globally unique; case-insensitive.
 */
const workspaceSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    kind: { type: String, enum: ['personal', 'team'], default: 'team', index: true },
    iconEmoji: { type: String, default: '🗂️' },
    /** User who created (and initially owns) the workspace. Distinct from
     *  current ownership: ownership transfers happen via Membership.role. */
    createdBy: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    archivedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true },
);

export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'guest';
export const WORKSPACE_ROLES: readonly WorkspaceRole[] = ['owner', 'admin', 'member', 'guest'] as const;

export type Workspace = InferSchemaType<typeof workspaceSchema> & { _id: Types.ObjectId };
export const WorkspaceModel = model('Workspace', workspaceSchema);

/**
 * Membership = user × workspace edge. Source of truth for:
 *  1. "Can this user see workspace X exists?"
 *  2. "What baseline page access do they get inside it?"
 *
 * We deliberately store ONE document per (userId, workspaceId) and enforce it
 * via a unique compound index — this is the hottest read path in the app
 * (touched by `workspaceGuard` on every authenticated request) so denormalised
 * lookup-by-key beats any join-style alternative.
 *
 * `lastSeenAt` lets the UI sort the workspace switcher by recency without an
 * extra read; updated opportunistically, not transactionally.
 */
const membershipSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    workspaceId: { type: Types.ObjectId, ref: 'Workspace', required: true, index: true },
    role: { type: String, enum: WORKSPACE_ROLES, required: true, index: true },
    /** User-overridable display name for this workspace in the switcher. */
    nickname: { type: String, default: null },
    lastSeenAt: { type: Date, default: null },
    /** When the user joined. For owner of personal ws this equals workspace.createdAt. */
    joinedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true },
);

// Hot path: `findOne({ userId, workspaceId })`
membershipSchema.index({ userId: 1, workspaceId: 1 }, { unique: true });
// Member-listing path: `find({ workspaceId }).sort({ role: 1 })`
membershipSchema.index({ workspaceId: 1, role: 1 });

export type Membership = InferSchemaType<typeof membershipSchema> & { _id: Types.ObjectId };
export const MembershipModel = model('Membership', membershipSchema);
