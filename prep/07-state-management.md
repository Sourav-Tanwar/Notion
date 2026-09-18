# 07 — State Management

**Library: Zustand** (11 stores). No Redux, no persist/immer middleware — a **custom
snapshot-based history middleware** instead. Realtime text state lives in **Yjs**, not Zustand.

---

## 1. State inventory

| State | Store / location | Why there | Consumed by | Update mechanism |
|---|---|---|---|---|
| Blocks (normalized tree) | `blocks.store.ts` (`byId`,`childrenOf`,`rootByPage`) | O(1) lookups, minimal re-renders | BlockNode/BlockList | mutations + 600ms debounced autosave |
| Dirty / deleted buffers | `blocks.store.ts` (`dirty`,`deletedBuffer`) | batch autosave | autosave flush | set add/remove |
| Undo/redo stacks | `blocks.store.ts` + `middleware/history.ts` | time travel | toolbar/keys | snapshots, 600ms coalesce, cap 50 |
| Page tree | `pages.store.ts` (`byId`,`rootIds`,`childrenOf`,`trash*`) | sidebar nav | Sidebar, Breadcrumbs | REST fetch + mutations |
| Auth/session | `auth.store.ts` (`user`,`status`) | identity gating | App shell, forms | login/hydrate/refresh |
| Active workspace | `workspace.store.ts` + `activeWorkspace.ts` singleton | tenant scoping | http.ts header, sidebar | setActive resets scoped stores |
| Multi-block selection | `selection.store.ts` (`anchorId`,`selected`) | isolate from tree so siblings don't re-render | drag/format | set ops |
| Comments cache | `comments.store.ts` (`byPage`) | thread rendering | CommentsDrawer | fetch + beacon refetch |
| Notifications | `notifications.store.ts` (`items`,`unread`) | bell badge | nav | 30s polling + focus |
| Databases | `database.store.ts` (`byId`) | inline tables | DatabaseBlock | optimistic cells/rows |
| AI settings | `ai.store.ts` (`enabled`,`autocomplete`) | feature toggle | editor/toolbar | server status + localStorage |
| Recent pages | `recent.store.ts` (`ids` max 8) | quick access | switcher/sidebar | localStorage-persisted |
| Sessions/devices | `sessions.store.ts` | security page | SessionsPage | optimistic revoke |
| Inline text (live) | **Yjs** `Y.Doc` per page | CRDT merge/offline | ProseMirror | y-prosemirror |
| Access token | `http.ts` module memory | XSS safety | fetch layer | refresh rotation |

## 2. Local vs global vs server vs derived state [Confirmed]

- **Local (React `useState`):** menu open/close, query text, hover, transient UI.
- **Global (Zustand):** blocks, pages, auth, workspace, selection, comments, notifications, db, ai.
- **Server state:** fetched via `services/*.ts` and cached in stores (no react-query — hand-rolled
  fetch+cache in each store).
- **Derived state:** selectors compute on the fly — e.g. `selectThreads()` groups comments by
  parent; numbered-list indices are `useMemo`'d in `BlockList`. Not stored, avoids sync bugs.
- **CRDT state:** inline text is intentionally **outside** Zustand (Yjs owns it) — Zustand holds
  the **HTML projection** (`Block.text`) for REST/search/render, updated on a 400ms debounce.

## 3. Normalized state (the important one) [Confirmed]

`blocks.store` keeps three maps instead of a nested tree:
- `byId: Record<id, Block>` — **O(1)** read/update of any block.
- `childrenOf: Record<parentId, id[]>` — ordering of siblings.
- `rootByPage: Record<pageId, id[]>` — top-level blocks.

**Why:** editing a leaf updates only `byId[leaf]`; ancestors don't re-render. A nested tree would
force re-rendering whole branches. This is exactly the resume's "**normalised Zustand state, O(1)
block lookups**" claim — **verifiable**.

## 4. Caching & synchronization [Confirmed]

- **Fetch-then-merge:** `fetchPage` merges server blocks with in-flight **dirty** edits so a refetch
  (triggered by the `rev` beacon) never clobbers unsaved local changes.
- **Cross-tab:** `authChannel` (BroadcastChannel, localStorage fallback) broadcasts LOGIN/LOGOUT/
  USER_UPDATED **signals only** (never the token) — each tab re-derives its own session via
  `/refresh` + httpOnly cookie.
- **Workspace switch:** `setActive` **resets** pages/blocks/selection stores before refetching, so
  no cross-tenant leakage in the UI.

## 5. Custom history middleware [Confirmed]

`stores/middleware/history.ts`: generic snapshot time-travel — configurable `track` keys,
`limit` (50), `mergeWindow` (600ms). Only snapshots tracked keys; coalesces rapid edits (typing)
into one undo step. `applySnapshot` reconciles deletions: blocks present in an undo snapshot but
absent from current state are routed to `deletedBuffer` so persistence stays correct.

## 6. Why Zustand (defend the choice) [Confirmed]

- **Less boilerplate** than Redux (no action types/reducers/dispatch).
- **Usable outside React** — PM plugins call `aiSettings.isAutocompleteOn()` synchronously; the
  HTTP layer reads `getActiveWorkspaceId()`.
- **Selective subscriptions + `useShallow`** give fine-grained re-renders without `reselect`.
- **Custom middleware** (snapshot history) was trivial to add.
- **Trade-off vs Redux Toolkit:** fewer conventions/devtools, less structure for large teams — an
  acceptable trade for a solo project prioritizing performance and ergonomics.

**Alternatives & when I'd switch:**
- **Redux Toolkit** — if a larger team needed strict conventions, middleware ecosystem, time-travel
  devtools.
- **React Query / TanStack Query** — I'd adopt it for the **server-state** half (caching,
  revalidation, retries) and keep Zustand for pure client/editor state. Honest improvement.
- **Jotai/Recoil** — atom model; not needed given the normalized store works well.

## 7. Likely questions
1. Why normalized maps over a nested tree? *(O(1), targeted re-renders.)*
2. How do you avoid clobbering unsaved edits on a refetch? *(dirty-merge.)*
3. Where does live text live and why not Zustand? *(Yjs CRDT; Zustand holds the HTML projection.)*
4. How is undo scoped and coalesced? *(snapshot middleware, 600ms window, cap 50; PM has its own
   origin-aware undo for inline text.)*
5. How do multiple tabs stay in sync without sharing the token? *(BroadcastChannel signals +
   per-tab refresh.)*
6. Zustand vs Redux — defend it. *(above.)*
