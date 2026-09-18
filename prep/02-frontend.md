# 02 — Frontend Mastery

Stack: **React 18.3 + TypeScript 5.5 + Vite 5 + Zustand 4.5 + react-router-dom 6 +
ProseMirror + Yjs + dnd-kit + Tailwind**. Tests: Jest + ts-jest + React Testing Library.

---

## 1. React architecture [Confirmed]

- **Feature-first** folders under `features/` (editor, auth, sidebar, workspace, trash,
  notifications, quickswitcher, landing, public).
- **`app/App.tsx`** owns routing, **route-level lazy loading** (`lazy()` + `Suspense`), and
  auth gating: a `PrivateShell` renders sidebar + nav only when `authStatus === 'authed'`;
  public routes render when `'guest'`.
- **Global keybindings** in `App.tsx`: `Mod+K` toggles the QuickSwitcher.

## 2. Component hierarchy (editor core) [Confirmed]

```
Editor (per page)
├── CollabProvider           # opens Y.Doc + Hocuspocus for this pageId
│   ├── PresenceBar          # peer avatars from Awareness
│   ├── StatusPill           # connection state
│   └── OfflineBanner
├── CoverImage / Breadcrumbs / PageActionsMenu   # page header
├── BlockList                # renders sibling block ids
│   └── BlockNode (recursive)
│       ├── type-specific Render (from block registry)
│       │   └── RichTextSurface  # ProseMirror EditorView bound to Y.XmlFragment
│       ├── SlashMenu / MentionMenu (conditionally)
│       └── BlockList (children, recursion)
├── FloatingToolbar          # inline formatting on selection
└── CommentsDrawer           # threaded comments
```

## 3. State, props, hooks [Confirmed]

- **Global state:** Zustand stores (see `07-state-management.md`). Components subscribe with
  **memoized selectors** (`selectBlock(id)`, `selectChildBlockIds(id)`) and `useShallow` for
  arrays/sets to avoid re-render storms.
- **Local state:** `useState` for menu open/close, query strings, hover.
- **Custom hooks:**
  - `useFocusBlock` — imperatively focuses a block after mutations (Enter/Backspace); works with
    ProseMirror's view or a DOM Range fallback.
  - `useHotkey` — declarative global shortcuts (`mod+k`), respects `defaultPrevented` so PM
    handlers win.
  - `useUploader` — XHR-based upload with real progress, size/type validation, typed result.

## 4. Controlled vs uncontrolled [Confirmed]

- **Auth forms** use `react-hook-form` + Zod resolvers → controlled, validated inputs.
- **Editor content is uncontrolled by React on purpose:** the source of truth for inline text is
  the ProseMirror/Yjs document, not React state. React only re-renders on **structural** changes
  (block added/removed/reordered/type-changed). This avoids re-rendering on every keystroke — a
  key performance decision.

## 5. Rendering behavior & performance [Confirmed]

- `React.memo` on `BlockNode`, `BlockList`, `BlockContent`, `SlashMenu`, and block renderers.
- `useMemo` for derived values (numbered-list indices in `BlockList`, filtered slash/mention
  results).
- `useCallback` for stable event handlers passed to memoized children.
- **Normalized store** means editing one block updates only that block's slice — siblings/ancestors
  don't re-render.
- **Selective subscriptions**: components read the smallest slice they need.
- Debounced work: **600ms** autosave (blocks store), **400ms** PM→HTML serialization
  (`RichTextSurface`).

> `react-window` is a dependency and `BlockList` has a comment noting virtualization for 1k+ flat
> blocks, but virtualization is **not currently wired** — say this honestly. **[Potential issue]**

## 6. Code splitting / bundling [Confirmed]

- Vite build (`tsc -b && vite build`). Route-level `lazy()`/`Suspense` splits the Editor and each
  auth/settings page into separate chunks → smaller initial load.
- No manual `manualChunks` config; relies on Rollup defaults + route splitting. **[Inferred:
  improvement]** heavy libs (ProseMirror, Yjs, prismjs) could be grouped into a vendor chunk.

