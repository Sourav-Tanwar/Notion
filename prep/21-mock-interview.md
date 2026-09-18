# 21 — Mock Interview

A full, interactive mock. **7 rounds, one question at a time.** Read a question, answer **out loud**
*before* looking at the "model points," then score yourself. Grounded entirely in this project — no
invented metrics.

**How to run it:**
1. Cover the "model points" line.
2. Answer aloud (time yourself: aim ~60–90s).
3. Reveal, score each dimension 1–5, note gaps.
4. Re-attempt anything under 4.

**Scoring dimensions:** Correctness · Depth · Trade-off awareness · Clarity · Honesty.

---

## Round 1 — Project Fundamentals (10)

1. In two sentences, what is this project? → *model:* collaborative block workspace; real-time +
   permissions + offline; MERN + Yjs.
2. What problem does it solve / who's it for? → *model:* Notion-style team docs; you built it to learn
   collaborative systems + full lifecycle.
3. Name the stack top to bottom. → *model:* React/TS/Vite/Zustand/PM/Yjs → Express/Mongoose/Mongo +
   Hocuspocus.
4. What's a block and how are blocks stored? → *model:* atomic content unit; normalized store client;
   Mongo docs server; client UUID ids.
5. How does the client reach the server? → *model:* `http.ts` fetch → `/api` (Vercel rewrite →
   Render); bearer access + httpOnly refresh; WS for realtime.
6. Where does state live? → *model:* 11 Zustand stores (view/app state) + Yjs (text) + Mongo (truth).
7. How is it deployed? → *model:* Vercel SPA, Render API + realtime, Atlas DB, `tsx` runtime.
8. What's the single most important design decision? → *model:* CRDT (text) vs DB (structure) split.
9. What are you proudest of? → *model:* end-to-end ownership + the reconciliation design.
10. What's the biggest gap? → *model:* server tests + CI/CD.

## Round 2 — Deep Technical (15)

1. Walk two users editing the same block. → *model:* PM→Yjs deltas → CRDT merge → persist → `rev`
   beacon → dirty-aware refresh.
2. CRDT vs OT — why Yjs? → *model:* no central transform; offline; mature adapters.
3. Explain the normalized blocks store. → *model:* byId/childrenOf/rootByPage; O(1) lookup.
4. Autosave mechanics + numbers. → *model:* 600ms debounce upsert; 400ms HTML projection.
5. How does offline work? → *model:* y-indexeddb hydrates before connect; converges on reconnect.
6. Access vs refresh token design. → *model:* in-memory 15m HS256 access; hashed rotating httpOnly
   refresh family + reuse detection; `tokenVersion`.
7. How do you revoke a leaked refresh token? → *model:* replay of rotated token → family revoked.
8. Permission model + inheritance. → *model:* roles + page grants; ancestor walk; cache; bulk guard.
9. Why 404 not 403? → *model:* don't leak private resource existence.
10. Request lifecycle server-side. → *model:* helmet/cors → rate limit → auth → workspace → page
    guard → zod → controller → service → model → error mw.
11. How is input validated? → *model:* zod per route via validate middleware.
12. How does presence render? → *model:* Yjs awareness; ephemeral cursors/avatars.
13. How does the AI feature stream? → *model:* server proxy → Groq SSE; auto-disabled w/o key.
14. Two-process backend — why + how coordinated? → *model:* scaling axes; internal `rev` beacon +
    shared secret.
15. Where can data be lost + mitigations? → *model:* debounce window; y-indexeddb + server persist +
    idempotent upserts + 5MB snapshot cap.

## Round 3 — Architecture (10)

1. Draw the system. → *model:* SPA↔Vercel rewrite↔API; SPA↔realtime WS; both↔Mongo; beacon; Groq SSE.
2. Why split REST and realtime? → *model:* different scaling + failure profiles.
3. Why per-block ProseMirror? → *model:* small fragments, scoped marks, React-owned tree.
4. Why MongoDB, and what do you lose? → *model:* flexible docs; lose joins/txns (denormalized
   workspaceId, idempotent cascades).
5. Why Zustand over Redux? → *model:* minimal, usable outside React, custom history middleware.
6. Shard/partition strategy? → *model:* shard on workspaceId (tenant boundary).
7. Scale realtime to N nodes? → *model:* sticky by documentName + shared persistence.
8. Single points of failure? → *model:* single realtime instance; in-memory rate-limit/OAuth state.
9. Source-of-truth per concern? → *model:* text=Yjs, structure=Mongo, bridged by beacon.
10. What would premature optimization have looked like here? → *model:* wiring virtualization/sharding
    before correctness.

## Round 4 — Debugging (10)

1. OAuth-logout-on-refresh: cause + fix. → *model:* cookie set on wrong host → route callback via
    Vercel proxy (same-site).
2. CORS all-blocked: cause + fix. → *model:* trailing slash in CLIENT_ORIGIN → strip in env.ts.
3. Linux build failure: cause + fix. → *model:* missing native binaries → explicit
    optionalDependencies pinned to nested versions.
