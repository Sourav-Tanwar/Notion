import { Types } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { PageModel } from './pages.model';
import { BlockModel } from '../blocks/blocks.model';
import { HttpError } from '../../utils/HttpError';
import { getStorage } from '../../services/storage.service';
import { processCover } from '../../services/image.pipeline';
import { parseMarkdown } from './markdownImport';
import {
  pagePermissionsService,
  PermissionCache,
} from '../workspaces/pagePermissions.service';
import { shareLinksService } from '../workspaces/shareLinks.service';
import { DocSnapshotModel } from '../../realtime/snapshot.model';
import type { WorkspaceRole } from '../workspaces/workspaces.model';

const toDTO = (p: any) => ({
  id: String(p._id),
  workspaceId: String(p.workspaceId),
  parentId: p.parentId ? String(p.parentId) : null,
  ownerId: p.ownerId ? String(p.ownerId) : null,
  title: p.title,
  icon: p.icon,
  coverUrl: p.coverUrl ?? null,
  favorite: !!p.favorite,
  archivedAt: p.archivedAt ?? null,
  isTemplate: !!p.isTemplate,
  fullWidth: !!p.fullWidth,
  smallText: !!p.smallText,
  locked: !!p.locked,
  order: p.order,
  updatedAt: p.updatedAt,
});

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


/** Collect id of `root` and all its descendants within the workspace. */
async function collectSubtreeIds(workspaceId: string, rootId: string): Promise<string[]> {
  const all = await PageModel.find({ workspaceId }).select('_id parentId').lean();
  const childrenOf = new Map<string, string[]>();
  for (const p of all) {
    const key = p.parentId ? String(p.parentId) : 'root';
    const arr = childrenOf.get(key) ?? [];
    arr.push(String(p._id));
    childrenOf.set(key, arr);
  }
  const out: string[] = [];
  const stack = [rootId];
  while (stack.length) {
    const cur = stack.pop()!;
    out.push(cur);
    stack.push(...(childrenOf.get(cur) ?? []));
  }
  return out;
}

/**
 * Core deep-clone shared by duplicate / save-as-template / new-from-template.
 * Clones `source` plus its whole descendant subtree and every block, remapping
 * page ids (ObjectId) and block ids (UUID) so the copy is fully independent.
 * The caller supplies the root's title / parent / order / template flag.
 *
 * Yjs note: brand-new pages have no doc snapshot, so the first client to open
 * the copy seeds its realtime room from these freshly-inserted REST blocks —
 * no CRDT cloning is required.
 */
async function cloneSubtree(
  workspaceId: string,
  userId: string,
  source: any,
  root: { title?: string; parentId?: string | null; isTemplate?: boolean; order: number },
) {
  const id = String(source._id);
  const subtreeIds = await collectSubtreeIds(workspaceId, id);
  const subtreeObjIds = subtreeIds.map((x) => new Types.ObjectId(x));

  const pages = await PageModel.find({ _id: { $in: subtreeObjIds }, workspaceId }).lean();
  const byId = new Map(pages.map((p) => [String(p._id), p]));

  // Allocate a fresh ObjectId for every page in the subtree up front so we
  // can remap child parent links to their new parents.
  const idMap = new Map<string, Types.ObjectId>();
  for (const pid of subtreeIds) idMap.set(pid, new Types.ObjectId());

  const pageDocs = subtreeIds.map((pid) => {
    const p = byId.get(pid)!;
    const isRoot = pid === id;
    return {
      _id: idMap.get(pid)!,
      workspaceId: p.workspaceId,
      ownerId: new Types.ObjectId(userId),
      parentId: isRoot
        ? root.parentId
          ? new Types.ObjectId(root.parentId)
          : null
        : idMap.get(String(p.parentId))!,
      title: isRoot ? root.title ?? p.title : p.title,
      icon: p.icon,
      coverUrl: p.coverUrl ?? null,
      favorite: false,
      archivedAt: null,
      isTemplate: isRoot ? !!root.isTemplate : false,
      order: isRoot ? root.order : p.order,
    };
  });

  // Clone blocks for every page, remapping block ids + intra-page parent links
  // (block ids are page-local, so a fresh map per page is enough).
  const allBlocks = await BlockModel.find({ pageId: { $in: subtreeObjIds }, workspaceId }).lean();
  const blocksByPage = new Map<string, any[]>();
  for (const b of allBlocks) {
    const k = String(b.pageId);
    const arr = blocksByPage.get(k) ?? [];
    arr.push(b);
    blocksByPage.set(k, arr);
  }

  const blockDocs: any[] = [];
  for (const pid of subtreeIds) {
    const blocks = blocksByPage.get(pid) ?? [];
    const blockIdMap = new Map<string, string>();
    for (const b of blocks) blockIdMap.set(String(b._id), randomUUID());
    for (const b of blocks) {
      blockDocs.push({
        _id: blockIdMap.get(String(b._id))!,
        workspaceId: b.workspaceId,
        pageId: idMap.get(pid)!,
        parentId: b.parentId ? blockIdMap.get(String(b.parentId)) ?? null : null,
        type: b.type,
        text: b.text,
        order: b.order,
        props: b.props,
      });
    }
  }

  const inserted = await PageModel.insertMany(pageDocs);
  if (blockDocs.length) await BlockModel.insertMany(blockDocs);

  const newRootId = String(idMap.get(id));
  const rootDoc = inserted.find((p) => String(p._id) === newRootId) ?? inserted[0];
  return toDTO(rootDoc);
}