## 7. Routing [Confirmed]

- `react-router-dom` v6. Private routes behind an auth shell; public routes for login/signup/
  reset/verify/OAuth callback/invitation accept/public share. Deep-linking to `/p/:pageId`
  mounts the Editor + collab for that page.

## 8. Forms, API integration, loading/error states [Confirmed]

- Forms: `react-hook-form` + Zod. API via `services/*.ts`.
- `http.ts` centralizes: base origin (`VITE_API_ORIGIN`), `Authorization: Bearer` header,
  `x-workspace-id` header, and **transparent 401 refresh** (one coalesced `/refresh`, retry once).
- Loading/error state lives in the relevant store (e.g. `pages.store.loading/error`,
  `auth.store.status/error`).

## 9. Optimistic updates [Confirmed]

- **Blocks:** mutate the normalized store immediately; autosave flushes later; on failure
  re-mark dirty and retry.
- **Database cells/rows:** optimistic (cheap); schema changes trust the server (rare/order-sensitive).
- **Sessions:** revoke removes locally, restores on failure.

## 10. Accessibility & responsive design [Confirmed / Inferred]

- Tailwind utility classes; theme system (light/dark/system) persisted.
- **[Potential issue]** contentEditable + custom menus need careful ARIA/keyboard support; verify
  focus management and roles before claiming full a11y. Keyboard nav exists for slash/mention menus.

---

## 11. Components an interviewer is likely to ask you to explain

Use this template for each: **Purpose → Inputs → State → Side effects → API calls → Rendering →
Performance.**

### `BlockNode.tsx` (the recursive heart)
- **Purpose:** render one block + its children; own keyboard interactions.
- **Inputs:** block `id`, `pageId`.
- **State:** slash/mention menu open state; reads block via selector.
- **Side effects:** focus management via `useFocusBlock`; opens menus on `/`/`@`.
- **API:** none directly — mutations go through the store, which schedules autosave.
- **Rendering:** delegates content to the registry `Render`; recurses into `BlockList` for children.
- **Performance:** `React.memo`; only re-renders when its own block/children ids change.
- **Key handlers:** Enter (split), Backspace (merge/delete), Tab/Shift-Tab (indent/outdent).

### `RichTextSurface.tsx` (ProseMirror ⇄ Yjs bridge)
- **Purpose:** mount a PM `EditorView` per block bound to the block's `Y.XmlFragment`.
- **Plugins:** `ySyncPlugin`, `yUndoPlugin`, markdown input rules, keymap, autocomplete ghost text.
- **Side effects:** on PM state change, debounced (400ms) `docToHtml()` → Zustand (`Block.text`).
- **Why it matters:** it's where the "two sources of truth" bridge lives; expect deep follow-ups.

### `blocks.store.ts` (normalized state + history + autosave)
- Explain `byId`/`childrenOf`/`rootByPage`, O(1) lookups, 600ms debounced flush, snapshot-based
  undo/redo with 600ms coalescing and a 50-entry cap, and dirty/deleted buffers.

### `http.ts` (auth transport)
- Explain in-memory access token, 401→refresh→retry, coalesced refresh, `x-workspace-id`, upload
  via XHR for progress.

### `realtime.ts` (collab lifecycle)
- Explain per-page cache (ref-counted), IndexedDB-before-connect, token function re-eval on
  reconnect, StrictMode-safe deferred teardown.

---

## 12. Frontend trade-offs to be ready to defend

- **Zustand over Redux:** less boilerplate, no reducers/actions ceremony, direct store access from
  non-React code (e.g. PM plugins via `aiSettings.isAutocompleteOn()`), easy custom middleware
  (snapshot history). Trade-off: fewer built-in devtools/conventions than Redux Toolkit.
- **Per-block PM instead of one big editor:** keeps CRDT fragments small, matches Notion's model
  (marks don't cross blocks), and lets the block tree stay in React. Trade-off: cross-block
  selection/formatting is harder.
- **Uncontrolled editor:** performance win; trade-off is you fight React's mental model and must
  manage focus imperatively.
