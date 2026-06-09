import { Types } from 'mongoose';
import { MembershipModel, WorkspaceModel, type WorkspaceRole } from './workspaces.model';
import { UserModel } from '../auth/auth.model';
import { HttpError } from '../../utils/HttpError';
import { can, canAssignRole } from './permissions';

const workspaceDTO = (w: any, role?: WorkspaceRole) => ({
  id: String(w._id),
  name: w.name,
  slug: w.slug,
  kind: w.kind,
  iconEmoji: w.iconEmoji,
  createdBy: String(w.createdBy),
  archivedAt: w.archivedAt ?? null,
  createdAt: w.createdAt,
  updatedAt: w.updatedAt,
  ...(role ? { role } : {}),
});

const memberDTO = (m: any) => ({
  id: String(m._id),
  userId: String(m.userId),
  role: m.role,
  joinedAt: m.joinedAt,
  user: m.user
    ? {
        id: String(m.user._id),
        email: m.user.email,
        name: m.user.name ?? '',
        avatarUrl: m.user.avatarUrl ?? null,
      }
    : null,
});

/**
 * Deterministic-ish slug builder. Personal workspaces use the user id (stable,
 * uniqueness guaranteed). Team workspaces use the name + a short random suffix
 * to dodge collisions without spinning in a uniqueness loop.
 */
function makeSlug(base: string): string {
  const cleaned = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'workspace';
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${cleaned}-${suffix}`;
}

export const workspacesService = {
  /**
   * Idempotent personal-workspace bootstrap. Safe to call on every login or
   * first-list — the unique index on (userId, workspaceId) plus the
   * `kind: 'personal'` filter make double-create impossible under concurrent
   * requests (second insert errors with 11000, we swallow it).
   */
  async ensurePersonal(userId: string) {
    const existingMembership = await MembershipModel.findOne({ userId })
      .populate({ path: 'workspaceId', match: { kind: 'personal' } })
      .lean();
    if (existingMembership && existingMembership.workspaceId) {
      return existingMembership.workspaceId as any;
    }
    const user = await UserModel.findById(userId).lean();
    if (!user) throw new HttpError(404, 'UserNotFound');
    const slug = `u-${String(user._id).slice(-10).toLowerCase()}`;
    try {
      const ws = await WorkspaceModel.create({
        name: user.name?.trim() || `${user.email.split('@')[0]}'s Space`,
        slug,
        kind: 'personal',
        iconEmoji: '🏠',
        createdBy: user._id,
      });
      await MembershipModel.create({
        userId: user._id,
        workspaceId: ws._id,
        role: 'owner',
        joinedAt: new Date(),
      });
      return ws;
    } catch (e: any) {
      // Race lost — another concurrent request created it. Re-read.
      if (e?.code === 11000) {
        const ws = await WorkspaceModel.findOne({ slug }).lean();
        if (ws) return ws;
      }
      throw e;
    }
  },

  /** Workspaces the user belongs to, with their role in each. */
  async listForUser(userId: string) {
    await this.ensurePersonal(userId);
    const memberships = await MembershipModel.find({ userId })
      .populate('workspaceId')
      .sort({ lastSeenAt: -1, createdAt: -1 })
      .lean();
    return memberships
      .filter((m) => m.workspaceId && !(m.workspaceId as any).archivedAt)
      .map((m) => workspaceDTO(m.workspaceId, m.role as WorkspaceRole));
  },

  async create(userId: string, input: { name: string; iconEmoji?: string }) {
    const ws = await WorkspaceModel.create({
      name: input.name,
      slug: makeSlug(input.name),
      kind: 'team',
      iconEmoji: input.iconEmoji ?? '🗂️',
      createdBy: new Types.ObjectId(userId),
    });
    await MembershipModel.create({
      userId: new Types.ObjectId(userId),
      workspaceId: ws._id,
      role: 'owner',
    });
    return workspaceDTO(ws, 'owner');
  },

  async update(
    actor: { userId: string; role: WorkspaceRole },
    workspaceId: string,
    input: { name?: string; iconEmoji?: string },
  ) {
    if (!can(actor.role, 'workspace.update')) throw new HttpError(403, 'Forbidden');
    const ws = await WorkspaceModel.findByIdAndUpdate(workspaceId, input, { new: true });
    if (!ws) throw new HttpError(404, 'WorkspaceNotFound');
    return workspaceDTO(ws, actor.role);
  },

  /**
   * Archives a team workspace. Personal workspaces are never deletable —
   * they're tied 1:1 to the user lifecycle (cascade handled by the auth
   * deletion hook in Slice 7.2).
   */
  async archive(actor: { userId: string; role: WorkspaceRole }, workspaceId: string) {
    if (!can(actor.role, 'workspace.delete')) throw new HttpError(403, 'Forbidden');
    const ws = await WorkspaceModel.findById(workspaceId);
    if (!ws) throw new HttpError(404, 'WorkspaceNotFound');
    if (ws.kind === 'personal') throw new HttpError(400, 'CannotDeletePersonal');
    ws.archivedAt = new Date();
    await ws.save();
    return { ok: true };
  },

  async listMembers(workspaceId: string) {
    const members = await MembershipModel.find({ workspaceId })
      .populate({ path: 'userId', select: 'email name avatarUrl' })
      .sort({ role: 1, joinedAt: 1 })
      .lean();
    return members.map((m) => memberDTO({ ...m, user: m.userId }));
  },

  async updateMemberRole(
    actor: { userId: string; role: WorkspaceRole },
    workspaceId: string,
    targetUserId: string,
    nextRole: WorkspaceRole,
  ) {
    if (!can(actor.role, 'workspace.member.changeRole')) throw new HttpError(403, 'Forbidden');
    if (!canAssignRole(actor.role, nextRole)) throw new HttpError(403, 'RoleNotAssignable');

    const target = await MembershipModel.findOne({ workspaceId, userId: targetUserId });
    if (!target) throw new HttpError(404, 'MemberNotFound');
    // Don't let admins demote owners.
    if (target.role === 'owner' && actor.role !== 'owner') throw new HttpError(403, 'Forbidden');
    // Prevent removing the last owner.
    if (target.role === 'owner' && nextRole !== 'owner') {
      const owners = await MembershipModel.countDocuments({ workspaceId, role: 'owner' });
      if (owners <= 1) throw new HttpError(400, 'LastOwner');
    }
    target.role = nextRole;
    await target.save();
    return memberDTO(target);
  },

  async removeMember(
    actor: { userId: string; role: WorkspaceRole },
    workspaceId: string,
    targetUserId: string,
  ) {
    const isSelf = String(actor.userId) === String(targetUserId);
    if (!isSelf && !can(actor.role, 'workspace.member.remove')) throw new HttpError(403, 'Forbidden');

    const target = await MembershipModel.findOne({ workspaceId, userId: targetUserId });
    if (!target) throw new HttpError(404, 'MemberNotFound');
    if (target.role === 'owner') {
      const owners = await MembershipModel.countDocuments({ workspaceId, role: 'owner' });
      if (owners <= 1) throw new HttpError(400, 'LastOwner');
    }
    await target.deleteOne();
    return { ok: true };
  },

  /** Bump `lastSeenAt` on the active membership — best-effort, never throws. */
  async touch(userId: string, workspaceId: string) {
    await MembershipModel.updateOne(
      { userId, workspaceId },
      { lastSeenAt: new Date() },
    ).catch(() => undefined);
  },
};
