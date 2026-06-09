import { Types } from 'mongoose';
import { PageModel } from '../pages/pages.model';
import { PagePermissionModel } from './pagePermissions.model';
import { UserModel } from '../auth/auth.model';
import { MembershipModel, type WorkspaceRole } from './workspaces.model';
import { HttpError } from '../../utils/HttpError';
import {
  type PageLevel,
  type GrantableLevel,
  maxLevel,
  workspaceBaseline,
} from './pagePermissions';

const grantDTO = (g: any) => ({
  id: String(g._id),
  pageId: String(g.pageId),
  userId: String(g.userId),
  level: g.level as GrantableLevel,
  grantedBy: String(g.grantedBy),
  createdAt: g.createdAt,
});

/**
 * Per-request memo. The resolver attaches one of these to the Express request
 * (via the middleware) so a handler that touches several pages — e.g. a bulk
 * block upsert spanning multiple pages — pays exactly one DB roundtrip per
 * page id, not per check.
 *
 * Lives only for the lifetime of the request; for a process-wide cache you'd
 * need to invalidate on grant change, which is Redis territory (out of scope).
 */
export class PermissionCache {
  private readonly resolved = new Map<string, PageLevel>();
  private readonly ancestors = new Map<string, string[]>();
  private workspacePages: { id: string; parentId: string | null }[] | null = null;

  has(pageId: string): boolean {
    return this.resolved.has(pageId);
  }
  get(pageId: string): PageLevel | undefined {
    return this.resolved.get(pageId);
  }
  set(pageId: string, level: PageLevel): void {
    this.resolved.set(pageId, level);
  }
  getAncestors(pageId: string): string[] | undefined {
    return this.ancestors.get(pageId);
  }
  setAncestors(pageId: string, chain: string[]): void {
    this.ancestors.set(pageId, chain);
  }
  getWorkspacePages(): { id: string; parentId: string | null }[] | null {
    return this.workspacePages;
  }
  setWorkspacePages(pages: { id: string; parentId: string | null }[]): void {
    this.workspacePages = pages;
  }
}

/**
 * Single workspace-wide read of `{ _id, parentId }`. Cheap (covered by the
 * `{ workspaceId, parentId, order }` index from Slice 7.2) and amortised
 * across every ancestor walk in the request.
 */
async function loadWorkspaceShape(
  workspaceId: string,
  cache: PermissionCache,
): Promise<Map<string, string | null>> {
  let pages = cache.getWorkspacePages();
  if (!pages) {
    const docs = await PageModel.find({ workspaceId }).select('_id parentId').lean();
    pages = docs.map((p) => ({
      id: String(p._id),
      parentId: p.parentId ? String(p.parentId) : null,
    }));
    cache.setWorkspacePages(pages);
  }
  const parentOf = new Map<string, string | null>();
  for (const p of pages) parentOf.set(p.id, p.parentId);
  return parentOf;
}

/** [pageId, parent, grandparent, ...] inclusive. Cycle-safe. */
function ancestorChain(parentOf: Map<string, string | null>, pageId: string): string[] {
  const chain: string[] = [];
  const seen = new Set<string>();
  let cur: string | null = pageId;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    chain.push(cur);
    cur = parentOf.get(cur) ?? null;
  }
  return chain;
}

