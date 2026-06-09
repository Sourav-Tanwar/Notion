/**
 * Page-permission level vocabulary.
 *
 * Ordered low→high so numeric comparison drives every check. Adding a new
 * level (e.g. `'suggest'`) is a single-line change here; no call site needs
 * to know the ordinal.
 */
export const PAGE_LEVELS = ['none', 'view', 'comment', 'edit', 'full'] as const;
export type PageLevel = (typeof PAGE_LEVELS)[number];
/** Levels that can be granted via the API. `none` is implicit (absence of grant). */
export type GrantableLevel = Exclude<PageLevel, 'none'>;
export const GRANTABLE_LEVELS: readonly GrantableLevel[] = ['view', 'comment', 'edit', 'full'];

const RANK: Record<PageLevel, number> = {
  none: 0,
  view: 1,
  comment: 2,
  edit: 3,
  full: 4,
};

export function levelAtLeast(actual: PageLevel, required: PageLevel): boolean {
  return RANK[actual] >= RANK[required];
}

export function maxLevel(a: PageLevel, b: PageLevel): PageLevel {
  return RANK[a] >= RANK[b] ? a : b;
}

/**
 * Workspace-role baseline applied before any explicit page grants are
 * considered. Explicit grants can still *raise* this floor for guests, and
 * (by design) *replace* it for members on specific subtrees — see the
 * resolver in `pagePermissions.service.ts`.
 *
 * Owners / admins are intentionally NOT overridable here: even if an admin
 * gets accidentally restricted via a misconfigured grant, the workspace floor
 * keeps the rescue ladder intact.
 */
export function workspaceBaseline(role: 'owner' | 'admin' | 'member' | 'guest'): PageLevel {
  switch (role) {
    case 'owner':
    case 'admin':
      return 'full';
    case 'member':
      return 'edit';
    case 'guest':
    default:
      return 'none';
  }
}
