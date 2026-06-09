import { create } from 'zustand';
import { pagesApi } from '@/services/pages.api';
import { uid } from '@/lib/uid';
import type { ID, Page } from '@/types/domain';

interface PagesState {
  byId: Record<ID, Page>;
  rootIds: ID[];                 // active (non-archived), parentId === null
  childrenOf: Record<ID, ID[]>;  // active children only, parentId -> child ids in order
  trashIds: ID[];                // archived top-level (parentless OR parent is also archived)
  trashById: Record<ID, Page>;   // archived pages, kept separate from the active byId index
  loaded: boolean;
  trashLoaded: boolean;

  fetchAll: () => Promise<void>;
  fetchTrash: () => Promise<void>;
  createPage: (parentId?: ID | null) => Promise<Page>;
  /** Deep-copy a page (and its subtree). Returns the new root page. */
  duplicatePage: (id: ID) => Promise<Page>;
  /** Snapshot a page (and its subtree) into a reusable template. */
  saveAsTemplate: (id: ID) => Promise<Page>;
  /** Create a new page from a template. Returns the new root page. */
  createFromTemplate: (templateId: ID, parentId?: ID | null) => Promise<Page>;
  importMarkdown: (markdown: string, parentId?: ID | null) => Promise<Page>;
  renamePage: (id: ID, title: string) => Promise<void>;
  setIcon: (id: ID, icon: string) => Promise<void>;
  setCover: (id: ID, file: File) => Promise<void>;
  /** Set the cover to a remote image URL (e.g. an Unsplash photo). */
  setCoverUrl: (id: ID, url: string) => Promise<void>;
  removeCover: (id: ID) => Promise<void>;
  toggleFavorite: (id: ID) => Promise<void>;
  /** Update layout/typography/lock settings on a page. */
  setPageSettings: (
    id: ID,
    patch: Partial<Pick<Page, 'fullWidth' | 'smallText' | 'locked'>>,
  ) => Promise<void>;
  /** Soft-delete (archive). Cascades visually to descendants. */
  deletePage: (id: ID) => Promise<void>;
  /** Restore a previously archived page (and its archived descendants). */
  restorePage: (id: ID) => Promise<void>;
  /** Hard-delete a page already in trash. */
  deletePermanent: (id: ID) => Promise<void>;
  /** Move a page; recomputes ordering for old & new parent. */
  movePage: (id: ID, newParentId: ID | null, newIndex: number) => Promise<void>;
  /** Wipe all in-memory page state (e.g. on logout / account switch). */
  reset: () => void;
}

function buildIndex(pages: Page[]) {
  const byId: Record<ID, Page> = {};
  const childrenOf: Record<ID, ID[]> = {};
  const rootIds: ID[] = [];
  const sorted = [...pages].sort((a, b) => a.order - b.order);
  for (const p of sorted) {
    byId[p.id] = p;
    if (p.parentId === null) rootIds.push(p.id);
    else (childrenOf[p.parentId] ??= []).push(p.id);
  }
  return { byId, rootIds, childrenOf };
}

