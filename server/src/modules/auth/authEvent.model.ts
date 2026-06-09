import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * AuthEvent — append-only audit log of security-relevant actions.
 *
 * Why a dedicated collection (vs. logging to stdout):
 *  - Queryable: surfaces a "Recent activity" tab and feeds SIEM / Datadog.
 *  - Tamper-evident: the application never deletes rows; rotation is by TTL.
 *  - Stable shape: a single typed schema beats grep'ing JSON logs.
 *
 * Why we record by `userId` (when known) AND `email`:
 *  - Pre-auth events (signup, failed login, forgot-password) have no userId.
 *  - Post-auth events (logout, session-revoke, deletion) have one.
 *
 * Indexes are tuned for the two reads we actually do:
 *  - List recent events for a user (settings → "Recent activity"): { userId, createdAt }
 *  - Time-bounded forensic queries by type: { type, createdAt }
 *
 * A TTL on `createdAt` keeps the collection bounded in size; bump for
 * compliance windows (e.g. PCI requires 1 year).
 */

export const AUTH_EVENT_TYPES = [
  'signup.created',
  'signup.duplicate', // someone tried to sign up with an existing email
  'login.success',
  'login.failed',
  'logout',
  'logout.all',
  'session.revoked',
  'refresh.rotated',
  'refresh.reuse_detected',
  'refresh.suspicious', // IP/UA jump
  'password.changed',
  'password.set',
  'password.reset',
  'email.verified',
  'oauth.linked',
  'account.deleted',
  'captcha.failed',
  'avatar.upload_rejected',
  // Workspace / collaboration events
  'invitation.created',
  'invitation.resent',
  'invitation.revoked',
  'invitation.accepted',
  // Page-history events
  'page.history.restored',
] as const;

export type AuthEventType = (typeof AUTH_EVENT_TYPES)[number];

const authEventSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    email: { type: String, default: null, lowercase: true, trim: true },
    type: { type: String, enum: AUTH_EVENT_TYPES, required: true, index: true },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    /** Free-form structured context, kept tiny. Never put PII / secrets here. */
    meta: { type: Schema.Types.Mixed, default: {} },
    // NOTE: we intentionally do NOT mark `createdAt` with `index: true` here
    // because we declare an explicit TTL index on it below. Mongoose would
    // otherwise create a duplicate non-TTL index with the same name.
    createdAt: { type: Date, default: () => new Date() },
  },
  { versionKey: false },
);

// Retain 180 days by default. Named distinctly from the implicit `createdAt_1`
// index so the TTL options can be migrated without a manual drop.
authEventSchema.index(
  { createdAt: 1 },
  { name: 'createdAt_ttl', expireAfterSeconds: 60 * 60 * 24 * 180 },
);
authEventSchema.index({ userId: 1, createdAt: -1 });

export type AuthEventDoc = InferSchemaType<typeof authEventSchema> & { _id: string };
export const AuthEventModel = model('AuthEvent', authEventSchema);
