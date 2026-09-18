# 00 — Project Overview

> Legend used throughout `prep/`:
> **[Confirmed]** verified in the code · **[Inferred]** reasonable deduction ·
> **[Potential issue]** a real weakness · **[Improvement]** how I'd fix/extend it.

---

## 1. Project purpose

**What it is:** A Notion-style real-time collaborative workspace. Users create nested
pages built from **blocks** (text, headings, to-dos, lists, code, callouts, images, files,
bookmarks, toggles, inline databases, etc.), organize them in a hierarchical sidebar, and
edit them **live with other people** in the same document.

**Problem it solves:** Traditional documents are siloed and file-based. This app gives a
single, structured, always-synced knowledge base where multiple people can edit the same
page simultaneously without stepping on each other, works **offline**, and enforces
**granular access control** (workspace roles + per-page permissions + public share links).

**Who the users are:**
- Individuals capturing notes/docs in a personal workspace (auto-provisioned on first login).
- Teams collaborating in shared "team" workspaces with roles (owner/admin/member/guest).
- External viewers accessing read-only content through public share links (optionally
  password-protected).

**Major use cases [Confirmed]:**
- Create/organize/duplicate/trash/restore nested pages; save pages as reusable templates.
- Rich block editing with slash menu, markdown shortcuts, drag-and-drop reordering, `@`-mentions.
- Real-time co-editing with live presence (remote carets/avatars) and offline-first persistence.
- Comment threads anchored to blocks, with replies, reactions, resolve/reopen, and @-mention
  notifications.
- Inline databases (columns + rows, typed cells: text/number/select/checkbox/date/url/email/phone).
- Full-text search within a workspace, quick switcher (Cmd+K), backlinks, page history/versioning.
- AI assist (Groq): "Ask AI" text transforms + ghost-text autocomplete (auto-disabled without a key).
- Auth: email/password (with verification), Google OAuth, sessions/devices management, captcha.

**What makes it technically interesting:**
- **CRDT collaboration** (Yjs + Hocuspocus) fused with a **relational-ish document model**
  (MongoDB blocks) — two sources of truth reconciled deliberately.
- **Per-block ProseMirror editors** bound to per-block Yjs `XmlFragment`s (marks can't span blocks
  by design — matches Notion).
- **Hierarchical permission inheritance** resolved by walking the page ancestor chain, cached per
  request.
- **Family-based refresh-token rotation** with stolen-token reuse detection.
- **Two-process backend** (REST API + realtime) that scale independently.

**Parts that demonstrate senior-level engineering:**
- Normalized client state (`byId` / `childrenOf` / `rootByPage`) for O(1) block lookups.
- Offline-first editing via `y-indexeddb` hydrating the doc *before* the socket connects.
- Deliberate split of "structural" data (REST/Mongo) vs "inline text" (CRDT), with an internal
  beacon channel to keep them consistent.
- Security posture: httpOnly refresh cookie, in-memory access token, SHA-256 token hashing,
  SSRF-guarded link previews, snapshot size limits to prevent OOM.

---

## 2. Complete feature inventory

