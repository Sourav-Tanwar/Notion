# 16 — Interview Questions (100, by level)

Each: **Q → what it tests → expected answer (grounded in THIS project) → key points → follow-ups.**
Legend for honesty: this is a **solo personal project, no production traffic** — never quote user
metrics.

---

## A. Beginner (20)

**1. What is this project?**
Tests: clarity. *A collaborative Notion-style workspace: nested pages, a block editor, real-time
multi-user editing, workspaces/permissions, and optional AI.* Follow-up: MERN? *React+TS/Express+
Mongo, plus Yjs realtime.*

**2. What's the MERN stack here?**
Mongo (Atlas) + Express + React + Node — plus TypeScript everywhere, Vite, Zustand, Yjs.

**3. What is a "block"?**
The atomic content unit (paragraph, heading, todo, code…). Pages are ordered trees of blocks; each
block has a client-generated UUID `_id`. Follow-up: why client-generated? *(optimistic/offline/idempotent.)*

**4. How does the frontend talk to the backend?**
`fetch` wrapper in `services/http.ts` → REST `/api/*`; access token in an `Authorization` header;
refresh via httpOnly cookie. Realtime uses a WebSocket (Hocuspocus), not REST.

**5. What is Zustand?**
A minimal state store; used for 11 slices (auth, blocks, pages, comments…). Follow-up: vs Redux? (see `07`.)

**6. What runs on the client vs server?**
Client: UI, editor, optimistic state, CRDT doc. Server: auth, permissions, persistence, uploads, AI
proxy, realtime sync/persistence.

**7. What's a JWT?**
Signed token proving identity. Here: HS256 access token, 15-min expiry, kept **in memory** only.

**8. Why TypeScript?**
Compile-time safety across a big surface; domain types in `types/domain.ts`.

**9. What is Tailwind used for?**
Utility-first styling; theme tokens + dark mode via a theme manager.

**10. How do you create a page?**
`POST /api/pages` (workspace-scoped) → server creates a Page doc → sidebar tree updates.

**11. What's Vite?**
Dev server + bundler; fast HMR; route-level `lazy()` code splitting.

**12. How is the app deployed?**
SPA on Vercel, API + realtime on Render, DB on Atlas. (see `13`.)

**13. What is a REST endpoint? give one.**
`GET /api/pages/:id` returns a page if the caller has access. ~65 endpoints across the modules.

**14. What database and why?**
MongoDB — flexible document shapes fit heterogeneous blocks. Follow-up: downside? *(joins/txns.)*

**15. How do users log in?**
Email+password (bcrypt) or Google OAuth → access token + refresh cookie.

**16. What's a component vs a hook?**
Component renders UI; hook encapsulates reusable logic (`useUploader`, `useHotkey`, `useFocusBlock`).

**17. What's optimistic UI?**
Apply the change locally first, sync to server after; roll back on failure. Used for typing/edits.

**18. Where are images stored?**
Uploaded via multer, processed by sharp, served from the API (currently local disk — ephemeral note).

**19. What's the editor built on?**
ProseMirror, one small instance per block; bound to Yjs for collaboration.

**20. What is dark mode here?**
A theme store resolves system/user preference → CSS variables; tested in `theme/__tests__`.

---

## B. Intermediate (30)

**21. How does real-time editing work end to end?**
Client mounts a `Y.Doc` (documentName = pageId) → y-indexeddb hydrates offline → connects via
Hocuspocus provider (WebSocket) → y-prosemirror binds each block's `Y.XmlFragment` to a PM view →
updates broadcast as CRDT deltas; server persists + broadcasts.

**22. Why CRDT over OT?**
No central transform server; converges deterministically; offline-first. (see `06`.)

**23. Explain the normalized blocks store.**
`byId` map, `childrenOf` adjacency, `rootByPage` — O(1) lookup and local sibling ops; avoids deep
tree re-renders.

**24. How does autosave work?**
600 ms debounce marks blocks dirty → bulk upsert; PM→HTML projection debounced ~400 ms for a
searchable snapshot.

