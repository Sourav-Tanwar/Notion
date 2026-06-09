# Notion-like Editor (MERN + Zustand + dnd-kit)

A production-grade block editor demonstrating recursive rendering, normalized state, optimistic updates, debounced autosave, dnd-kit drag-drop, and JWT auth.

## Stack

- **Frontend:** React 18, TypeScript, Vite, Zustand (with `useShallow`), Tailwind, dnd-kit, React Router 6, React Testing Library + Jest
- **Backend:** Node + Express, MongoDB + Mongoose, Zod validation, JWT auth

## Run locally

### Prereqs
- Node 20+
- MongoDB running locally (`mongodb://localhost:27017`) or a hosted URI

### Install
```bash
npm install
npm --workspace server install
npm --workspace client install
```

### Configure
```bash
cp server/.env.example server/.env
# Edit JWT_SECRET to something long & random
```

### Develop
```bash
npm run dev            # runs server (4000) + client (5173) in parallel
```

Visit http://localhost:5173

### Test
```bash
npm test               # client unit tests
```

### Build
```bash
npm run build
```

## Architecture decisions

### Why Zustand over Redux/RTK?
- Hook-first API, no providers, fewer files per feature
- Built-in `useShallow` + selectors give us fine-grained subscriptions equivalent to `reselect` without setup
- ~1 kB runtime — perfect for client-heavy apps
- We still get middleware patterns (persist, immer) when needed

We use **slice-per-domain** (`auth.store`, `pages.store`, `blocks.store`) rather than a single root store — each is independently testable and lazy-importable.

### State normalization
The editor stores blocks as:
```ts
byId: Record<ID, Block>
childrenOf: Record<parentId, ID[]>
rootByPage: Record<pageId, ID[]>
```

Why not a recursive tree?
- Editing one leaf in a tree forces new object refs up to the root → React.memo on every ancestor + sibling is busted
- With normalization, only the touched `byId[id]` entry changes — every other `BlockNode` skips re-render thanks to `memo` + `useShallow`

### Recursive rendering
`BlockNode` renders its own `BlockContent` plus a nested `BlockList` of children, which renders more `BlockNode`s. The recursion is bounded by `childrenOf[id]` being empty.

Per-block subscriptions:
```ts
const block    = useBlocksStore(selectBlock(id));               // re-runs only when this id's slice changes
const childIds = useBlocksStore(useShallow(selectChildBlockIds(id))); // re-renders only when child list changes
```

### Optimistic updates + rollback
Every mutation (`setText`, `insertAfter`, `removeBlock`, `reorder`, page create/move/delete) immediately updates Zustand state. The network request runs in parallel.

- **Creates**: client generates UUID, server accepts it (idempotent upsert) → no ID reconciliation needed for blocks.
- **Failures**: stores keep snapshots; on error, either restore the snapshot (pages) or re-add to the `dirty` buffer and retry on next flush (blocks).

### Debounced autosave
- `blocks.store` keeps `dirty: Set<ID>` and `deletedBuffer: Set<ID>`.
- Every mutation marks affected ids dirty and calls `scheduleFlush()` (600ms debounce).
- The flusher batches `POST /blocks/bulk` + `POST /blocks/delete` in parallel.
- `Cmd/Ctrl+S` calls `flushNow()` to flush immediately.

### Performance levers
| Lever | Where | Why |
|---|---|---|
| Normalized state | `blocks.store.ts` | Avoids cascading re-renders in deep trees |
| `React.memo` on `BlockNode`, `BlockList`, `BlockContent` | Editor | Prevents sibling re-renders |
| `useShallow` for array selectors | `BlockNode`, `Sidebar` | Stops new array refs from triggering re-render |
| `lazy()` for `Editor` + `AuthPage` | `App.tsx` | Splits the editor bundle off the login critical path |
| Debounced autosave | `blocks.store.ts` | Coalesces keystrokes into one network call |
| `dangerouslySetInnerHTML` for initial contentEditable text | `BlockContent` | React never re-renders into the editable surface → no caret loss |
| Activation distance on sensors | dnd-kit configs | Prevents accidental drags on click |
| Cascade delete client-side | `blocks.store`, `pages.store` | Avoids extra round-trips |