| Feature | Where implemented | Technologies | How it works |
|---|---|---|---|
| Block editor (recursive tree) | `client/src/features/editor/` (`BlockNode`, `BlockList`) | React, Zustand | Recursive render; normalized store; each block delegates to a type `Render` component |
| Rich text per block | `editor/collab/RichTextSurface.tsx`, `pmSchema.ts` | ProseMirror, y-prosemirror | One PM `EditorView` per block bound to a Yjs `XmlFragment` |
| Real-time collab | `client/src/services/realtime.ts`, `server/src/realtime/` | Yjs, Hocuspocus, WebSocket | Each page = 1 Y.Doc (`documentName = pageId`); CRDT merge |
| Offline-first | `realtime.ts` (`IndexeddbPersistence`) | y-indexeddb | Doc hydrated from IndexedDB before provider connects |
| Presence / carets | `editor/collab/PresenceBar.tsx`, `RemoteCarets.tsx`, `useLocalAwareness` | Yjs Awareness | Broadcast selection/user; render peers |
| Autosave | `stores/blocks.store.ts` (`debounce(flush, 600)`) | Zustand, debounce | Dirty set flushed to `POST /api/blocks/bulk` after 600ms |
| Undo/redo | `stores/blocks.store.ts` + `stores/middleware/history.ts` | custom snapshots | Past/future stacks, 600ms coalesce, cap 50 |
| Slash menu | `editor/SlashMenu.tsx`, `BlockNode.tsx` | React | Detects `/`, filters block specs, keyboard nav |
| Markdown shortcuts | `editor/markdown.ts` | regex registry | `# `, `- `, `1. `, `[] ` etc. transform block type |
| @-mentions | `editor/mentions.ts`, `mentionNodeView.ts` | ProseMirror NodeView | Atomic `pageMention` node; live title resolution |
| Drag-and-drop | `editor/` + `@dnd-kit` | dnd-kit | Sortable blocks; `reorder(...)` mutation |
| Inline databases | `features/editor/blocks/DatabaseBlock`, `stores/database.store.ts`, `server/modules/database` | React, Mongo | Schema (columns) + sibling `DatabaseRow` collection |
| Comments | `editor/CommentsDrawer`, `stores/comments.store.ts`, `server/modules/comments` | React, Mongo | Block-anchored threads, replies, reactions, resolve |
| Notifications | `features/notifications`, `stores/notifications.store.ts` | polling (30s) | Emitted on comment mentions/replies |
| Search | `features/quickswitcher`, `server/modules/search` | Mongo query | Workspace-scoped, access-filtered |
| Quick switcher (Cmd+K) | `features/quickswitcher/QuickSwitcher.tsx` | React | Fuzzy page search |
| Page history / restore | `editor/HistoryPanel.tsx`, `server/realtime/` (`DocHistory`) | Yjs snapshots | Archived Y.Doc snapshots, restore endpoint |
| Templates | `pages.service.ts`, `pages.store.ts` | Mongo deep-clone | Save page as template / instantiate |
| Trash + auto-purge | `features/trash`, `pages.service.purgeExpiredTrash` | interval sweep | Soft delete `archivedAt`; purge after 30d |
| Workspaces + roles | `server/modules/workspaces`, `stores/workspace.store.ts` | Mongo | Personal (1:1) + team; membership roles |
| Page permissions | `pagePermissions.service.ts`, `pageAccess.middleware.ts` | Mongo | Baseline + explicit grants + ancestor inheritance |
| Public share links | `shareLinks.service.ts`, `publicShare.middleware.ts`, `features/public` | token hash, bcrypt | Anonymous read-only, optional password/expiry/subpages |
| Invitations | `invitations.service.ts` | SHA-256 token, email | 7-day TTL, accept → membership |
| Auth (email/pw) | `server/modules/auth`, `stores/auth.store.ts` | JWT, bcrypt | Access JWT + refresh cookie, verification |
| OAuth (Google) | `auth/oauth.service.ts` | OAuth 2.0 | CSRF state, find-or-link user |
| Refresh rotation | `auth/token.service.ts` | JWT + SHA-256 | Family rotation + reuse detection |
| Sessions/devices | `features/auth/SessionsPage`, `stores/sessions.store.ts` | ua-parser-js | List/revoke active refresh tokens |
| Captcha | `captcha.middleware.ts`, `components/Turnstile.tsx` | Cloudflare Turnstile | Gates signup/login/reset |
| Avatars/covers/images | `profile`, `pages`, `blocks` + `image.pipeline.ts` | multer, sharp | Resize/optimize, local disk storage |
| Bookmarks | `blocks` `linkPreview.service.ts` | Open Graph scrape | SSRF-guarded fetch |
| AI assist | `server/modules/ai`, `client/services/ai.api.ts` | Groq (SSE) | Streamed commands + autocomplete |
| Theming | `client/src/theme/` | Zustand | Light/dark/system, persisted |
| Export | `editor/export/` | download/print | Markdown export, print-to-PDF |

---

## 3. Repository structure

Monorepo using **npm workspaces** (`client`, `server`) — root `package.json` runs both with
`concurrently`.

```
Notion/
├── package.json         # workspaces + dev/build/test scripts
├── client/              # React + Vite SPA (deployed to Vercel)
│   ├── vite.config.ts   # dev proxy /api -> :4000; VITE_API_ORIGIN define
│   ├── vercel.json      # /api/* rewrite -> Render API; SPA fallback
│   └── src/
│       ├── app/App.tsx          # routes, lazy loading, auth gating
│       ├── stores/              # Zustand stores (blocks, pages, auth, ...)
│       ├── services/            # API clients + http.ts + realtime.ts
│       ├── features/            # feature-first UI (editor, auth, sidebar, ...)
│       ├── hooks/               # useFocusBlock, useHotkey, useUploader
│       ├── lib/                 # debounce, cn, assetUrl, authChannel, uid
│       ├── theme/               # theming
│       └── types/domain.ts      # Block, Page, User types
└── server/              # Express + Mongoose + Hocuspocus (deployed to Render)
    └── src/
        ├── index.ts             # Express app bootstrap + account-deletion cascade
        ├── config/              # env.ts (all env vars), db.ts
        ├── middleware/          # auth, workspace, pageAccess, publicShare, rateLimit, validate, ...
        ├── modules/             # feature modules: routes/controller/service/model
        │   ├── auth/ blocks/ pages/ comments/ notifications/
        │   ├── database/ search/ profile/ workspaces/ ai/
        ├── realtime/            # Hocuspocus server, snapshot/history models, persistence
        ├── services/            # email, captcha, storage, image pipeline, link preview, audit
        └── utils/               # crypto, cookies, HttpError, asyncHandler
```

