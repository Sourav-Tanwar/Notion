import { Schema, model, Types, type InferSchemaType } from 'mongoose';

/**
 * Invitation = a pending edge between an email address and a workspace.
 *
 * Security model: only the SHA-256 hash of the token is persisted. The raw
 * token leaves the server exactly once (in the body of the invite email) and
 * never enters logs, API responses, or admin UIs. A DB leak therefore exposes
 * who-invited-whom but never resurrects live links. Same architecture as the
 * password-reset / email-verification tokens already in this codebase.
 *
 * Lifecycle states are derived, not stored:
 *   pending  = acceptedAt == null && revokedAt == null && expiresAt > now
 *   accepted = acceptedAt != null
 *   revoked  = revokedAt  != null
 *   expired  = expiresAt  <= now (and not yet accepted/revoked)
 *
 * Derived state means no separate "status" column to keep in sync — the
 * lifecycle is always provable from immutable timestamps.
 */
const invitationSchema = new Schema(
  {
    workspaceId: { type: Types.ObjectId, ref: 'Workspace', required: true, index: true },
    /** Lowercased on write; matched case-insensitively on accept. */
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    role: { type: String, enum: ['admin', 'member', 'guest'], required: true },
    /** SHA-256 hex of the raw token. Unique → ensures no token collision. */
    tokenHash: { type: String, required: true, unique: true, index: true },
    invitedBy: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    expiresAt: { type: Date, required: true, index: true },
    acceptedAt: { type: Date, default: null },
    acceptedBy: { type: Types.ObjectId, ref: 'User', default: null },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// "Show me pending invites for this workspace" — covers the admin UI list.
invitationSchema.index({ workspaceId: 1, acceptedAt: 1, revokedAt: 1, expiresAt: 1 });
// Prevent two concurrent pending invitations to the same address. A partial
// unique index lets a previously-accepted/revoked row coexist with a fresh
// pending one for the same email.
invitationSchema.index(
  { workspaceId: 1, email: 1 },
  {
    unique: true,
    partialFilterExpression: { acceptedAt: null, revokedAt: null },
  },
);

export type Invitation = InferSchemaType<typeof invitationSchema> & { _id: Types.ObjectId };
export const InvitationModel = model('Invitation', invitationSchema);
