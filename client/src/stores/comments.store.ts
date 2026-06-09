import { create } from 'zustand';
import { commentsApi, type Comment, type ReactionEmoji } from '@/services/comments.api';
import type { ID } from '@/types/domain';

/**
 * Comments store — keyed by page id.
 *
 * The editor refetches a page's comments on open and whenever the realtime
 * `rev.comments` beacon fires (a peer created / edited / resolved one). We
 * keep the full flat list per page; threads (root + replies) and per-block
 * grouping are derived in selectors so the store stays a simple cache.
 *
 * Writes are awaited (not optimistic): comments are low-frequency and the
 * server assigns the id + author hydration, so a brief round-trip is fine and
 * keeps the store honest. We refetch the page list after each mutation.
 */
interface CommentsState {
  byPage: Record<ID, Comment[]>;
  loadedPages: Record<ID, boolean>;
  loading: Record<ID, boolean>;
  fetchPage: (pageId: ID) => Promise<void>;
  add: (
    pageId: ID,
    input: { blockId: ID | null; parentId: ID | null; body: string; mentions?: ID[]; quote?: string | null },
  ) => Promise<void>;
  /** Like `add`, but resolves with the created comment (needed to anchor a
   *  selection comment by stamping its id onto the text mark). */
  addThread: (
    pageId: ID,
    input: { blockId: ID | null; parentId: ID | null; body: string; mentions?: ID[]; quote?: string | null },
  ) => Promise<Comment>;
  edit: (pageId: ID, id: ID, body: string) => Promise<void>;
  remove: (pageId: ID, id: ID) => Promise<void>;
  setResolved: (pageId: ID, id: ID, resolved: boolean) => Promise<void>;
  react: (pageId: ID, id: ID, emoji: ReactionEmoji) => Promise<void>;
}

export const useCommentsStore = create<CommentsState>((set, get) => ({
  byPage: {},
  loadedPages: {},
  loading: {},

  async fetchPage(pageId) {
    set((s) => ({ loading: { ...s.loading, [pageId]: true } }));
    try {
      const list = await commentsApi.list(pageId);
      set((s) => ({
        byPage: { ...s.byPage, [pageId]: list },
        loadedPages: { ...s.loadedPages, [pageId]: true },
        loading: { ...s.loading, [pageId]: false },
      }));
    } catch {
      set((s) => ({ loading: { ...s.loading, [pageId]: false } }));
    }
  },

  async add(pageId, input) {
    await commentsApi.create(pageId, input);
    await get().fetchPage(pageId);
  },

  async addThread(pageId, input) {
    const created = await commentsApi.create(pageId, input);
    await get().fetchPage(pageId);
    return created;
  },

  async edit(pageId, id, body) {
    await commentsApi.update(id, body);
    await get().fetchPage(pageId);
  },

  async remove(pageId, id) {
    await commentsApi.remove(id);
    await get().fetchPage(pageId);
  },

  async setResolved(pageId, id, resolved) {
    if (resolved) await commentsApi.resolve(id);
    else await commentsApi.reopen(id);
    await get().fetchPage(pageId);
  },

  async react(pageId, id, emoji) {
    // Optimistically toggle the viewer's reaction so the chip responds
    // instantly; reconcile with the server's authoritative tally on return.
    const patch = (next: Comment | ((c: Comment) => Comment)): void =>
      set((s) => {
        const list = s.byPage[pageId];
        if (!list) return {};
        return {
          byPage: {
            ...s.byPage,
            [pageId]: list.map((c) =>
              c.id === id ? (typeof next === 'function' ? next(c) : next) : c,
            ),
          },
        };
      });

    patch((c) => toggleReactionLocally(c, emoji));
    try {
      const updated = await commentsApi.react(id, emoji);
      patch(updated);
    } catch {
      await get().fetchPage(pageId);
    }
  },
}));