**Module convention (backend) [Confirmed]:** each `modules/<x>/` folder has
`*.routes.ts` (Express router), `*.controller.ts` (HTTP glue), `*.service.ts` (business logic),
`*.model.ts` (Mongoose schema), and `*.schema.ts` (Zod validation). This is a clean layered
architecture, not a "fat controller" style.

---

## 4. End-to-end request flows

### A. Typing text in a block (autosave path) [Confirmed]

```
User types in a block
   ↓
ProseMirror EditorView (per block)  — RichTextSurface.tsx
   ↓
ySyncPlugin writes to the block's Y.XmlFragment (CRDT, live truth)
   ↓  (two things happen in parallel)
   ├─► Hocuspocus provider broadcasts the Yjs update over WebSocket → peers merge instantly
   └─► debounced 400ms: docToHtml() serializes PM doc → Zustand blocks.store (Block.text)
          ↓
       debounced 600ms: blocks.store flush → POST /api/blocks/bulk (dirty set)
          ↓
       workspaceGuard + validate → blocksService.upsertMany → Block collection (Mongo)
          ↓
       if structural change: REST pings realtime /__internal__/notify-blocks (rev bump)
          ↓
       200 OK → buffers cleared; on failure re-mark dirty for retry
```

### B. Opening a page [Confirmed]

```
Navigate to /p/:pageId
   ↓
Editor mounts → CollabProvider → realtime.connectPage(pageId)
   ↓
y-indexeddb hydrates Y.Doc from local cache (instant, offline-capable)
   ↓
HocuspocusProvider opens WebSocket with token=() => accessToken
   ↓  server onAuthenticate: verify JWT → resolve page→workspace→permission (RO/RW)
   ↓
Parallel REST: blocksStore.fetchPage(pageId) → GET /api/blocks/page/:pageId
   ↓  pageAccessGuard(view) → blocksService.listByPage → Mongo (sorted by order)
   ↓
Store merges server blocks with any in-flight dirty edits → normalized index
   ↓
BlockList/BlockNode render recursively; PM views bind to Y.XmlFragments
```

### C. Login [Confirmed]

```
Login form → auth.store.login → POST /api/auth/login (+captcha)
   ↓
loginLimiter → validate → authService.login: bcrypt.compare (timing-safe)
   ↓
tokenService: signAccess (JWT 15m) + issueRefresh (48-byte, SHA-256 hashed in DB)
   ↓
Set-Cookie: httpOnly refresh cookie; JSON body: { accessToken, user }
   ↓
Client stores accessToken in module memory only (never localStorage) → status = 'authed'
   ↓
BroadcastChannel signals other tabs to re-hydrate via /refresh
```

---

## 5. Project explanation scripts

### 30-second
> "It's a Notion-style collaborative workspace. You build pages out of blocks and edit them
> live with other people. The interesting part is the real-time layer: I used Yjs CRDTs over
> WebSockets with Hocuspocus so edits merge without conflicts and work offline, and I paired
> that with a normalized Zustand store and a MongoDB document model. It also has hierarchical
> permissions — workspace roles plus per-page grants that inherit down the page tree."

### 1-minute
> Add to the above: "The backend is a TypeScript/Express API with about 65 REST endpoints
> across ~15 Mongoose models, plus a **separate** realtime process running Hocuspocus so REST
> and WebSocket traffic scale independently. Each page is a single Yjs document; each block has
> its own ProseMirror editor bound to a Yjs fragment. Structural changes (create/delete/reorder
> blocks) go through REST and Mongo, while inline text lives in the CRDT — and I keep them
> consistent with an internal beacon that tells connected clients to refetch. Auth uses a
> short-lived access JWT kept in memory plus an httpOnly refresh cookie with family-based
> rotation and reuse detection."

### 2-minute
> Add: architecture (two frontends of scaling — Vercel SPA + Render API/realtime + Mongo Atlas),
> offline-first via y-indexeddb, autosave (600ms debounce) with optimistic UI, permission
> inheritance resolved by walking the ancestor chain and cached per request, and the security
> posture (in-memory access token, SHA-256 hashed refresh/verification/share tokens, SSRF-guarded
> link previews, snapshot size caps). Mention it's a solo personal project, so I own every layer.

### 5-minute deep-dive
> Structure the deep-dive around the **hardest problem**: reconciling a CRDT with a document
> database. Explain: (1) why per-block PM+Yjs (marks can't cross blocks, matches Notion, keeps
> fragments small); (2) how the tree structure lives in Zustand/Mongo while text lives in Yjs;
> (3) the `rev` beacon that bridges REST mutations to live clients; (4) persistence via
> `DocSnapshot` on `onStoreDocument` with a 5MB cap and throttled `DocHistory` archive for
> version restore; (5) the permission resolver and refresh-token rotation as the two other
> "senior" pieces. Close with honest limitations (see `10-scalability.md` and `15-...`).

> **Truthful framing:** This is a **personal project**. There are no real production users,
> traffic numbers, or a team. Everything above is verifiable in the repo. Do not claim metrics.
