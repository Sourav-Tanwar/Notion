import { Types } from 'mongoose';
import { PageModel } from '../pages/pages.model';
import { BlockModel } from '../blocks/blocks.model';
import {
  pagePermissionsService,
  PermissionCache,
} from '../workspaces/pagePermissions.service';
import type { WorkspaceRole } from '../workspaces/workspaces.model';

export interface SearchHit {
  id: string;
  title: string;
  icon: string;
  parentId: string | null;
  /** Plain-text excerpt around the first content match, or null for title-only hits. */
  snippet: string | null;
  /** Where the query matched first. */
  matchedIn: 'title' | 'content';
}

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Strip HTML tags + decode the handful of entities the editor emits. */
function htmlToPlain(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Build a ~160-char excerpt centred on the first occurrence of `query`. */
function buildSnippet(plain: string, query: string): string {
  const idx = plain.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return plain.slice(0, 160);
  const radius = 70;
  const start = Math.max(0, idx - radius);
  const end = Math.min(plain.length, idx + query.length + radius);
  let snip = plain.slice(start, end);
  if (start > 0) snip = '…' + snip;
  if (end < plain.length) snip = snip + '…';
  return snip;
}

export const searchService = {
  /**
   * Full-text search across page titles and block content within a workspace.
   * Results are de-duplicated to one hit per page (title matches win over
   * content matches) and scoped to what the actor is allowed to see.
   */
  async search(
    workspaceId: string,
    actor: { userId: string; role: WorkspaceRole },
    rawQuery: string,
    limit = 20,
  ): Promise<SearchHit[]> {
    const query = rawQuery.trim();
    if (query.length < 1) return [];

    const rx = new RegExp(escapeRegExp(query), 'i');

    // Title matches (cheap, indexed scope) and content matches in parallel.
    const [titlePages, blocks] = await Promise.all([
      PageModel.find({
        workspaceId,
        archivedAt: null,
        isTemplate: { $ne: true },
        title: rx,
      })
        .select('_id title icon parentId')
        .limit(limit)
        .lean(),
      BlockModel.find({ workspaceId, text: rx })
        .select('pageId text')
        .limit(400)
        .lean(),
    ]);

    // First content match per page → snippet source.
    const snippetByPage = new Map<string, string>();
    for (const b of blocks) {
      const pid = String(b.pageId);
      if (snippetByPage.has(pid)) continue;
      const plain = htmlToPlain(b.text ?? '');
      if (plain.toLowerCase().includes(query.toLowerCase())) {
        snippetByPage.set(pid, buildSnippet(plain, query));
      }
    }

    // Resolve content-match pages we don't already have from the title query,
    // filtering out archived pages + templates (and their descendants are
    // already excluded since blocks live on the page itself).
    const titleIds = new Set(titlePages.map((p) => String(p._id)));
    const contentOnlyIds = [...snippetByPage.keys()].filter((id) => !titleIds.has(id));
    const contentPages = contentOnlyIds.length
      ? await PageModel.find({
          _id: { $in: contentOnlyIds.map((id) => new Types.ObjectId(id)) },
          workspaceId,
          archivedAt: null,
          isTemplate: { $ne: true },
        })
          .select('_id title icon parentId')
          .lean()
      : [];

    // Guest scoping: restrict to pages the guest can actually see.
    let visible: Set<string> | null = null;
    if (actor.role === 'guest') {
      visible = await pagePermissionsService.visiblePageIdsForGuest(
        workspaceId,
        actor.userId,
        new PermissionCache(),
      );
    }

    const hits: SearchHit[] = [];
    const pushPage = (p: any, matchedIn: 'title' | 'content'): void => {
      const id = String(p._id);
      if (visible && !visible.has(id)) return;
      hits.push({
        id,
        title: p.title || 'Untitled',
        icon: p.icon || '📄',
        parentId: p.parentId ? String(p.parentId) : null,
        snippet: snippetByPage.get(id) ?? null,
        matchedIn,
      });
    };

    for (const p of titlePages) pushPage(p, 'title');
    for (const p of contentPages) pushPage(p, 'content');

    return hits.slice(0, limit);
  },
};