**25. How are permissions modeled?**
Workspace roles (guest<member<admin<owner) + page-level grants (none<view<comment<edit<full) with
**ancestor inheritance**, resolved per request and cached.

**26. Why 404 instead of 403 on denied pages?**
Avoids leaking the existence of private resources.

**27. Refresh token rotation — how?**
Refresh token is a 48-byte secret, **SHA-256 hashed** at rest, httpOnly cookie, 30-day family;
rotates on use; **reuse detection revokes the whole family**.

**28. How do you revoke access immediately?**
`tokenVersion` (`tv`) in the access token; bumping it invalidates outstanding access tokens on next
verify; refresh family revocation cuts renewals.

**29. How does the sidebar tree render efficiently?**
Server returns a flat list; client builds the tree; collapsible; drag/reorder via dnd-kit.

**30. What's the request lifecycle on the server?**
helmet/cors/cookie-parser → rate limit → auth → workspace resolve → page-access guard → zod validate
→ controller → service → model → error middleware. (see `03`.)

**31. How is input validated?**
Zod schemas per route (`schema.ts`), enforced by `validate.middleware`.

**32. How does search work?**
`search.api` queries indexed fields (title/derived text) scoped to workspace + permissions.

**33. What indexes matter most?**
Compound `{ workspaceId, ... }` on pages/blocks; unique on user email; token lookups. (see `04`.)

**34. How do comments work?**
`comments` module + store; anchored to blocks/pages; notifications on mention/reply (polled 30 s).

**35. How does presence show who's online?**
Yjs awareness carries cursor/user; rendered as avatars/cursors; ephemeral (not persisted).

**36. Cross-tab logout — how?**
BroadcastChannel signals (not data) — one tab logging out tells others to clear in-memory auth.

**37. How do file uploads work?**
multer → sharp (resize/normalize) → stored → URL returned; asset URLs pass a scheme allow-list.

**38. What stops a malicious asset URL?**
`assetUrl.ts` allow-lists schemes (rejects `javascript:`/`file:`), unit-tested.

**39. How is the AI feature wired?**
Client → server proxy → Groq (OpenAI-compatible) streamed via **SSE**; auto-disabled without a key;
own rate limits.

**40. Why SSE for AI, WebSocket for editing?**
AI is one-way token streaming (SSE fits); editing is bidirectional CRDT sync (WebSocket).

**41. How does the two-process backend coordinate?**
REST + realtime are separate; realtime posts an internal **`rev` beacon** (shared secret) so REST
clients know to re-pull.

**42. What happens on account deletion?**
Idempotent cascade removes workspaces owned solo, memberships, pages/blocks, tokens, uploads.

**43. How is trash handled?**
Soft-delete flag; a scheduled purge removes items past retention.

**44. How do you prevent N+1 on permission checks?**
Per-request resolver cache + `bulkPageAccessGuard` for lists.

**45. What's in `env.ts`?**
Central config; **refuses to boot** without `MONGO_URI` + JWT secrets; optional OAuth/Turnstile/Groq/
SMTP/S3.

**46. How does routing/code-splitting work?**
react-router-dom v6 with `lazy()` per route → smaller initial bundle.

**47. How do you handle form validation on the client?**
react-hook-form + zod resolver; schemas unit-tested.

**48. What is Turnstile for?**
Cloudflare captcha on sensitive auth endpoints (`captcha.middleware`).

**49. How is the code organized on the server?**
Layered modules `modules/<x>/{routes,controller,service,model,schema}` — clear separation.

**50. What's your testing setup?**
Jest + ts-jest + RTL, ~51 client tests; **no server tests yet** (named gap). (see `12`.)

---

## C. Advanced (30)

**51. Walk me through concurrent edits by two users on the same block.**
Both PM views emit Yjs updates → merged by CRDT (deterministic) → converge; server persists merged
state; `rev` beacon triggers structure refresh preserving each client's dirty blocks.

**52. How do you reconcile the CRDT with MongoDB without clobbering a typist?**
Text = CRDT truth; structure = DB truth; refresh merges DB changes but **skips locally dirty blocks**;
projection is debounced. (see `15`.)

