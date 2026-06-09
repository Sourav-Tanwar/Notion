import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * User: source of truth for identity. Password is optional so OAuth-only users
 * can exist with no credential. `emailVerified` gates protected actions when
 * EMAIL_VERIFICATION_REQUIRED is true. `tokenVersion` is bumped on logout-all
 * or password change to invalidate every outstanding access token.
 */
const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    emailVerified: { type: Boolean, default: false, index: true },

    passwordHash: { type: String, default: null }, // null for OAuth-only accounts

    name: { type: String, default: '' },
    // Username uniqueness is enforced by a *partial* index below (not `sparse`)
    // so that many users can coexist with `username: null` without colliding.
    username: { type: String, default: null, lowercase: true, trim: true },
    bio: { type: String, default: '', maxlength: 280 },
    avatarUrl: { type: String, default: null },

    role: { type: String, enum: ['user', 'admin'], default: 'user', index: true },
    themePref: { type: String, enum: ['system', 'light', 'dark'], default: 'system' },

    /** Bumped to globally invalidate access tokens (logout-all, password change). */
    tokenVersion: { type: Number, default: 0 },

    lastLoginAt: { type: Date, default: null },

    /** Soft-delete marker. Login + most actions are refused when set. The
     *  document remains for a configurable retention window so we can detect
     *  re-signup attempts and satisfy audit requests, then a sweep job (out
     *  of scope here) purges the row entirely. */
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true },
);
// Unique only when username is actually a string — nulls are excluded entirely.
userSchema.index(
  { username: 1 },
  { unique: true, partialFilterExpression: { username: { $type: 'string' } } },
);

export type UserDoc = InferSchemaType<typeof userSchema> & { _id: string };
export const UserModel = model('User', userSchema);

/**
 * Account: a single OAuth identity belonging to a user. A user may link many
 * accounts (Google + GitHub + …) but each (provider, providerAccountId) pair
 * is globally unique.
 */
const accountSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    provider: { type: String, required: true, index: true },
    providerAccountId: { type: String, required: true },
  },
  { timestamps: true },
);
accountSchema.index({ provider: 1, providerAccountId: 1 }, { unique: true });

export type AccountDoc = InferSchemaType<typeof accountSchema> & { _id: string };
export const AccountModel = model('Account', accountSchema);

/**
 * RefreshToken: every issued refresh token is recorded HASHED. Rotation creates
 * a new row and marks the old `replacedBy`. Reuse of a revoked token revokes
 * the entire family — a standard defense against stolen tokens.
 * TTL index on `expiresAt` auto-purges expired rows.
 */
const refreshTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, index: true },
    family: { type: String, required: true, index: true },
    replacedBy: { type: String, default: null },
    revokedAt: { type: Date, default: null },
    userAgent: { type: String, default: '' },
    ip: { type: String, default: '' },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type RefreshTokenDoc = InferSchemaType<typeof refreshTokenSchema> & { _id: string };
export const RefreshTokenModel = model('RefreshToken', refreshTokenSchema);

/**
 * VerificationToken: single-use tokens for email verification & password reset.
 * Storage is hashed; `consumedAt` enforces one-shot usage. TTL index purges.
 */
const verificationTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    purpose: {
      type: String,
      enum: ['email-verify', 'password-reset', 'password-set'],
      required: true,
      index: true,
    },
    tokenHash: { type: String, required: true, unique: true, index: true },
    consumedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);
verificationTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type VerificationTokenDoc = InferSchemaType<typeof verificationTokenSchema> & { _id: string };
export const VerificationTokenModel = model('VerificationToken', verificationTokenSchema);