export const pagesService = {
  /**
   * Active (non-archived) pages, used by the sidebar.
   *
   * For workspace owners / admins / members the list is the entire workspace
   * tree. For guests it's the union of every page they hold an explicit
   * `PagePermission` on plus that page's descendants — so a shared page's
   * children appear automatically without the admin having to grant each one.
   */
  async list(
    workspaceId: string,
    actor?: { userId: string; role: WorkspaceRole },
  ) {
    const pages = await PageModel.find({ workspaceId, archivedAt: null, isTemplate: { $ne: true } })
      .sort({ order: 1 })
      .lean();
    if (!actor || actor.role !== 'guest') return pages.map(toDTO);

    const cache = new PermissionCache();
    const visible = await pagePermissionsService.visiblePageIdsForGuest(
      workspaceId,
      actor.userId,
      cache,
    );
    return pages.filter((p) => visible.has(String(p._id))).map(toDTO);
  },

  /** Archived pages, shown in the Trash view. */
  async listTrash(workspaceId: string) {
    const pages = await PageModel.find({ workspaceId, archivedAt: { $ne: null } })
      .sort({ archivedAt: -1 })
      .lean();
    return pages.map(toDTO);
  },

  async create(
    workspaceId: string,
    userId: string,
    input: { title?: string; parentId?: string | null; icon?: string },
  ) {
    const last = await PageModel.findOne({
      workspaceId,
      parentId: input.parentId ?? null,
      archivedAt: null,
    })
      .sort({ order: -1 })
      .lean();
    const page = await PageModel.create({
      workspaceId: new Types.ObjectId(workspaceId),
      ownerId: new Types.ObjectId(userId),
      parentId: input.parentId ?? null,
      title: input.title ?? 'Untitled',
      icon: input.icon ?? '📄',
      order: (last?.order ?? 0) + 1,
    });
    return toDTO(page);
  },

  /**
   * Create a page from a Markdown string. The first `# ` line becomes the
   * page title (+ leading emoji as icon); the rest is parsed into blocks.
   * List indentation is mapped to nested child blocks. Mirrors `create` for
   * placement and `cloneSubtree` for block insertion, so a freshly imported
   * page seeds its realtime room from these REST blocks on first open.
   */
  async importMarkdown(
    workspaceId: string,
    userId: string,
    markdown: string,
    parentId: string | null = null,
  ) {
    const parsed = parseMarkdown(markdown);

    const last = await PageModel.findOne({ workspaceId, parentId: parentId ?? null, archivedAt: null })
      .sort({ order: -1 })
      .lean();
    const page = await PageModel.create({
      workspaceId: new Types.ObjectId(workspaceId),
      ownerId: new Types.ObjectId(userId),
      parentId: parentId ?? null,
      title: parsed.title,
      icon: parsed.icon,
      order: (last?.order ?? 0) + 1,
    });

    // Turn the flat (type, depth) list into parent-linked block docs. A stack
    // tracks the most recent block id at each depth so a deeper item nests
    // under the nearest shallower one; depth can only step up by one level.
    const blockDocs: any[] = [];
    const parentAtDepth: (string | null)[] = [null];
    const orderAtParent = new Map<string | null, number>();
    const nextOrder = (pid: string | null): number => {
      const n = (orderAtParent.get(pid) ?? 0) + 1;
      orderAtParent.set(pid, n);
      return n;
    };

    for (const b of parsed.blocks) {
      const depth = Math.min(b.depth, parentAtDepth.length); // clamp gaps
      const parent = parentAtDepth[depth] ?? null;
      const id = randomUUID();
      blockDocs.push({
        _id: id,
        workspaceId: page.workspaceId,
        pageId: page._id,
        parentId: parent,
        type: b.type,
        text: b.text,
        order: nextOrder(parent),
        props: b.props,
      });
      // This block becomes the parent for the next-deeper level.
      parentAtDepth[depth + 1] = id;
      parentAtDepth.length = depth + 2;
    }

    if (blockDocs.length) await BlockModel.insertMany(blockDocs);
    return toDTO(page);
  },

  /**
   * Deep-duplicate a page: clones the page plus its entire descendant subtree
   * and every block on each, remapping ids so the copy is fully independent.
   * The new root is titled "<title> (Copy)" and slotted directly after the
   * original among its siblings; child pages keep their titles.
   */
  async duplicate(workspaceId: string, userId: string, id: string) {
    const source = await PageModel.findOne({ _id: id, workspaceId, archivedAt: null }).lean();
    if (!source) throw new HttpError(404, 'PageNotFound');

    // Place the copy of the root just after the original among its siblings.
    const next = await PageModel.findOne({
      workspaceId,
      parentId: source.parentId ?? null,
      archivedAt: null,
      order: { $gt: source.order },
    })
      .sort({ order: 1 })
      .lean();
    const rootOrder = next ? (source.order + next.order) / 2 : source.order + 1;

    return cloneSubtree(workspaceId, userId, source, {
      title: `${source.title} (Copy)`,
      parentId: source.parentId ? String(source.parentId) : null,
      order: rootOrder,
    });
  },

  /** Reusable templates in this workspace (hidden from the sidebar tree). */
  async listTemplates(workspaceId: string) {
    const pages = await PageModel.find({ workspaceId, archivedAt: null, isTemplate: true })
      .sort({ updatedAt: -1 })
      .lean();
    return pages.map(toDTO);
  },

  /**
   * Snapshot a page (and its subtree) into a standalone template. The original
   * page is left untouched; the template is a detached, top-level clone flagged
   * `isTemplate` so it never appears in the normal tree.
   */
  async saveAsTemplate(workspaceId: string, userId: string, id: string) {
    const source = await PageModel.findOne({ _id: id, workspaceId, archivedAt: null }).lean();
    if (!source) throw new HttpError(404, 'PageNotFound');
    return cloneSubtree(workspaceId, userId, source, {
      title: source.title,
      parentId: null,
      isTemplate: true,
      order: 0,
    });
  },

  /**
   * Instantiate a new page from a template: clones the template subtree into a
   * regular (non-template) page appended under `parentId` (or at the root).
   */
  async createFromTemplate(
    workspaceId: string,
    userId: string,
    templateId: string,
    parentId: string | null = null,
  ) {
    const source = await PageModel.findOne({
      _id: templateId,
      workspaceId,
      isTemplate: true,
    }).lean();
    if (!source) throw new HttpError(404, 'TemplateNotFound');

    const last = await PageModel.findOne({
      workspaceId,
      parentId: parentId ?? null,
      archivedAt: null,
      isTemplate: { $ne: true },
    })
      .sort({ order: -1 })
      .lean();

    return cloneSubtree(workspaceId, userId, source, {
      title: source.title,
      parentId: parentId ?? null,
      isTemplate: false,
      order: (last?.order ?? 0) + 1,
    });
  },

  /**
   * Pages that contain an inline @-mention of `pageId` ("linked references").
   * Mentions are stored in block HTML as `data-page-id="<id>"`, so we scan
   * blocks for that marker, group by their owning page, and return one entry
   * per linking page with a short text excerpt of the first mentioning block.
   */
  async backlinks(
    workspaceId: string,
    actor: { userId: string; role: WorkspaceRole },
    pageId: string,
  ): Promise<Array<{ id: string; title: string; icon: string; snippet: string }>> {
    const marker = `data-page-id="${pageId}"`;
    const rx = new RegExp(escapeRegExp(marker), 'i');

    const blocks = await BlockModel.find({ workspaceId, text: rx })
      .select('pageId text')
      .limit(500)
      .lean();
    if (!blocks.length) return [];

    // First mentioning block per source page → snippet source.
    const snippetByPage = new Map<string, string>();
    for (const b of blocks) {
      const src = String(b.pageId);
      if (src === pageId) continue; // ignore self-references
      if (!snippetByPage.has(src)) snippetByPage.set(src, htmlToPlain(String(b.text)));
    }
    if (!snippetByPage.size) return [];

    const sourceIds = [...snippetByPage.keys()];
    const pages = await PageModel.find({
      _id: { $in: sourceIds.map((x) => new Types.ObjectId(x)) },
      workspaceId,
      archivedAt: null,
      isTemplate: { $ne: true },
    })
      .select('_id title icon')
      .lean();

    let visible: Set<string> | null = null;
    if (actor.role === 'guest') {
      visible = await pagePermissionsService.visiblePageIdsForGuest(
        workspaceId,
        actor.userId,
        new PermissionCache(),
      );
    }

    const out: Array<{ id: string; title: string; icon: string; snippet: string }> = [];
    for (const p of pages) {
      const sid = String(p._id);
      if (visible && !visible.has(sid)) continue;
      out.push({
        id: sid,
        title: p.title,
        icon: p.icon,
        snippet: snippetByPage.get(sid)?.slice(0, 160) ?? '',
      });
    }
    return out;
  },

  async update(
    workspaceId: string,
    id: string,
    input: Partial<{
      title: string;
      icon: string;
      parentId: string | null;
      order: number;
      favorite: boolean;
      coverUrl: string | null;
      fullWidth: boolean;
      smallText: boolean;
      locked: boolean;
    }>,
  ) {
    const page = await PageModel.findOneAndUpdate({ _id: id, workspaceId }, input, { new: true });
    if (!page) throw new HttpError(404, 'PageNotFound');
    return toDTO(page);
  },

  /**
   * Soft delete: mark page and all descendants as archived. Blocks are NOT
   * touched — content survives so restore is lossless.
   */
  async archive(workspaceId: string, id: string) {
    const ids = await collectSubtreeIds(workspaceId, id);
    if (!ids.length) throw new HttpError(404, 'PageNotFound');
    const objectIds = ids.map((x) => new Types.ObjectId(x));
    await PageModel.updateMany(
      { _id: { $in: objectIds }, workspaceId },
      { archivedAt: new Date() },
    );
    return { ok: true, archived: ids };
  },

  /** Restore an archived page (and all its archived descendants). */
  async restore(workspaceId: string, id: string) {
    const ids = await collectSubtreeIds(workspaceId, id);
    if (!ids.length) throw new HttpError(404, 'PageNotFound');
    const objectIds = ids.map((x) => new Types.ObjectId(x));
    await PageModel.updateMany(
      { _id: { $in: objectIds }, workspaceId },
      { archivedAt: null },
    );
    return { ok: true, restored: ids };
  },

  /** Hard delete: permanently drop pages + their blocks + their covers. */
  async removePermanent(workspaceId: string, id: string) {
    const ids = await collectSubtreeIds(workspaceId, id);
    const objectIds = ids.map((x) => new Types.ObjectId(x));
    const pages = await PageModel.find({ _id: { $in: objectIds }, workspaceId })
      .select('coverUrl')
      .lean();
    await Promise.all([
      PageModel.deleteMany({ _id: { $in: objectIds }, workspaceId }),
      BlockModel.deleteMany({ pageId: { $in: objectIds }, workspaceId }),
      shareLinksService.removeForPages(workspaceId, ids),
      // Drop persisted Yjs snapshots so a future page with a recycled id
      // (extremely rare with ObjectId, but defensive) doesn't rehydrate
      // a dead room's state.
      DocSnapshotModel.deleteMany({ _id: { $in: ids } }),
    ]);
    const storage = getStorage();
    for (const p of pages) {
      if (!p.coverUrl) continue;
      const idx = p.coverUrl.indexOf('/covers/');
      if (idx >= 0) {
        try {
          await storage.remove(p.coverUrl.slice(idx + 1));
        } catch {
          /* orphan harmless */
        }
      }
    }
    return { ok: true, deleted: ids };
  },

  async reorder(
    workspaceId: string,
    items: { id: string; parentId: string | null; order: number }[],
  ) {
    const ops = items.map((it) => ({
      updateOne: {
        // workspaceId in the filter prevents a malicious reorder payload from
        // touching pages in another workspace via id-guessing.
        filter: { _id: it.id, workspaceId },
        update: { parentId: it.parentId, order: it.order },
      },
    }));
    if (ops.length) await PageModel.bulkWrite(ops);
    return { ok: true };
  },

  /** Upload (or replace) a page cover image. Re-encodes via sharp. */
  async setCover(workspaceId: string, id: string, fileBuf: Buffer) {
    const page = await PageModel.findOne({ _id: id, workspaceId });
    if (!page) throw new HttpError(404, 'PageNotFound');

    const processed = await processCover(fileBuf);
    const key = `covers/${id}-${Date.now()}.${processed.ext}`;
    const url = await getStorage().save(key, processed.buffer, processed.mime);

    const previous = page.coverUrl;
    page.coverUrl = url;
    await page.save();

    if (previous) {
      const idx = previous.indexOf('/covers/');
      if (idx >= 0) {
        try {
          await getStorage().remove(previous.slice(idx + 1));
        } catch {
          /* orphan harmless */
        }
      }
    }
    return toDTO(page);
  },

  async clearCover(workspaceId: string, id: string) {
    const page = await PageModel.findOne({ _id: id, workspaceId });
    if (!page) throw new HttpError(404, 'PageNotFound');
    const previous = page.coverUrl;
    page.coverUrl = null;
    await page.save();
    if (previous) {
      const idx = previous.indexOf('/covers/');
      if (idx >= 0) {
        try {
          await getStorage().remove(previous.slice(idx + 1));
        } catch {
          /* ignore */
        }
      }
    }
    return toDTO(page);
  },

  /**
   * Permanently delete every page that has been in Trash longer than
   * `olderThanDays`. Runs across all workspaces (it's a maintenance sweep,
   * not a user request), cleaning up blocks, snapshots, share links and
   * cover files alongside the pages. Returns the number of pages purged.
   */
  async purgeExpiredTrash(olderThanDays: number) {
    if (!olderThanDays || olderThanDays <= 0) return { purged: 0 };
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
    const expired = await PageModel.find({ archivedAt: { $ne: null, $lt: cutoff } })
      .select('_id workspaceId coverUrl')
      .lean();
    if (!expired.length) return { purged: 0 };

    const objectIds = expired.map((p) => p._id);
    const ids = expired.map((p) => String(p._id));

    // Group ids by workspace for share-link cleanup.
    const byWorkspace = new Map<string, string[]>();
    for (const p of expired) {
      const ws = String(p.workspaceId);
      (byWorkspace.get(ws) ?? byWorkspace.set(ws, []).get(ws)!).push(String(p._id));
    }

    await Promise.all([
      PageModel.deleteMany({ _id: { $in: objectIds } }),
      BlockModel.deleteMany({ pageId: { $in: objectIds } }),
      DocSnapshotModel.deleteMany({ _id: { $in: ids } }),
      ...Array.from(byWorkspace, ([ws, wsIds]) => shareLinksService.removeForPages(ws, wsIds)),
    ]);

    const storage = getStorage();
    for (const p of expired) {
      if (!p.coverUrl) continue;
      const idx = p.coverUrl.indexOf('/covers/');
      if (idx >= 0) {
        try {
          await storage.remove(p.coverUrl.slice(idx + 1));
        } catch {
          /* orphan harmless */
        }
      }
    }

    return { purged: ids.length };
  },
};
