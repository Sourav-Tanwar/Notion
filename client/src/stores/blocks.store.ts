import { create } from 'zustand';
import { blocksApi } from '@/services/blocks.api';
import { uid } from '@/lib/uid';
import { debounce } from '@/lib/debounce';
import type { Block, BlockType, ID } from '@/types/domain';

/**
 * Blocks state is NORMALIZED:
 *   byId         : ID -> Block          (O(1) lookup, allows React.memo to skip)
 *   childrenOf   : parentId|'__root__' -> ID[]   (sibling ordering)
 *   rootByPage   : pageId -> ID[]       (top-level blocks per page)
 *
 * Why normalize? In a deeply nested tree, mutating a leaf would force every
 * ancestor to be a NEW object reference if we stored the tree directly, busting
 * memoization for every sibling. Here, only the touched block changes identity.
 */

export interface BlocksState {
  byId: Record<ID, Block>;
  childrenOf: Record<ID, ID[]>;     // for nested blocks
  rootByPage: Record<ID, ID[]>;     // top-level blocks for a page
  loadedPages: Set<ID>;
  dirty: Set<ID>;                   // blocks awaiting autosave
  deletedBuffer: Set<ID>;           // ids awaiting server delete

  fetchPage: (pageId: ID) => Promise<void>;

  // Mutations (all optimistic)
  setText: (id: ID, text: string) => void;
  setType: (id: ID, type: BlockType) => void;
  setProp: (id: ID, key: string, value: unknown) => void;
  insertAfter: (id: ID, type?: BlockType, props?: Record<string, unknown>) => ID;
  insertFirst: (pageId: ID, type?: BlockType) => ID;
  /** Append a new block as the last child of `parentId` (used by columns). */
  insertChild: (parentId: ID, type?: BlockType, props?: Record<string, unknown>) => ID;
  removeBlock: (id: ID) => ID | null; // returns id of block to focus
  removeMany: (ids: ID[]) => ID | null;
  duplicate: (id: ID) => ID | null;
  indent: (id: ID) => boolean;          // Tab: nest under previous sibling
  outdent: (id: ID) => boolean;         // Shift+Tab: move out of parent
  reorder: (movingId: ID, newParentId: ID | null, newIndex: number, pageId: ID) => void;

  // Clipboard (tree-aware)
  serializeTree: (ids: ID[]) => SerializedTree;
  pasteTree: (afterId: ID, tree: SerializedTree) => ID[]; // returns new top-level ids

  // History
  undo: () => boolean;
  redo: () => boolean;
  canUndo: () => boolean;
  canRedo: () => boolean;
  /** Run several mutations as a SINGLE undo step (e.g. an AI insertion). */
  runBatch: (fn: () => void) => void;

  // Persistence
  flushNow: () => Promise<void>;
  /** Wipe all in-memory block state (e.g. on logout / account switch). */
  reset: () => void;
}

export interface SerializedTree {
  version: 1;
  nodes: Array<{
    id: ID;
    type: BlockType;
    text: string;
    props: Record<string, unknown>;
    children: SerializedTree['nodes'];
  }>;
}

const ROOT = '__root__';
const rootKey = (pageId: ID) => `${ROOT}:${pageId}`;

function siblingsKey(b: Pick<Block, 'parentId' | 'pageId'>): string {
  return b.parentId === null ? rootKey(b.pageId) : b.parentId;
}

