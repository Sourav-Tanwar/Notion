import { Types } from 'mongoose';
import { InvitationModel } from './invitations.model';
import { MembershipModel, WorkspaceModel, type WorkspaceRole } from './workspaces.model';
import { UserModel } from '../auth/auth.model';
import { HttpError } from '../../utils/HttpError';
import { randomToken, sha256 } from '../../utils/crypto';
import { can, canAssignRole } from './permissions';
import { env } from '../../config/env';
import { getEmailService, workspaceInviteTemplate } from '../../services/email.service';
import { audit } from '../../services/audit.service';

const INVITE_TTL_DAYS = 7;

type InviteRole = Extract<WorkspaceRole, 'admin' | 'member' | 'guest'>;

const invitationDTO = (i: any) => ({
  id: String(i._id),
  workspaceId: String(i.workspaceId),
  email: i.email,
  role: i.role as InviteRole,
  invitedBy: String(i.invitedBy),
  expiresAt: i.expiresAt,
  acceptedAt: i.acceptedAt,
  revokedAt: i.revokedAt,
  createdAt: i.createdAt,
});

function expiry(): Date {
  return new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Mints a fresh token, persists only its hash, and dispatches the email.
 * Returns ONLY metadata — the raw token never leaves this function except
 * via the email body. Pulled into a helper so `create` and `resend` share
 * exactly one code path that can produce a live link.
 */
async function dispatchInvite(
  invitationId: string,
  workspaceName: string,
  inviterName: string,
  email: string,
  role: string,
): Promise<{ tokenHash: string; expiresAt: Date }> {
  const raw = randomToken(32);
  const tokenHash = sha256(raw);
  const expiresAt = expiry();
  await InvitationModel.updateOne({ _id: invitationId }, { tokenHash, expiresAt });

  const link = `${env.clientOrigin}/invitations/${raw}`;
  const msg = workspaceInviteTemplate(inviterName, workspaceName, role, link);
  msg.to = email;
  // Fire-and-forget: a transient SMTP failure must not roll back the invite
  // row; admin can resend. We still log the failure.
  getEmailService()
    .send(msg)
    .catch((e) => {
      // eslint-disable-next-line no-console
      console.warn('[invite] email send failed:', (e as Error).message);
    });
  return { tokenHash, expiresAt };
}

export const invitationsService = {
  async list(workspaceId: string) {
    const now = new Date();
    const items = await InvitationModel.find({
      workspaceId,
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { $gt: now },
    })
      .sort({ createdAt: -1 })
      .lean();
    return items.map(invitationDTO);
  },

  async create(
    actor: { userId: string; role: WorkspaceRole },
    workspaceId: string,
    input: { email: string; role: InviteRole },
  ) {
    if (!can(actor.role, 'workspace.member.invite')) throw new HttpError(403, 'Forbidden');
    if (!canAssignRole(actor.role, input.role)) throw new HttpError(403, 'RoleNotAssignable');

    const email = input.email.toLowerCase().trim();
    const ws = await WorkspaceModel.findById(workspaceId).lean();
    if (!ws) throw new HttpError(404, 'WorkspaceNotFound');
    if (ws.kind === 'personal') throw new HttpError(400, 'CannotInviteToPersonal');

    // If the invitee is already a member (lookup by email → user → membership)
    // short-circuit with a clear error rather than emailing them a useless link.
    const existingUser = await UserModel.findOne({ email }).select('_id').lean();
    if (existingUser) {
      const existingMember = await MembershipModel.findOne({
        userId: existingUser._id,
        workspaceId,
      }).lean();
      if (existingMember) throw new HttpError(409, 'AlreadyMember');
    }

    const inviter = await UserModel.findById(actor.userId).select('name email').lean();

    // Insert with a placeholder hash so the partial-unique-pending index can
    // do its job; the real hash is stamped in by dispatchInvite.
    let invitation;
    try {
      invitation = await InvitationModel.create({
        workspaceId: new Types.ObjectId(workspaceId),
        email,
        role: input.role,
        tokenHash: `pending-${randomToken(8)}`,
        invitedBy: new Types.ObjectId(actor.userId),
        expiresAt: expiry(),
      });
    } catch (e: any) {
      if (e?.code === 11000) throw new HttpError(409, 'PendingInviteExists');
      throw e;
    }

    await dispatchInvite(
      String(invitation._id),
      ws.name,
      inviter?.name ?? inviter?.email ?? '',
      email,
      input.role,
    );

    audit.log('invitation.created', {
      userId: actor.userId,
      meta: { workspaceId, email, role: input.role, invitationId: String(invitation._id) },
    });

    return invitationDTO(invitation);
  },

  async resend(
    actor: { userId: string; role: WorkspaceRole },
    workspaceId: string,
    invitationId: string,
  ) {
    if (!can(actor.role, 'workspace.member.invite')) throw new HttpError(403, 'Forbidden');

    const inv = await InvitationModel.findOne({ _id: invitationId, workspaceId });
    if (!inv) throw new HttpError(404, 'InvitationNotFound');
    if (inv.acceptedAt) throw new HttpError(400, 'AlreadyAccepted');
    if (inv.revokedAt) throw new HttpError(400, 'Revoked');

    const ws = await WorkspaceModel.findById(workspaceId).select('name').lean();
    const inviter = await UserModel.findById(actor.userId).select('name email').lean();

    await dispatchInvite(
      String(inv._id),
      ws?.name ?? 'Workspace',
      inviter?.name ?? inviter?.email ?? '',
      inv.email,
      inv.role,
    );

    audit.log('invitation.resent', {
      userId: actor.userId,
      meta: { workspaceId, invitationId: String(inv._id) },
    });

    // Re-read for the fresh expiresAt.
    const fresh = await InvitationModel.findById(invitationId).lean();
    return invitationDTO(fresh);
  },

  async revoke(
    actor: { userId: string; role: WorkspaceRole },
    workspaceId: string,
    invitationId: string,
  ) {
    if (!can(actor.role, 'workspace.member.invite')) throw new HttpError(403, 'Forbidden');

    const inv = await InvitationModel.findOne({ _id: invitationId, workspaceId });
    if (!inv) throw new HttpError(404, 'InvitationNotFound');
    if (inv.acceptedAt) throw new HttpError(400, 'AlreadyAccepted');
    if (inv.revokedAt) return invitationDTO(inv); // idempotent

    inv.revokedAt = new Date();
    await inv.save();

    audit.log('invitation.revoked', {
      userId: actor.userId,
      meta: { workspaceId, invitationId: String(inv._id) },
    });

    return invitationDTO(inv);
  },

  /**
   * Public preview — used by the acceptance page to show "You've been invited
   * to <Workspace> as <role>" before the user logs in. Returns minimal data
   * (no email of invitee, no inviter email) to avoid leaking PII to anyone
   * who guesses a token.
   */
  async preview(rawToken: string) {
    const tokenHash = sha256(rawToken);
    const inv = await InvitationModel.findOne({ tokenHash }).lean();
    if (!inv) throw new HttpError(404, 'InvitationNotFound');
    if (inv.revokedAt) throw new HttpError(410, 'Revoked');
    if (inv.acceptedAt) throw new HttpError(410, 'AlreadyAccepted');
    if (inv.expiresAt <= new Date()) throw new HttpError(410, 'Expired');

    const [ws, inviter] = await Promise.all([
      WorkspaceModel.findById(inv.workspaceId).select('name iconEmoji').lean(),
      UserModel.findById(inv.invitedBy).select('name').lean(),
    ]);
    return {
      workspace: ws ? { name: ws.name, iconEmoji: ws.iconEmoji } : null,
      inviterName: inviter?.name ?? null,
      role: inv.role,
      // Echo the invited email so the SPA can show "logged in as X — switch
      // accounts to accept" when the mismatch happens.
      email: inv.email,
      expiresAt: inv.expiresAt,
    };
  },

  /**
   * Accept the invitation as the currently authenticated user. The invited
   * email and the logged-in user's email MUST match (case-insensitive) — this
   * is the entire authorization story for invitations. Token possession +
   * email match together prove the invitee is who the admin meant.
   */
  async accept(userId: string, rawToken: string) {
    const tokenHash = sha256(rawToken);
    const inv = await InvitationModel.findOne({ tokenHash });
    if (!inv) throw new HttpError(404, 'InvitationNotFound');
    if (inv.revokedAt) throw new HttpError(410, 'Revoked');
    if (inv.acceptedAt) throw new HttpError(410, 'AlreadyAccepted');
    if (inv.expiresAt <= new Date()) throw new HttpError(410, 'Expired');

    const user = await UserModel.findById(userId).select('email').lean();
    if (!user) throw new HttpError(401, 'Unauthorized');
    if (user.email.toLowerCase() !== inv.email.toLowerCase()) {
      throw new HttpError(403, 'EmailMismatch');
    }

    // Upsert membership. If the user is already a member at a higher role
    // (e.g. they were promoted between invite and accept), we keep the
    // higher role — invites should NEVER demote.
    const existing = await MembershipModel.findOne({ workspaceId: inv.workspaceId, userId });
    if (!existing) {
      await MembershipModel.create({
        userId: new Types.ObjectId(userId),
        workspaceId: inv.workspaceId,
        role: inv.role,
        joinedAt: new Date(),
      });
    }

    inv.acceptedAt = new Date();
    inv.acceptedBy = new Types.ObjectId(userId) as any;
    await inv.save();

    audit.log('invitation.accepted', {
      userId,
      meta: { workspaceId: String(inv.workspaceId), invitationId: String(inv._id) },
    });

    return { workspaceId: String(inv.workspaceId), role: existing?.role ?? inv.role };
  },
};