**53. Where can data be lost, and how do you mitigate?**
Between debounce and crash → y-indexeddb + Yjs server persistence bound the loss; upserts are
idempotent; snapshots capped at 5 MB.

**54. How would you scale WebSockets to multiple realtime instances?**
Sticky routing + a shared Yjs backend (e.g., Redis/DB persistence) so any node can serve a doc;
today it's single-process-friendly.

**55. What breaks first at 10×/100× load?**
Realtime memory + single-instance rate-limit/OAuth state; then unindexed queries. (see `10`.)

**56. Design a shard/partition strategy.**
Shard on `workspaceId` (natural tenant boundary; most queries are workspace-scoped).

**57. How do you guarantee permission checks aren't bypassed by direct block access?**
Block routes resolve the parent page and run the same page-access guard; ids are workspace-namespaced.

**58. How is refresh-token theft detected and contained?**
Family model: a **used (rotated) token replayed** → reuse detected → entire family revoked.

**59. What are the trade-offs of in-memory access tokens?**
No XSS token theft via storage; but lost on reload (refresh flow re-mints) and can't be revoked
pre-expiry without `tokenVersion`.

**60. How would you add end-to-end tests for collaboration?**
Playwright two contexts editing one page; assert convergence + presence; plus a deterministic Yjs
convergence unit test.

**61. How do you keep the editor at 60fps with large pages?**
Per-block PM instances, normalized store, memoized rows, uncontrolled inputs; react-window is
installed for virtualization (not yet wired — honest).

**62. Explain your debounce/throttle choices.**
Autosave 600 ms (batch writes), PM→HTML 400 ms (snapshot), DocHistory throttle 60 s / retain 20
(bounded history), notifications poll 30 s.

**63. What's your caching story for server state?**
Hand-rolled in Zustand today; I'd adopt **React Query** for dedupe/staleness/retry.

**64. How do you prevent SSRF/abuse in the AI proxy?**
Fixed provider endpoint, server-held key, request shaping + rate limits; no user-supplied URLs.

**65. How do you secure file uploads?**
Type/size limits, sharp re-encode (strips payloads), scheme allow-list on URLs, served with a strict
CORP header.

**66. Where are transactions missing and does it matter?**
Cascades avoid multi-doc transactions via idempotent ordering; a mid-cascade crash can leave orphans
— re-running the cascade is safe. Postgres/txns would tighten this.

**67. How would you add offline conflict UX?**
Yjs already merges; surface presence + a "reconnected/merged" toast; queue structural ops offline.

**68. How do you monitor a system with no observability today?**
[Improvement] add health checks, structured logs, error tracking (Sentry), and WS connection metrics.

**69. Explain the security posture against OWASP Top 10.**
XSS (sanitized render + scheme allow-list), CSRF (httpOnly refresh + same-site + bearer access),
injection (Mongoose + zod), authz (guards + 404-not-403), secrets (env-gated), rate limiting. (see `05`.)

**70. What's the blast radius if the realtime service dies?**
Editing degrades to local + last-saved REST snapshot; no data corruption; reconnect resumes from
IndexedDB + server state.

**71. How would you implement version history/restore?**
DocHistory snapshots exist (throttled 60 s, retain 20); expose a timeline + restore-to-snapshot.

**72. How do you paginate large lists (comments/notifications)?**
Cursor/skip-limit with indexes; notifications currently polled — I'd move to SSE/WS push.

**73. How would you add per-block presence cursors reliably?**
Yjs awareness per block fragment; throttle cursor broadcasts; garbage-collect on disconnect.

**74. What prevents a client forging another user's `_id` on blocks?**
Server validates ownership via page access + workspace scope; ids are namespaced, not authorization.

**75. How do you handle a poisoned/oversized Yjs update?**
Snapshot cap (5 MB) + server validation; reject/parse-guard before persist.

**76. Describe your error taxonomy.**
Typed AppError with status; global middleware maps to JSON `{error}`; known gap: body-parser 400→500.