export const useBlocksStore = create<BlocksState>((set, get) => {
  /* ---------- history (snapshot-based, coalesced) ---------- */
  type Snap = Pick<BlocksState, 'byId' | 'childrenOf' | 'rootByPage'>;
  const past: Snap[] = [];
  const future: Snap[] = [];
  let lastSnapAt = 0;
  let historySuspended = false;
  const HISTORY_LIMIT = 50;
  const MERGE_WINDOW = 600;

  const snapshot = (): Snap => {
    const s = get();
    return { byId: s.byId, childrenOf: s.childrenOf, rootByPage: s.rootByPage };
  };
  const pushHistory = (): void => {
    if (historySuspended) return;
    const now = Date.now();
    // Coalesce rapid edits (typing) into a single undo step.
    if (now - lastSnapAt < MERGE_WINDOW && past.length) {
      lastSnapAt = now;
      return;
    }
    past.push(snapshot());
    if (past.length > HISTORY_LIMIT) past.shift();
    future.length = 0;
    lastSnapAt = now;
  };
  /** Force a fresh undo step, bypassing the coalescing window. Used to wrap a
   *  multi-mutation batch (e.g. an AI insertion) into ONE undo entry. */
  const pushHistoryForce = (): void => {
    if (historySuspended) return;
    past.push(snapshot());
    if (past.length > HISTORY_LIMIT) past.shift();
    future.length = 0;
    lastSnapAt = Date.now();
  };

  /**
   * Apply a history snapshot AND reconcile persistence. Crucially, any block
   * that exists now but NOT in the target snapshot was removed by this undo/redo
   * and must be deleted on the server — otherwise it survives in Mongo and the
   * next fetchPage (refresh or realtime refetch) resurrects it. Blocks present
   * in the target are (re)marked dirty so the server gets the rolled-back state.
   */
  const applySnapshot = (target: Snap): void => {
    const curIds = Object.keys(get().byId);
    historySuspended = true;
    set(target);
    historySuspended = false;
    const targetIds = new Set(Object.keys(target.byId));
    set((s) => {
      const dirty = new Set(s.dirty);
      const deletedBuffer = new Set(s.deletedBuffer);
      // Surviving / re-created blocks: upsert, and cancel any pending delete.
      for (const id of targetIds) {
        dirty.add(id);
        deletedBuffer.delete(id);
      }
      // Blocks the swap removed: delete server-side, drop any pending upsert.
      for (const id of curIds) {
        if (!targetIds.has(id)) {
          deletedBuffer.add(id);
          dirty.delete(id);
        }
      }
      return { dirty, deletedBuffer };
    });
    scheduleFlush();
  };
  /* ---------- autosave (debounced bulk flush) ---------- */
  const flush = async () => {
    const s = get();
    const dirtyIds = [...s.dirty];
    const deletedIds = [...s.deletedBuffer];
    if (!dirtyIds.length && !deletedIds.length) return;

    // Clear buffers BEFORE the request so new edits during flight aren't lost.
    set({ dirty: new Set(), deletedBuffer: new Set() });
    const payload = dirtyIds.map((id) => s.byId[id]).filter(Boolean);
    try {
      const tasks: Promise<unknown>[] = [];
      if (payload.length) tasks.push(blocksApi.upsertMany(payload));
      if (deletedIds.length) tasks.push(blocksApi.deleteMany(deletedIds));
      await Promise.all(tasks);
    } catch (e) {
      // Re-mark as dirty so the next flush retries.
      set((cur) => ({
        dirty: new Set([...cur.dirty, ...dirtyIds]),
        deletedBuffer: new Set([...cur.deletedBuffer, ...deletedIds]),
      }));
      // eslint-disable-next-line no-console
      console.error('autosave failed, will retry', e);
    }
  };
  const scheduleFlush = debounce(flush, 600);

  const markDirty = (id: ID) =>
    set((s) => {
      const next = new Set(s.dirty);
      next.add(id);
      return { dirty: next };
    });

  return {
    byId: {},
    childrenOf: {},
    rootByPage: {},
    loadedPages: new Set(),
    dirty: new Set(),
    deletedBuffer: new Set(),

    async fetchPage(pageId) {
      const blocks = await blocksApi.listByPage(pageId);
      const wasLoaded = get().loadedPages.has(pageId);
      set((s) => {
        const byId = { ...s.byId };
        const childrenOf = { ...s.childrenOf };
        const rootByPage = { ...s.rootByPage, [pageId]: [] as ID[] };

        // On a REFRESH (page already loaded), preserve in-flight local edits:
        //   - Blocks the user is currently typing into are in `s.dirty`. Their
        //     text/props/type haven't autosaved yet — taking the server copy
        //     would clobber un-saved keystrokes. Keep our local copy.
        //   - Blocks the user has locally deleted but the delete hasn't
        //     reached the server are in `s.deletedBuffer`. Drop them silently
        //     from the merge so they don't reappear.
        //   - Blocks that exist only locally (newly created, autosave still
        //     pending) are in `s.dirty` AND absent from server response. Keep
        //     them and stitch them back into their sibling array.
        const serverIds = new Set(blocks.map((b) => b.id));
        const sorted = [...blocks].sort((a, b) => a.order - b.order);
        // `childrenOf` is a shallow copy, so its arrays are shared with the
        // previous state. Rebuild (rather than push onto) each sibling array the
        // first time we touch it this pass, otherwise a re-fetch appends the same
        // children again and duplicates them (e.g. columns turning 2 → 4).
        const rebuiltKeys = new Set<string>();
        for (const b of sorted) {
          if (s.deletedBuffer.has(b.id)) continue; // pending local delete
          const local = byId[b.id];
          if (wasLoaded && local && s.dirty.has(b.id)) {
            // Preserve user-editable surface; trust server for structural fields.
            byId[b.id] = {
              ...b,
              text: local.text,
              type: local.type,
              props: local.props,
            };
          } else {
            byId[b.id] = b;
          }
          const k = siblingsKey(b);
          if (b.parentId === null) rootByPage[pageId].push(b.id);
          else {
            if (!rebuiltKeys.has(k)) {
              childrenOf[k] = [];
              rebuiltKeys.add(k);
            }
            childrenOf[k].push(b.id);
          }
        }

        if (wasLoaded) {
          // Drop locally-cached blocks for this page that the server no
          // longer knows about (deleted by a peer) — but keep dirty-only-
          // local ones (autosave hasn't sent them yet).
          for (const id of Object.keys(s.byId)) {
            const b = s.byId[id];
            if (b.pageId !== pageId) continue;
            if (serverIds.has(id)) continue;
            if (s.dirty.has(id)) {
              // Locally-created, not yet on server: keep and re-stitch.
              byId[id] = b;
              const k = siblingsKey(b);
              if (b.parentId === null) {
                if (!rootByPage[pageId].includes(id)) rootByPage[pageId].push(id);
              } else if (!(childrenOf[k] ?? []).includes(id)) {
                (childrenOf[k] ??= []).push(id);
              }
            } else {
              delete byId[id];
              delete childrenOf[id];
            }
          }
        }

        const loadedPages = new Set(s.loadedPages);
        loadedPages.add(pageId);
        return { byId, childrenOf, rootByPage, loadedPages };
      });

      // Ensure every page has at least one block to type into.
      if (!blocks.length && !wasLoaded) get().insertFirst(pageId, 'text');
    },

    setText(id, text) {
      const cur = get().byId[id];
      if (!cur || cur.text === text) return;
      pushHistory();
      set((s) => ({ byId: { ...s.byId, [id]: { ...cur, text } } }));
      markDirty(id);
      scheduleFlush();
    },

    setType(id, type) {
      const cur = get().byId[id];
      if (!cur || cur.type === type) return;
      pushHistory();
      set((s) => ({ byId: { ...s.byId, [id]: { ...cur, type } } }));
      markDirty(id);
      scheduleFlush();
    },

    setProp(id, key, value) {
      const cur = get().byId[id];
      if (!cur) return;
      pushHistory();
      const props = { ...cur.props, [key]: value };
      set((s) => ({ byId: { ...s.byId, [id]: { ...cur, props } } }));
      markDirty(id);
      scheduleFlush();
    },

    insertFirst(pageId, type = 'text') {
      pushHistory();
      const id = uid();
      const block: Block = { id, pageId, parentId: null, type, text: '', order: 1, props: {} };
      set((s) => ({
        byId: { ...s.byId, [id]: block },
        rootByPage: { ...s.rootByPage, [pageId]: [id, ...(s.rootByPage[pageId] ?? [])] },
      }));
      markDirty(id);
      scheduleFlush();
      return id;
    },

    insertChild(parentId, type = 'text', props = {}) {
      const parent = get().byId[parentId];
      if (!parent) return parentId;
      pushHistory();
      const id = uid();
      const arr = get().childrenOf[parentId] ?? [];
      const nextArr = [...arr, id];
      const block: Block = {
        id,
        pageId: parent.pageId,
        parentId,
        type,
        text: '',
        order: nextArr.length,
        props: { ...props },
      };
      set((s) => ({
        byId: { ...s.byId, [id]: block },
        childrenOf: { ...s.childrenOf, [parentId]: nextArr },
      }));
      markDirty(id);
      scheduleFlush();
      return id;
    },

    insertAfter(prevId, type = 'text', props = {}) {
      const prev = get().byId[prevId];
      if (!prev) return prevId;
      pushHistory();
      const id = uid();
      const k = siblingsKey(prev);
      const arr = prev.parentId === null ? get().rootByPage[prev.pageId] ?? [] : get().childrenOf[k] ?? [];
      const idx = arr.indexOf(prevId);
      const nextArr = [...arr.slice(0, idx + 1), id, ...arr.slice(idx + 1)];

      const block: Block = {
        id,
        pageId: prev.pageId,
        parentId: prev.parentId,
        type,
        text: '',
        order: 0, // recomputed below
        props: { ...props },
      };

      // Recompute order for siblings (cheap, only the immediate list).
      const reindexed: Block[] = nextArr.map((cid, i) => {
        if (cid === id) return { ...block, order: i + 1 };
        const b = get().byId[cid];
        return { ...b, order: i + 1 };
      });

      set((s) => {
        const byId = { ...s.byId };
        for (const b of reindexed) byId[b.id] = b;
        const childrenOf = { ...s.childrenOf };
        const rootByPage = { ...s.rootByPage };
        if (prev.parentId === null) rootByPage[prev.pageId] = nextArr;
        else childrenOf[k] = nextArr;
        return { byId, childrenOf, rootByPage };
      });

      reindexed.forEach((b) => markDirty(b.id));
      scheduleFlush();
      return id;
    },

    removeBlock(id) {
      const s = get();
      const block = s.byId[id];
      if (!block) return null;
      pushHistory();
      const k = siblingsKey(block);
      const arr = block.parentId === null ? s.rootByPage[block.pageId] ?? [] : s.childrenOf[k] ?? [];
      const idx = arr.indexOf(id);
      // Refuse to remove the very last block on a page (keep editor non-empty).
      if (arr.length === 1 && block.parentId === null) return null;

      const focusOn = arr[idx - 1] ?? arr[idx + 1] ?? null;
      const nextArr = arr.filter((x) => x !== id);

      // Collect descendants for cascade delete.
      const toDelete = new Set<ID>([id]);
      const stack = [id];
      while (stack.length) {
        const cur = stack.pop()!;
        for (const child of s.childrenOf[cur] ?? []) {
          toDelete.add(child);
          stack.push(child);
        }
      }

      const reindexed = nextArr.map((cid, i) => ({ ...s.byId[cid], order: i + 1 }));

      set((cur) => {
        const byId = { ...cur.byId };
        toDelete.forEach((x) => delete byId[x]);
        for (const b of reindexed) byId[b.id] = b;

        const childrenOf = { ...cur.childrenOf };
        toDelete.forEach((x) => delete childrenOf[x]);
        const rootByPage = { ...cur.rootByPage };
        if (block.parentId === null) rootByPage[block.pageId] = nextArr;
        else childrenOf[k] = nextArr;

        const dirty = new Set(cur.dirty);
        toDelete.forEach((x) => dirty.delete(x));
        reindexed.forEach((b) => dirty.add(b.id));

        const deletedBuffer = new Set(cur.deletedBuffer);
        toDelete.forEach((x) => deletedBuffer.add(x));

        return { byId, childrenOf, rootByPage, dirty, deletedBuffer };
      });
      scheduleFlush();
      return focusOn;
    },

    reorder(movingId, newParentId, newIndex, pageId) {
      const s = get();
      const moving = s.byId[movingId];
      if (!moving) return;
      pushHistory();
      const oldParentId = moving.parentId;

      const oldKey = siblingsKey(moving);
      const newKey = newParentId === null ? rootKey(pageId) : newParentId;

      const oldArr =
        oldParentId === null ? s.rootByPage[pageId] ?? [] : s.childrenOf[oldKey] ?? [];
      const newArrCurrent =
        newParentId === null ? s.rootByPage[pageId] ?? [] : s.childrenOf[newKey] ?? [];

      const removed = oldArr.filter((x) => x !== movingId);
      const intoArr = oldKey === newKey ? removed : newArrCurrent;
      const inserted = [...intoArr.slice(0, newIndex), movingId, ...intoArr.slice(newIndex)];

      const updatedMoving: Block = { ...moving, parentId: newParentId };

      const newByPage = { ...s.rootByPage };
      const newChildren = { ...s.childrenOf };
      if (oldKey === newKey) {
        if (newParentId === null) newByPage[pageId] = inserted;
        else newChildren[newKey] = inserted;
      } else {
        if (oldParentId === null) newByPage[pageId] = removed;
        else newChildren[oldKey] = removed;
        if (newParentId === null) newByPage[pageId] = inserted;
        else newChildren[newKey] = inserted;
      }

      const reindexed: Block[] = inserted.map((cid, i) => {
        const b = cid === movingId ? updatedMoving : s.byId[cid];
        return { ...b, order: i + 1, parentId: cid === movingId ? newParentId : b.parentId };
      });
      const byId = { ...s.byId };
      for (const b of reindexed) byId[b.id] = b;

      set({ byId, rootByPage: newByPage, childrenOf: newChildren });
      reindexed.forEach((b) => markDirty(b.id));
      scheduleFlush();
    },

    /* ---------------- Tab / Shift+Tab nesting ---------------- */

    indent(id) {
      const s = get();
      const block = s.byId[id];
      if (!block) return false;
      const k = siblingsKey(block);
      const arr = block.parentId === null ? s.rootByPage[block.pageId] ?? [] : s.childrenOf[k] ?? [];
      const idx = arr.indexOf(id);
      if (idx <= 0) return false; // first sibling can't indent
      const newParentId = arr[idx - 1];
      const newChildren = s.childrenOf[newParentId] ?? [];
      pushHistory();
      get().reorder(id, newParentId, newChildren.length, block.pageId);
      return true;
    },

    outdent(id) {
      const s = get();
      const block = s.byId[id];
      if (!block || block.parentId === null) return false;
      const parent = s.byId[block.parentId];
      if (!parent) return false;
      // Find position of the parent in its own siblings, insert after.
      const grandKey = siblingsKey(parent);
      const grandArr = parent.parentId === null ? s.rootByPage[parent.pageId] ?? [] : s.childrenOf[grandKey] ?? [];
      const parentIdx = grandArr.indexOf(parent.id);
      pushHistory();
      get().reorder(id, parent.parentId, parentIdx + 1, block.pageId);
      return true;
    },

    /* ---------------- Batch + duplicate ---------------- */

    removeMany(ids) {
      if (!ids.length) return null;
      pushHistory();
      historySuspended = true;
      let focus: ID | null = null;
      for (const id of ids) {
        const f = get().removeBlock(id);
        if (f && !focus) focus = f;
      }
      historySuspended = false;
      return focus;
    },

    duplicate(id) {
      const s = get();
      const src = s.byId[id];
      if (!src) return null;
      pushHistory();
      historySuspended = true;
      const tree = get().serializeTree([id]);
      const inserted = get().pasteTree(id, tree);
      historySuspended = false;
      return inserted[0] ?? null;
    },

    /* ---------------- Clipboard / serialize ---------------- */

    serializeTree(ids) {
      const s = get();
      const walk = (id: ID): SerializedTree['nodes'][number] | null => {
        const b = s.byId[id];
        if (!b) return null;
        const children = (s.childrenOf[id] ?? []).map(walk).filter(Boolean) as SerializedTree['nodes'];
        return { id, type: b.type, text: b.text, props: b.props, children };
      };
      const nodes = ids.map(walk).filter(Boolean) as SerializedTree['nodes'];
      return { version: 1, nodes };
    },

    pasteTree(afterId, tree) {
      const anchor = get().byId[afterId];
      if (!anchor) return [];
      pushHistory();
      historySuspended = true;
      const newTopIds: ID[] = [];

      // Recursive paste; preserves structure but mints fresh IDs so ownership/
      // referential integrity is preserved when pasting across pages or twice.
      const pasteNodes = (
        parentId: ID | null,
        siblingAnchorId: ID,
        nodes: SerializedTree['nodes'],
      ): ID[] => {
        let prevId = siblingAnchorId;
        const out: ID[] = [];
        for (const node of nodes) {
          const newId = get().insertAfter(prevId, node.type, node.props);
          // Set text via setText so it's marked dirty and history-snapshotted-once.
          if (node.text) get().setText(newId, node.text);
          // Reparent if needed: insertAfter inserts as sibling. For nested nodes
          // we need to move them under the new parent block.
          if (parentId !== null) {
            const blockNow = get().byId[newId];
            if (blockNow && blockNow.parentId !== parentId) {
              const siblings = get().childrenOf[parentId] ?? [];
              get().reorder(newId, parentId, siblings.length, blockNow.pageId);
            }
          }
          if (node.children.length) pasteNodes(newId, newId, node.children);
          out.push(newId);
          prevId = newId;
        }
        return out;
      };

      const top = pasteNodes(anchor.parentId, afterId, tree.nodes);
      newTopIds.push(...top);
      historySuspended = false;
      return newTopIds;
    },

    /* ---------------- History ---------------- */

    undo() {
      if (!past.length) return false;
      future.push(snapshot());
      const prev = past.pop()!;
      applySnapshot(prev);
      return true;
    },

    redo() {
      if (!future.length) return false;
      past.push(snapshot());
      const next = future.pop()!;
      applySnapshot(next);
      return true;
    },

    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,

    runBatch(fn) {
      // One snapshot of the pre-batch state, then suspend per-mutation history
      // so the whole batch collapses into a single undo entry.
      pushHistoryForce();
      historySuspended = true;
      try {
        fn();
      } finally {
        historySuspended = false;
      }
    },

    async flushNow() {
      scheduleFlush.flush();
    },

    reset() {
      past.length = 0;
      future.length = 0;
      lastSnapAt = 0;
      set({
        byId: {},
        childrenOf: {},
        rootByPage: {},
        loadedPages: new Set(),
        dirty: new Set(),
        deletedBuffer: new Set(),
      });
    },
  };
});

/* -------------------- Selectors (granular subscriptions) -------------------- */

export const selectBlock = (id: ID) => (s: BlocksState) => s.byId[id];
export const selectRootBlockIds = (pageId: ID) => (s: BlocksState) => s.rootByPage[pageId] ?? [];
export const selectChildBlockIds = (parentId: ID) => (s: BlocksState) => s.childrenOf[parentId] ?? [];
export const selectIsPageLoaded = (pageId: ID) => (s: BlocksState) => s.loadedPages.has(pageId);

/**
 * Depth-first list of every visible block id on a page, in render order.
 * Collapsed toggles hide their children (matching what's on screen), so a
 * shift-click range only spans blocks the user can actually see. Used to
 * resolve range selection between two block ids.
 */
export function getFlatBlockOrder(pageId: ID): ID[] {
  const s = useBlocksStore.getState();
  const out: ID[] = [];
  const walk = (ids: ID[]): void => {
    for (const id of ids) {
      out.push(id);
      const b = s.byId[id];
      const collapsed = b?.type === 'toggle' && b.props.open === false;
      const kids = s.childrenOf[id];
      if (!collapsed && kids?.length) walk(kids);
    }
  };
  walk(s.rootByPage[pageId] ?? []);
  return out;
}
