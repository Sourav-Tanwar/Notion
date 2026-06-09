import type { WorkspaceRole } from './workspaces.model';

/**
 * Role hierarchy. Higher index = more powerful. Comparing roles becomes O(1)
 * via the lookup map below, and adding a new role (e.g. 'billing') is a
 * single-line change.
 */
const ROLE_RANK: Record<WorkspaceRole, number> = {
  guest: 0,
  member: 1,
  admin: 2,
  owner: 3,
};

export function roleAtLeast(actual: WorkspaceRole, required: WorkspaceRole): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[required];
}

/**
 * Coarse capability check based purely on workspace role. Page-level grants
 * (Slice 7.4) can EXPAND but never SHRINK what this returns.
 *
 * Centralising capability strings here keeps middleware + UI in sync — both
 * import the same constants, so a "can member invite?" change is one edit.
 */
export type Capability =
  | 'workspace.read'
  | 'workspace.update'
  | 'workspace.delete'
  | 'workspace.member.invite'
  | 'workspace.member.remove'
  | 'workspace.member.changeRole'
  | 'page.create'
  | 'page.update'
  | 'page.delete'
  | 'page.share';

const CAPABILITY_MIN_ROLE: Record<Capability, WorkspaceRole> = {
  'workspace.read': 'guest',
  'workspace.update': 'admin',
  'workspace.delete': 'owner',
  'workspace.member.invite': 'admin',
  'workspace.member.remove': 'admin',
  'workspace.member.changeRole': 'admin',
  // Guests cannot create top-level pages — they only access pages explicitly shared with them.
  'page.create': 'member',
  'page.update': 'member',
  'page.delete': 'member',
  'page.share': 'member',
};

export function can(role: WorkspaceRole, cap: Capability): boolean {
  return roleAtLeast(role, CAPABILITY_MIN_ROLE[cap]);
}

/**
 * Guard against privilege escalation: an actor can never grant a role
 * strictly higher than their own, and only owners can mint new owners.
 */
export function canAssignRole(actor: WorkspaceRole, target: WorkspaceRole): boolean {
  if (target === 'owner') return actor === 'owner';
  return ROLE_RANK[actor] > ROLE_RANK[target] || actor === target;
}