/** Pure optimistic toggle of the viewer's reaction for a single comment. */
function toggleReactionLocally(c: Comment, emoji: string): Comment {
  const reactions = c.reactions ? [...c.reactions] : [];
  const idx = reactions.findIndex((r) => r.emoji === emoji);
  if (idx === -1) {
    reactions.push({ emoji, count: 1, mine: true });
  } else {
    const r = reactions[idx];
    const next = { ...r, mine: !r.mine, count: r.count + (r.mine ? -1 : 1) };
    if (next.count <= 0) reactions.splice(idx, 1);
    else reactions[idx] = next;
  }
  return { ...c, reactions };
}

/* ---------- Selectors ---------- */

export interface CommentThread {
  root: Comment;
  replies: Comment[];
}

/** Group a page's comments into threads (root + replies), oldest-first. */
export function selectThreads(pageId: ID) {
  return (s: CommentsState): CommentThread[] => {
    const list = s.byPage[pageId] ?? [];
    const roots = list.filter((c) => c.parentId === null);
    const repliesByRoot = new Map<ID, Comment[]>();
    for (const c of list) {
      if (c.parentId) {
        const arr = repliesByRoot.get(c.parentId) ?? [];
        arr.push(c);
        repliesByRoot.set(c.parentId, arr);
      }
    }
    return roots.map((root) => ({ root, replies: repliesByRoot.get(root.id) ?? [] }));
  };
}

/** Count of UNRESOLVED root threads anchored to a given block. */
export function selectBlockOpenCount(pageId: ID, blockId: ID) {
  return (s: CommentsState): number => {
    const list = s.byPage[pageId] ?? [];
    let n = 0;
    for (const c of list) {
      if (c.parentId === null && c.blockId === blockId && !c.resolved && !c.deleted) n += 1;
    }
    return n;
  };
}

/** Total unresolved root threads on the page (for the header badge). */
export function selectPageOpenCount(pageId: ID) {
  return (s: CommentsState): number => {
    const list = s.byPage[pageId] ?? [];
    let n = 0;
    for (const c of list) {
      if (c.parentId === null && !c.resolved && !c.deleted) n += 1;
    }
    return n;
  };
}

/* ---------- Drawer UI state ---------- */

/**
 * Drawer open/anchor state, kept separate from the data cache so a block
 * bubble buried in the tree can open the drawer (optionally anchored to its
 * block) without prop-drilling through the editor.
 */
interface CommentsUiState {
  open: boolean;
  composeBlockId: ID | null;
  /** A comment id to scroll to / highlight once the drawer renders. */
  focusCommentId: ID | null;
  /** Pending text-selection comment: the block + quoted text + PM range the
   *  composer should anchor a new thread to. Set by the floating toolbar's
   *  “Comment” button; consumed (and cleared) once the thread is created. */
  pendingSelection: { blockId: ID; quote: string; from: number; to: number } | null;
  openAll: () => void;
  openForBlock: (blockId: ID) => void;
  /** Open the drawer to compose a comment on the current text selection. */
  openForSelection: (blockId: ID, quote: string, from: number, to: number) => void;
  /** Open the drawer and request focus on a specific comment thread. */
  focusComment: (commentId: ID) => void;
  clearFocus: () => void;
  clearPendingSelection: () => void;
  close: () => void;
}

export const useCommentsUiStore = create<CommentsUiState>((set) => ({
  open: false,
  composeBlockId: null,
  focusCommentId: null,
  pendingSelection: null,
  openAll: () => set({ open: true, composeBlockId: null, pendingSelection: null }),
  openForBlock: (blockId) => set({ open: true, composeBlockId: blockId, pendingSelection: null }),
  openForSelection: (blockId, quote, from, to) =>
    set({ open: true, composeBlockId: blockId, pendingSelection: { blockId, quote, from, to } }),
  focusComment: (commentId) =>
    set({ open: true, composeBlockId: null, focusCommentId: commentId, pendingSelection: null }),
  clearFocus: () => set({ focusCommentId: null }),
  clearPendingSelection: () => set({ pendingSelection: null }),
  close: () =>
    set({ open: false, composeBlockId: null, focusCommentId: null, pendingSelection: null }),
}));

