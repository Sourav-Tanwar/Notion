# 14 — Technical Decisions

For each: **Decision → Why → Alternatives → Pros → Cons → When I'd change it → Interview Q.**
Only technologies actually in the repo.

---

## 1. React + TypeScript
- **Why:** component model fits a block editor; TS gives safety across a large surface (domain types
  in `types/domain.ts`).
- **Alternatives:** Vue/Svelte; plain JS.
- **Pros:** ecosystem, hiring, PM/dnd-kit integrate well; compile-time safety.
- **Cons:** re-render management needs care (solved via normalized store + memo + uncontrolled editor).
- **Change when:** never for this app; Svelte only for a much smaller bundle target.
- **Q:** "How does TS help in the editor?" *(discriminated `BlockType` union, typed store selectors.)*

## 2. Vite
- **Why:** fast dev server + HMR; simple config; ESM-first.
- **Alternatives:** CRA (deprecated), Webpack.
- **Pros:** speed, route-level `lazy()`, small config.
- **Cons:** native-binary lockfile pitfalls on cross-OS deploy (hit + fixed).
- **Q:** "Why not CRA/Webpack?" *(speed; CRA is unmaintained.)*

## 3. Zustand (not Redux)
- **Why:** minimal boilerplate, usable outside React, easy custom middleware (snapshot history),
  fine-grained subscriptions.
- **Alternatives:** Redux Toolkit, Jotai, React Query.
- **Pros:** ergonomic, performant, normalized store is simple.
- **Cons:** fewer conventions/devtools; I hand-rolled server-state caching.
- **Change when:** larger team → RTK for structure; **adopt React Query for server state**.
- **Q:** "Zustand vs Redux — defend it." (see `07`.)

## 4. ProseMirror per block (not one big editor / not Slate/Lexical)
- **Why:** battle-tested document model + a clean Yjs binding (`y-prosemirror`); per-block keeps
  fragments small and marks scoped (matches Notion).
- **Alternatives:** Lexical, Slate, TipTap (wraps PM), contentEditable-only.
- **Pros:** robust, extensible schema, strong CRDT integration.
- **Cons:** steep API; cross-block selection harder; imperative focus needed.
- **Change when:** if I wanted batteries-included, TipTap; if Meta-ecosystem, Lexical.
- **Q:** "Why per-block editors?" *(small fragments, tree in React, Notion-like marks.)*

## 5. Yjs + Hocuspocus over WebSockets (CRDT)
- **Why:** conflict-free concurrent editing + offline, without server-side OT logic.
- **Alternatives:** OT (ShareDB), custom LWW, Automerge.
- **Pros:** converges, offline-first, mature, good PM/IndexedDB adapters.
- **Cons:** binary state is opaque; reconciling with Mongo is extra work; scaling WS needs shared
  backend.
- **Change when:** never for text; I'd extend CRDT to structural ops too.
- **Q:** "CRDT vs OT?" *(no central transform; offline.)*

## 6. MongoDB + Mongoose
- **Why:** flexible document shapes fit heterogeneous blocks/props; fast iteration; Atlas managed.
- **Alternatives:** PostgreSQL (+ jsonb), MySQL.
- **Pros:** schema flexibility, easy nesting, workspace-scoped queries + indexes.
- **Cons:** no cheap joins (denormalized `workspaceId`), no transactions used (idempotent cascades
  instead), weaker relational integrity.
- **Change when:** if I needed strong relational constraints/complex reporting → Postgres; blocks
  could be jsonb.
- **Q:** "Why Mongo for a hierarchical doc app? What do you lose?" *(flex vs joins/txns.)*

## 7. Node + Express (run via `tsx`)
- **Why:** same language as the client, huge ecosystem, simple middleware model; `tsx` dodged a
  platform TS-version deploy fight.
- **Alternatives:** Nest (structure), Fastify (perf), compiled `tsc` build.
- **Pros:** shared types, fast to build, flexible.
- **Cons:** no deploy-time type gate with `tsx`; Express is unopinionated (I imposed the layering).
- **Q:** "Why `tsx` at runtime?" (see `13`.)

## 8. Two-process backend (REST + realtime)
- **Why:** request/response and long-lived sockets scale on different axes.
- **Alternatives:** single process attaching WS to the HTTP server.
- **Pros:** independent scaling; clean failure isolation.
- **Cons:** cross-process coordination (the internal `rev` beacon + shared secret).
- **Q:** "Why split them?" *(scaling axis; sticky LB for WS.)*

## 9. Access JWT (memory) + refresh cookie (httpOnly) with family rotation
- **Why:** stateless fast auth + XSS-safe refresh + stolen-token detection.
- **Alternatives:** server sessions, access token in localStorage (insecure), no rotation.
- **Pros:** scalable stateless access; strong refresh security.
- **Cons:** access token can't be revoked before 15m expiry (mitigated by `tokenVersion`); refresh
  needs a store (Mongo).
- **Q:** "How do you revoke a leaked refresh token?" *(family revocation on reuse + tokenVersion.)*

## 10. Hierarchical permissions with inheritance
- **Why:** Notion-like sharing where a shared parent grants children access.
- **Alternatives:** flat per-page ACL, workspace-only roles.
- **Pros:** intuitive, powerful; sparse grant rows.
- **Cons:** ancestor-walk cost (mitigated by per-request cache).
- **Q:** "How do you resolve effective access without N+1?" *(cache + `bulkPageAccessGuard`.)*

## 11. Client-generated UUID block ids
- **Why:** optimistic updates, idempotent upserts, offline id stability, Yjs alignment.
- **Cons:** trust client-supplied ids (validated + workspace-scoped server-side).
- **Q:** "Isn't trusting client ids risky?" *(validated, namespaced by workspace/page; collisions
  astronomically unlikely with UUIDv4.)*

## 12. Groq for AI (SSE)
- **Why:** free, OpenAI-compatible, streamable; auto-disables without a key so the app runs anywhere.
- **Alternatives:** OpenAI, self-hosted.
- **Pros:** cost, speed, graceful degradation.
- **Cons:** vendor dependence; rate limits (own limiters added).
- **Q:** "Why SSE not WebSocket for AI?" *(one-way token stream; simpler over HTTP.)*

---

## The single most important "why" to nail
> "The hardest decision was **how to combine a CRDT with a document database**. I chose to let
> **Yjs own inline text** (conflict-free, offline) and **Mongo own structure** (queryable for the
> sidebar, search, and permissions), then bridge them with an internal `rev` beacon and a debounced
> HTML projection. It's a deliberate trade-off: I accept a small reconciliation surface in exchange
> for both real-time collaboration **and** a queryable, permission-aware document model."