### Keyboard shortcuts
- `Enter` → new block after current
- `Backspace` (empty block) → delete + focus previous
- `/` → slash menu (filter by typed text, ↑/↓/Enter/Esc)
- `Cmd/Ctrl + S` → flush autosave

### dnd-kit
- `DndContext` wraps each `Editor` and `Sidebar`
- Each list is a `SortableContext` with `verticalListSortingStrategy`
- Each draggable item uses `useSortable` and exposes `attributes/listeners` on a drag handle (rather than the whole row, so users can still select text)
- On `onDragEnd` we compute `newParentId + newIndex` and call the store reorder action, which updates both Zustand + sends a `PATCH /reorder` to the backend

### Backend layering
```
modules/<domain>/
  <domain>.model.ts      ← Mongoose schemas
  <domain>.schema.ts     ← Zod request validators
  <domain>.service.ts    ← Pure business logic, no Express types
  <domain>.routes.ts     ← Express wiring
```
- `validate` middleware uses Zod and rewrites `req.body` to the parsed/sanitized shape.
- `asyncHandler` forwards rejections to the central error middleware.
- `HttpError` gives structured 4xx responses.

### REST endpoints
| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/signup` | Create account |
| POST | `/api/auth/login` | Get JWT |
| GET  | `/api/auth/me` | Current user |
| GET  | `/api/pages` | List all pages for user |
| POST | `/api/pages` | Create page |
| PATCH| `/api/pages/:id` | Update title/icon/parent |
| PATCH| `/api/pages/reorder` | Bulk move/reorder |
| DELETE| `/api/pages/:id` | Cascade delete |
| GET  | `/api/blocks/page/:pageId` | List blocks for page |
| POST | `/api/blocks/bulk` | Upsert blocks (autosave) |
| POST | `/api/blocks/delete` | Bulk delete |
| PATCH| `/api/blocks/reorder` | Bulk reorder |

## Deployment

### Backend (Render / Railway / Fly)
1. Set env vars: `MONGO_URI`, `JWT_SECRET`, `CLIENT_ORIGIN`
2. Build: `npm --workspace server run build`
3. Start: `node server/dist/index.js`

### Frontend (Vercel / Netlify / Cloudflare Pages)
1. Set `VITE_API_BASE` if hosting backend on a different origin (then update `services/http.ts` to use it instead of `/api`)
2. Build cmd: `npm --workspace client run build`
3. Publish dir: `client/dist`

### MongoDB
Use MongoDB Atlas free tier; whitelist your backend IP or set `0.0.0.0/0` for first deploy.

## Folder structure

```
client/src/
├── app/            # App shell + routing
├── features/
│   ├── auth/       # Login/signup
│   ├── editor/     # Editor, BlockNode (recursive), BlockList, SlashMenu, BlockContent
│   └── sidebar/    # Sidebar + PageTreeNode (recursive)
├── components/     # Reusable UI primitives
├── hooks/          # useHotkey, useFocusBlock
├── stores/         # Zustand: auth.store, pages.store, blocks.store
├── services/       # http, auth.api, pages.api, blocks.api
├── lib/            # debounce, uid, cn
├── types/          # Shared domain types
└── tests/          # Jest setup, mocks

server/src/
├── config/         # env, db
├── middleware/     # auth, error, validate, notFound
├── modules/
│   ├── auth/
│   ├── pages/
│   └── blocks/
└── utils/          # HttpError, asyncHandler
```

## Extending

- **Real-time multi-user:** swap REST for WebSocket + Yjs/CRDT; the normalized state shape is already CRDT-friendly.
- **Rich inline formatting:** replace `BlockContent` with a Slate/TipTap instance; keep blocks as the unit of recursion + dnd.
- **Virtualization for huge pages:** wrap the top-level `BlockList` in `react-window` when `ids.length > 200`. Children nested inside a virtualized parent are an open trade-off (Notion solves this by virtualizing only at the page level).
- **Server-side rendering:** the architecture is SSR-safe — only `localStorage` access is gated in `tokenStorage`.