**77. What's your strategy for schema migrations in Mongo?**
[Improvement] versioned migration scripts + a `schemaVersion` field; none today.

**78. How would multi-region affect your cookie/auth design?**
Same-origin proxy still works; token store must be globally consistent (regional replicas + sticky).

**79. Why per-block ProseMirror rather than one document?**
Small fragments = cheaper CRDT + scoped marks + a React-owned tree; matches Notion's model.

**80. What would you refactor first with more time?**
Server tests + CI gate, React Query for server state, S3 uploads, wire virtualization, fix the two
known bugs.

---

## D. Senior / Staff (20)

**81. Defend your CRDT-vs-database source-of-truth split.**
Text needs conflict-free merge/offline → CRDT; sidebar/search/permissions need queryability → DB;
bridge is a tiny idempotent beacon. Trade-off: a bounded reconciliation surface. (This is the crux.)

**82. If told "collaboration feels laggy at scale," how do you diagnose?**
Separate transport (WS RTT), server persist time, and client render; check awareness flood, snapshot
size, and per-block view count; add metrics first.

**83. How do you evolve auth for enterprise SSO/SAML?**
Pluggable providers behind the token service; keep access/refresh model; add org-level policies.

**84. Make the case to move blocks to Postgres jsonb.**
Gain transactions + relational integrity + rich queries; cost = migration + losing schema-free
iteration; blocks fit jsonb well.

**85. How would you shard realtime by document, not tenant?**
Consistent-hash documentName → node; router keeps affinity; rebalance on scale events.

**86. What's your rollout/rollback plan for a risky editor change?**
Feature flag, canary a subset, keep prior deploy warm, snapshot-based recovery, watch WS error rate.

**87. Where's your biggest single point of failure?**
Single realtime instance + in-memory rate-limit/OAuth state; make them shared/stateless.

**88. How do you prevent unbounded growth of history/snapshots?**
Throttle + retention cap already; add tiered storage + compaction.

**89. Justify Zustand for a product team of 15.**
Fine for view state; I'd pair with React Query and stronger conventions/lint rules; RTK if the team
prefers rigid structure.

**90. What SLOs would you set and how?**
Editor input latency, save success rate, WS reconnect time, auth p99; instrument, alert, error-budget.

**91. How do you test permission inheritance exhaustively?**
Property-based tests over ancestor chains + role/grant matrices via supertest + in-memory Mongo.

**92. Threat-model the sharing feature.**
Public links (password/expiry), scope creep via inheritance, id enumeration (404-not-403), token
leakage in URLs (OAuth fragment) — mitigations per `05`.

**93. How would you add real analytics without hurting latency?**
Async event pipeline (queue) off the request path; sample; never block writes.

**94. What's the cost model as you scale?**
Realtime memory + WS connections dominate; DB reads scale with workspace fan-out; cache hot trees.

**95. Convince me the two-process split was right, not premature.**
Different scaling axes and failure modes; it also cleanly isolates the WS memory profile — modest
complexity (one internal beacon) for real operational clarity.

**96. Where did you knowingly cut a corner and why?**
Local-disk uploads, no CI, hand-rolled server-state cache — deliberate scope calls for a solo
project; each has a clear upgrade path.

**97. How do you guarantee eventual consistency between IndexedDB, Yjs server state, and Mongo?**
Yjs converges across IndexedDB+server; Mongo follows via the beacon-driven refresh that preserves
dirty state; all writes idempotent.

**98. Design an audit log for permission changes.**
Append-only collection with actor/target/before/after; index by workspace+time; surface in settings.

**99. What breaks if you remove the internal shared secret?**
The `rev` beacon endpoint becomes forgeable → spoofed refresh storms; it's a trust boundary between
your two services.

**100. If you had one week, what single change delivers the most reliability?**
Server integration tests (permissions + refresh rotation + reconciliation) wired into a CI gate —
it protects the two security- and data-critical paths at once.

---

**How to use:** rehearse A/B out loud; for C/D, lead with the trade-off, then the mitigation, then
the "what I'd change." Always anchor to a real file/behavior in this repo.