export const pagePermissionsService = {
  /**
   * Resolve the effective permission for `(userId, pageId)`.
   *
   *   1. Owners / admins → `full` short-circuit (rescue ladder).
   *   2. Walk the page's ancestor chain from self → root.
   *   3. Closest ancestor with an explicit grant for this user wins.
   *   4. If no explicit grant anywhere on the chain, fall back to the
   *      workspace-role baseline.
   *
   * Complexity: one read of the workspace-wide `{_id, parentId}` projection
   * (cached for the request) + one read of grants on the ancestor chain. For
   * typical workspaces this is two indexed queries regardless of tree depth.
   */
  async resolve(
    workspaceId: string,
    userId: string,
    pageId: string,
    role: WorkspaceRole,
    cache: PermissionCache,
  ): Promise<PageLevel> {
    const cached = cache.get(pageId);
    if (cached !== undefined) return cached;

    if (role === 'owner' || role === 'admin') {
      cache.set(pageId, 'full');
      return 'full';
    }

    const parentOf = await loadWorkspaceShape(workspaceId, cache);
    // Page id not in this workspace at all → treat as 'none'. The page route
    // will turn that into a 404; we never want to leak existence.
    if (!parentOf.has(pageId)) {
      cache.set(pageId, 'none');
      return 'none';
    }
    const chain = ancestorChain(parentOf, pageId);
    cache.setAncestors(pageId, chain);

    const grants = await PagePermissionModel.find({
      pageId: { $in: chain.map((id) => new Types.ObjectId(id)) },
      userId,
    })
      .select('pageId level')
      .lean();
    const grantByPage = new Map<string, PageLevel>();
    for (const g of grants) grantByPage.set(String(g.pageId), g.level as PageLevel);

    let inherited: PageLevel | null = null;
    for (const ancestorId of chain) {
      const g = grantByPage.get(ancestorId);
      if (g) {
        inherited = g;
        break;
      }
    }

    const baseline = workspaceBaseline(role);
    // Explicit grants for guests REPLACE the (none) baseline. For members,
    // an explicit grant only kicks in if it's higher than `edit` — we never
    // demote a member below the workspace floor via inheritance.
    const final = inherited ? maxLevel(inherited, baseline) : baseline;
    cache.set(pageId, final);
    return final;
  },

  /**
   * Returns the subset of pageIds (and their descendants) a guest can see.
   * Used by the sidebar list endpoint to scope the tree for limited-access
   * users without trickling permission checks down every node at render time.
   */
  async visiblePageIdsForGuest(
    workspaceId: string,
    userId: string,
    cache: PermissionCache,
  ): Promise<Set<string>> {
    const parentOf = await loadWorkspaceShape(workspaceId, cache);
    const grants = await PagePermissionModel.find({ workspaceId, userId })
      .select('pageId')
      .lean();
    const roots = new Set(grants.map((g) => String(g.pageId)));
    if (!roots.size) return new Set();

    // Build child index so subtree expansion is O(N) total, not O(N²).
    const childrenOf = new Map<string, string[]>();
    for (const [id, parentId] of parentOf) {
      if (!parentId) continue;
      const arr = childrenOf.get(parentId) ?? [];
      arr.push(id);
      childrenOf.set(parentId, arr);
    }

    const visible = new Set<string>();
    const stack = [...roots];
    while (stack.length) {
      const cur = stack.pop()!;
      if (visible.has(cur)) continue;
      visible.add(cur);
      const kids = childrenOf.get(cur) ?? [];
      for (const k of kids) stack.push(k);
    }
    return visible;
  },

  /* ---------- Admin / sharing CRUD ---------- */

  async list(workspaceId: string, pageId: string) {
    const grants = await PagePermissionModel.find({ workspaceId, pageId })
      .populate({ path: 'userId', select: 'email name avatarUrl' })
      .lean();
    return grants.map((g) => ({
      ...grantDTO({ ...g, userId: (g.userId as any)?._id ?? g.userId }),
      user: g.userId
        ? {
            id: String((g.userId as any)._id),
            email: (g.userId as any).email,
            name: (g.userId as any).name ?? '',
            avatarUrl: (g.userId as any).avatarUrl ?? null,
          }
        : null,
    }));
  },

  /**
   * Grant or update a single user's access to a page.
   *
   * Pre-conditions enforced here (not in routes) so they survive any future
   * caller (e.g. a bulk-share endpoint):
   *  - Target user must be a member of the workspace; we don't create
   *    cross-workspace ghost grants.
   *  - Cannot grant to owners/admins — they already have `full` workspace-wide.
   */
  async upsert(
    workspaceId: string,
    pageId: string,
    grantedBy: string,
    input: { userId: string; level: GrantableLevel },
  ) {
    const target = await MembershipModel.findOne({
      workspaceId,
      userId: input.userId,
    })
      .select('role')
      .lean();
    if (!target) throw new HttpError(400, 'TargetNotMember');
    if (target.role === 'owner' || target.role === 'admin') {
      throw new HttpError(400, 'TargetHasWorkspaceAccess');
    }

    const grant = await PagePermissionModel.findOneAndUpdate(
      { workspaceId, pageId, userId: input.userId },
      {
        $set: { level: input.level, grantedBy },
        $setOnInsert: { workspaceId, pageId, userId: input.userId },
      },
      { new: true, upsert: true },
    );
    return grantDTO(grant);
  },

  async remove(workspaceId: string, pageId: string, userId: string) {
    await PagePermissionModel.deleteOne({ workspaceId, pageId, userId });
    return { ok: true };
  },

  /**
   * What permission does the current user have on this page? Surfaced to the
   * UI so it can hide the "Share" button, disable the editor for view-only
   * users, etc. Saves a round-trip per page.
   */
  async describeAccess(
    workspaceId: string,
    userId: string,
    pageId: string,
    role: WorkspaceRole,
  ) {
    const cache = new PermissionCache();
    const level = await this.resolve(workspaceId, userId, pageId, role, cache);
    return { level, role };
  },

  /** Resolve a target user by email (sharing UI calls this).
   *
   *  Returns `null` when:
   *   - no user owns that email, OR
   *   - the user exists but is not a member of this workspace.
   *
   *  Page-level grants are only valid for workspace members (the upsert
   *  endpoint enforces this too), so we filter non-members out here so the
   *  sharing modal can show the "invite them first" copy without a second
   *  round-trip. The response shape matches the client `CandidateDTO`.
   */
  async findCandidateByEmail(workspaceId: string, email: string) {
    const user = await UserModel.findOne({ email: email.toLowerCase() })
      .select('_id email name avatarUrl')
      .lean();
    if (!user) return null;
    const member = await MembershipModel.findOne({ workspaceId, userId: user._id })
      .select('role')
      .lean();
    if (!member) return null;
    return {
      userId: String(user._id),
      email: user.email,
      name: user.name ?? '',
      avatarUrl: user.avatarUrl ?? null,
      role: member.role,
    };
  },
};