export const usePagesStore = create<PagesState>((set, get) => ({
  byId: {},
  rootIds: [],
  childrenOf: {},
  trashIds: [],
  trashById: {},
  loaded: false,
  trashLoaded: false,

  async fetchAll() {
    const pages = await pagesApi.list();
    set({ ...buildIndex(pages), loaded: true });
  },

  reset() {
    set({
      byId: {},
      rootIds: [],
      childrenOf: {},
      trashIds: [],
      trashById: {},
      loaded: false,
      trashLoaded: false,
    });
  },

  async fetchTrash() {
    const pages = await pagesApi.listTrash();
    // Keep trash pages in a dedicated map so the Trash view renders
    // independently of the active `byId` index (which fetchAll rebuilds).
    const trashIds: ID[] = pages.map((p) => p.id);
    set({
      trashById: Object.fromEntries(pages.map((p) => [p.id, p])),
      trashIds,
      trashLoaded: true,
    });
  },

  async createPage(parentId = null) {
    const tempId = uid();
    const siblings = parentId === null ? get().rootIds : get().childrenOf[parentId] ?? [];
    const order = siblings.length + 1;
    const optimistic: Page = {
      id: tempId,
      parentId,
      title: 'Untitled',
      icon: '📄',
      coverUrl: null,
      favorite: false,
      archivedAt: null,
      order,
    };

    set((s) => ({
      byId: { ...s.byId, [tempId]: optimistic },
      rootIds: parentId === null ? [...s.rootIds, tempId] : s.rootIds,
      childrenOf:
        parentId === null ? s.childrenOf : { ...s.childrenOf, [parentId]: [...siblings, tempId] },
    }));

    try {
      const created = await pagesApi.create({ parentId, title: 'Untitled' });
      set((s) => {
        const byId = { ...s.byId };
        delete byId[tempId];
        byId[created.id] = created;
        const swap = (arr: ID[]) => arr.map((x) => (x === tempId ? created.id : x));
        return {
          byId,
          rootIds: parentId === null ? swap(s.rootIds) : s.rootIds,
          childrenOf:
            parentId === null
              ? s.childrenOf
              : { ...s.childrenOf, [parentId]: swap(s.childrenOf[parentId] ?? []) },
        };
      });
      return created;
    } catch (e) {
      set((s) => {
        const byId = { ...s.byId };
        delete byId[tempId];
        const drop = (arr: ID[]) => arr.filter((x) => x !== tempId);
        return {
          byId,
          rootIds: parentId === null ? drop(s.rootIds) : s.rootIds,
          childrenOf:
            parentId === null
              ? s.childrenOf
              : { ...s.childrenOf, [parentId]: drop(s.childrenOf[parentId] ?? []) },
        };
      });
      throw e;
    }
  },

  async duplicatePage(id) {
    const root = await pagesApi.duplicate(id);
    // The server clones an entire subtree; refetch to rebuild the tree index
    // rather than re-deriving the remapped descendants client-side.
    await get().fetchAll();
    return root;
  },

  async saveAsTemplate(id) {
    // Templates are hidden from the tree, so no local index update is needed.
    return pagesApi.saveAsTemplate(id);
  },

  async createFromTemplate(templateId, parentId = null) {
    const root = await pagesApi.createFromTemplate(templateId, parentId ?? null);
    await get().fetchAll();
    return root;
  },

  async importMarkdown(markdown, parentId = null) {
    const root = await pagesApi.importMarkdown(markdown, parentId ?? null);
    // The server creates a page plus its block subtree; refetch to rebuild the
    // tree index, mirroring duplicate/createFromTemplate.
    await get().fetchAll();
    return root;
  },

  async renamePage(id, title) {
    const prev = get().byId[id];
    if (!prev) return;
    set((s) => ({ byId: { ...s.byId, [id]: { ...prev, title } } }));
    try {
      await pagesApi.update(id, { title });
    } catch (e) {
      set((s) => ({ byId: { ...s.byId, [id]: prev } }));
      throw e;
    }
  },

  async setIcon(id, icon) {
    const prev = get().byId[id];
    if (!prev) return;
    set((s) => ({ byId: { ...s.byId, [id]: { ...prev, icon } } }));
    try {
      await pagesApi.update(id, { icon });
    } catch (e) {
      set((s) => ({ byId: { ...s.byId, [id]: prev } }));
      throw e;
    }
  },

  async setCover(id, file) {
    const updated = await pagesApi.uploadCover(id, file);
    set((s) => ({ byId: { ...s.byId, [id]: { ...s.byId[id], ...updated } } }));
  },

  async setCoverUrl(id, url) {
    const prev = get().byId[id];
    if (!prev) return;
    set((s) => ({ byId: { ...s.byId, [id]: { ...prev, coverUrl: url } } }));
    try {
      await pagesApi.update(id, { coverUrl: url });
    } catch (e) {
      set((s) => ({ byId: { ...s.byId, [id]: prev } }));
      throw e;
    }
  },

  async removeCover(id) {
    const updated = await pagesApi.removeCover(id);
    set((s) => ({ byId: { ...s.byId, [id]: { ...s.byId[id], ...updated } } }));
  },

  async toggleFavorite(id) {
    const prev = get().byId[id];
    if (!prev) return;
    const next = !prev.favorite;
    set((s) => ({ byId: { ...s.byId, [id]: { ...prev, favorite: next } } }));
    try {
      await pagesApi.update(id, { favorite: next });
    } catch (e) {
      set((s) => ({ byId: { ...s.byId, [id]: prev } }));
      throw e;
    }
  },

  async setPageSettings(id, patch) {
    const prev = get().byId[id];
    if (!prev) return;
    set((s) => ({ byId: { ...s.byId, [id]: { ...prev, ...patch } } }));
    try {
      await pagesApi.update(id, patch);
    } catch (e) {
      set((s) => ({ byId: { ...s.byId, [id]: prev } }));
      throw e;
    }
  },

  async deletePage(id) {
    const snapshot = {
      byId: get().byId,
      rootIds: get().rootIds,
      childrenOf: get().childrenOf,
      trashIds: get().trashIds,
      trashById: get().trashById,
    };
    const page = snapshot.byId[id];
    if (!page) return;
    const parentId = page.parentId;

    // Collect descendant ids from the *active* tree.
    const archived = new Set<ID>();
    const stack = [id];
    while (stack.length) {
      const cur = stack.pop()!;
      archived.add(cur);
      stack.push(...(snapshot.childrenOf[cur] ?? []));
    }

    // Move out of active tree; keep in byId with archivedAt set so the
    // Trash view can render even without an explicit refetch.
    const now = new Date().toISOString();
    set((s) => {
      const byId = { ...s.byId };
      const trashById = { ...s.trashById };
      archived.forEach((x) => {
        if (byId[x]) {
          byId[x] = { ...byId[x], archivedAt: now };
          trashById[x] = byId[x];
        }
      });
      const childrenOf = { ...s.childrenOf };
      archived.forEach((x) => delete childrenOf[x]);
      if (parentId !== null) {
        childrenOf[parentId] = (childrenOf[parentId] ?? []).filter((x) => x !== id);
      }
      const rootIds = parentId === null ? s.rootIds.filter((x) => x !== id) : s.rootIds;
      // Add the archived root to trashIds (descendants stay nested inside).
      const trashIds = [id, ...s.trashIds.filter((x) => x !== id)];
      return { byId, childrenOf, rootIds, trashIds, trashById };
    });

    try {
      await pagesApi.remove(id);
    } catch (e) {
      set(snapshot);
      throw e;
    }
  },

  async restorePage(id) {
    // Server-side restore is cheap; just refetch both lists to avoid
    // re-implementing the "find archived descendants" walk client-side.
    try {
      await pagesApi.restore(id);
    } finally {
      await Promise.all([get().fetchAll(), get().fetchTrash()]);
    }
  },

  async deletePermanent(id) {
    const prevTrashIds = get().trashIds;
    const prevTrashById = get().trashById;
    set((s) => {
      const trashById = { ...s.trashById };
      delete trashById[id];
      return { trashIds: s.trashIds.filter((x) => x !== id), trashById };
    });
    try {
      const res = await pagesApi.removePermanent(id);
      // The server cascades to the whole subtree (archived descendants are
      // listed as separate trash rows), so drop every deleted id — not just
      // the clicked one.
      const deleted = res?.deleted?.length ? res.deleted : [id];
      const removed = new Set(deleted);
      set((s) => {
        const trashById = { ...s.trashById };
        for (const d of deleted) delete trashById[d];
        const byId = { ...s.byId };
        for (const d of deleted) delete byId[d];
        return { byId, trashById, trashIds: s.trashIds.filter((x) => !removed.has(x)) };
      });
    } catch (e) {
      set({ trashIds: prevTrashIds, trashById: prevTrashById });
      throw e;
    }
  },

  async movePage(id, newParentId, newIndex) {
    const s = get();
    const page = s.byId[id];
    if (!page) return;
    const oldParentId = page.parentId;

    const removeFrom = (arr: ID[]) => arr.filter((x) => x !== id);
    const insertAt = (arr: ID[], i: number) => [...arr.slice(0, i), id, ...arr.slice(i)];

    const next = { ...s };
    const childrenOf = { ...s.childrenOf };
    let rootIds = s.rootIds;

    if (oldParentId === null) rootIds = removeFrom(rootIds);
    else childrenOf[oldParentId] = removeFrom(childrenOf[oldParentId] ?? []);

    if (newParentId === null) rootIds = insertAt(rootIds, newIndex);
    else childrenOf[newParentId] = insertAt(childrenOf[newParentId] ?? [], newIndex);

    const items: { id: ID; parentId: ID | null; order: number }[] = [];
    const reindex = (arr: ID[], parentId: ID | null) =>
      arr.forEach((cid, i) => items.push({ id: cid, parentId, order: i + 1 }));

    if (oldParentId !== newParentId) {
      if (oldParentId === null) reindex(rootIds, null);
      else reindex(childrenOf[oldParentId] ?? [], oldParentId);
    }
    if (newParentId === null) reindex(rootIds, null);
    else reindex(childrenOf[newParentId] ?? [], newParentId);

    const byId = { ...s.byId, [id]: { ...page, parentId: newParentId } };
    for (const it of items) byId[it.id] = { ...byId[it.id], order: it.order, parentId: it.parentId };

    set({ ...next, byId, childrenOf, rootIds });

    try {
      await pagesApi.reorder(items);
    } catch (e) {
      await get().fetchAll();
      throw e;
    }
  },
}));

/* ---------- Selectors (stable references → opt-in subscriptions) ---------- */

export const selectRootIds = (s: PagesState) => s.rootIds;
export const selectChildrenOf = (parentId: ID | null) => (s: PagesState) =>
  parentId === null ? s.rootIds : s.childrenOf[parentId] ?? [];
export const selectPage = (id: ID) => (s: PagesState) => s.byId[id];

/** Active pages flagged as favorite, in title order. */
export const selectFavoriteIds = (s: PagesState): ID[] => {
  const ids: ID[] = [];
  for (const id of Object.keys(s.byId)) {
    const p = s.byId[id];
    if (p && p.favorite && !p.archivedAt) ids.push(id);
  }
  return ids;
};

/** All active pages flat (used by quick switcher). */
export const selectAllActive = (s: PagesState): Page[] =>
  Object.values(s.byId).filter((p): p is Page => !!p && !p.archivedAt);

export const selectTrashIds = (s: PagesState) => s.trashIds;

/** Lookup for a single archived page (used by the Trash view). */
export const selectTrashPage = (id: ID) => (s: PagesState) => s.trashById[id];
