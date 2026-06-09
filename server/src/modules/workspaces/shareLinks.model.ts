import { Schema, model, Types, type InferSchemaType } from 'mongoose';

/**
 * ShareLink — anonymous, read-only, tokenized URL access to a page.
 *
 * Why a separate model (vs. extending PagePermission)?
 *  - The principal is a *bearer of the token*, not a user. The rest of the
 *    permission system is user-id-keyed; conflating them would force every
 *    PagePermission row to carry an optional token column.
 *  - Lifecycle is independent: links are revocable, expirable, and password-
 *    gateable without touching user grants.
 *
 * Why store only a hash of the token:
 *  - The raw token is the credential. If the DB leaks, an attacker still
 *    needs the original URLs the owner shared out-of-band. Mirrors how we
 *    store refresh tokens, invitation tokens, email verification tokens.
 *
 * Why bcrypt the optional password (and not SHA-256):
 *  - Passwords are low-entropy by definition; SHA is offline-crackable in
 *    seconds. bcrypt with the project's standard cost (12) is the same hash
 *    function the rest of the auth stack uses, so ops cost is unified.
 *
 * `lastAccessedAt` is updated lazily (best-effort, fire-and-forget) so an
 * owner can see "this link was opened 2 hours ago" without paying a write
 * on every block fetch.
 */
const shareLinkSchema = new Schema(
  {
    workspaceId: { type: Types.ObjectId, ref: 'Workspace', required: true, index: true },
    pageId: { type: Types.ObjectId, ref: 'Page', required: true, index: true },

    /** SHA-256(rawToken). The raw token is shown ONCE at create-time. */
    tokenHash: { type: String, required: true, unique: true },

    /** Optional bcrypt of the link password. Null = no password gate. */
    passwordHash: { type: String, default: null },

    /** Optional hard expiry. Null = never expires (until revoked). */
    expiresAt: { type: Date, default: null },

    /**
     * Whether anonymous visitors may see child pages of the shared page.
     * Default true (matches Notion's "share with subpages" toggle).
     */
    includeSubpages: { type: Boolean, default: true },

    createdBy: { type: Types.ObjectId, ref: 'User', required: true },
    revokedAt: { type: Date, default: null },
    lastAccessedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Owner-side query: "show me all links for this page".
shareLinkSchema.index({ pageId: 1, revokedAt: 1 });
// Cascading delete when a page is hard-deleted.
shareLinkSchema.index({ workspaceId: 1, pageId: 1 });

export type ShareLink = InferSchemaType<typeof shareLinkSchema> & { _id: Types.ObjectId };
export const ShareLinkModel = model('ShareLink', shareLinkSchema);