4. Why run with `tsx`? → *model:* host TS version broke node10 resolution; sidestep + local typecheck.
5. False "500 on every auth route": cause? → *model:* PowerShell curl stripped JSON quotes.
6. Malformed JSON returns 500 — bug + fix? → *model:* map entity.parse.failed → 400 in error mw.
7. Rate limiter never 429s — why? → *model:* undefined req.ip behind proxy → limiter no-ops; fix trust
    proxy / keyGenerator.
8. Uploads vanish after redeploy — why? → *model:* ephemeral Render disk → move to S3.
9. How would you debug "collaboration feels laggy"? → *model:* isolate WS RTT vs persist vs render;
    check awareness flood + snapshot size.
10. How do you reproduce a concurrency bug deterministically? → *model:* two Y.Docs, interleave
    updates, assert convergence.

## Round 5 — System Design (10)

1. Design a collaborative doc editor (5-min). → *model:* see `17` 5-min script.
2. Requirements you'd clarify first? → *model:* concurrency scale, offline, permission granularity,
    durability SLO.
3. Data model sketch. → *model:* users/workspaces/memberships/pages(tree)/blocks/permissions/…
4. How to keep input latency low? → *model:* optimistic local + CRDT; debounced persistence.
5. Scale to 1M docs — what changes? → *model:* shard Mongo + realtime by doc; Redis state; S3+CDN;
    dedicated search.
6. Ensure durability of edits. → *model:* Yjs (IndexedDB+server) + idempotent upserts + snapshots.
7. Prevent permission bypass via direct block API. → *model:* resolve parent page, same guard,
    namespaced ids.
8. Add version history. → *model:* build on DocHistory snapshots (60s throttle / retain 20) → restore
    UI.
9. Observability plan. → *model:* health checks, structured logs, error tracking, WS metrics.
10. Biggest reliability win in one week? → *model:* server integration tests + CI gate.

## Round 6 — Senior Follow-ups (10)

1. Defend the CRDT⇄DB split against "just use one." → *model:* need both merge-free text and
    queryable/permissioned structure; small idempotent bridge.
2. Where did you knowingly cut a corner? → *model:* local uploads, no CI, hand-rolled cache — scoped
    solo trade-offs w/ upgrade paths.
3. Evolve auth to enterprise SSO. → *model:* pluggable providers behind token service + org policies.
4. Argue for/against moving blocks to Postgres jsonb. → *model:* gain txns/integrity; lose schema-free
    iteration.
5. Remove the internal shared secret — what breaks? → *model:* beacon becomes forgeable (trust
    boundary).
6. SLOs you'd set. → *model:* input latency, save success, WS reconnect, auth p99.
7. Guarantee eventual consistency across IndexedDB/Yjs/Mongo. → *model:* Yjs converges;
    beacon-refresh preserves dirty; idempotent writes.
8. Justify Zustand for a 15-person team. → *model:* pair with React Query + conventions; RTK if they
    want rigidity.
9. Threat-model sharing. → *model:* link password/expiry, inheritance scope, id enumeration
    (404-not-403), OAuth fragment leakage.
10. If one more month, top 3 changes + why. → *model:* CI+server tests, React Query, S3 — reliability/
    correctness/durability.

## Round 7 — Behavioral (10)

1. Tell me about yourself. → *see `18` Q1.*
2. Hardest technical problem. → *CRDT⇄DB reconciliation.*
3. Hard-to-find bug. → *OAuth cookie host.*
4. Learned something fast. → *Yjs/ProseMirror via vertical slice.*
5. A trade-off you made. → *`tsx` runtime vs deploy-time typecheck.*
6. A failure/mistake. → *shipped without server tests → found 2 real bugs → fixes + lesson.*
7. Disagreement/conflict. → *[use real MAQ/Accenture story].*
8. Difficult feedback. → *[real workplace story].*
9. Leadership/ownership. → *technical ownership of full architecture (solo).*
10. Why hire you? → *end-to-end ownership + honest trade-off reasoning + 4.5 yrs React/TS/Node.*

---

## Scorecard

| Round | /50 | Weak spots to revisit |
|---|---|---|
| 1 Fundamentals | | |
| 2 Deep Technical | | |
| 3 Architecture | | |
| 4 Debugging | | |
| 5 System Design | | |
| 6 Senior | | |
| 7 Behavioral | | |

**Passing bar:** ≥40/50 per round. Anything lower → re-read the referenced file (`00`–`20`) and
re-attempt aloud.

### Golden rules while answering
- Lead with **why**, then **how**, then **trade-off**.
- Anchor every claim to a real file/behavior in the repo.
- Never invent users, traffic, benchmarks, or teammates — "solo personal project, not load-tested"
  is a **strong** honest answer.
- For team/conflict/feedback behavioral questions, use your **real** work history.
