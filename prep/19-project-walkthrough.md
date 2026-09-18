# 19 — Project Walkthrough (spoken)

A polished, section-by-section walkthrough to deliver out loud. **This is a solo personal project**,
so "my contribution" = the whole thing; frame it as end-to-end ownership, never invent collaborators
or users.

---

## 1. One-line pitch (10s)
"It's a Notion-style collaborative workspace — nested pages built from blocks, with real-time
multi-user editing, offline support, hierarchical permissions and sharing, and optional AI — built
end to end with React/TypeScript on the front and Express/MongoDB with a Yjs realtime layer on the
back."

## 2. Why I built it (20s)
"I wanted to go past CRUD and learn collaborative-systems problems firsthand — CRDTs, presence,
offline sync — plus own the full lifecycle: auth, permissions, deployment. So I built the hardest
version I could reason about end to end, solo."

## 3. The stack, quickly (30s)
"React 18 + TypeScript + Vite, Zustand for state, ProseMirror per block for the editor, and Yjs +
Hocuspocus over WebSockets for collaboration. Backend is Express + Mongoose on MongoDB Atlas, run
with `tsx`. The SPA is on Vercel, the API and a separate realtime service on Render."

## 4. Architecture in one breath (40s)
"Two backend processes: a stateless REST API and a WebSocket realtime service, so request/response
and long-lived sockets scale independently. They share MongoDB and coordinate with one small internal
beacon. The single most important design idea is a **source-of-truth split**: Yjs owns the inline
text — conflict-free and offline — while MongoDB owns the queryable structure — the page tree,
permissions, search. I bridge them so I get both real-time collaboration and a permission-aware,
queryable document model."

## 5. The editor (40s)
"Every block is its own small ProseMirror instance bound to a Yjs `XmlFragment`. The block tree lives
in a **normalized** Zustand store — a `byId` map plus `childrenOf` adjacency — so lookups and sibling
operations are O(1) and I don't re-render the whole tree on a keystroke. Autosave is debounced at
600 ms; a separate debounced projection turns the doc into HTML for search. Blocks carry
client-generated UUIDs so edits are optimistic, offline-stable, and upserts are idempotent."

## 6. Real-time collaboration (40s)
"On opening a page the client mounts a `Y.Doc` keyed by the page id, hydrates from IndexedDB first —
so it works offline — then connects through the Hocuspocus provider. Edits propagate as CRDT deltas
and converge deterministically; presence rides on Yjs awareness as live cursors and avatars. The
server persists Yjs state and then emits a `rev` beacon so REST clients know to re-pull structure —
and that refresh merges DB changes **without overwriting blocks the user is actively editing**."

## 7. Auth (30s)
"Access tokens are short-lived HS256 JWTs kept **in memory only** — not localStorage — so XSS can't
steal them. Refresh is a random secret, **hashed at rest**, in an httpOnly cookie, with a rotating
30-day family and **reuse detection** that revokes the whole family if a rotated token is replayed.
Google OAuth flows through the same model. A `tokenVersion` claim lets me invalidate access tokens
early."

## 8. Permissions & sharing (30s)
"Workspace roles — guest, member, admin, owner — plus page-level grants — view, comment, edit, full —
with **ancestor inheritance**: sharing a parent grants its children. It's resolved per request with a
cache, and a bulk guard avoids N+1 on lists. Denied pages return **404, not 403**, so I don't leak
which private pages exist. There's also public share links and an invitation workflow."

## 9. A hard problem I solved (40s)
"OAuth login logged users out on refresh while email login didn't. The fact that only OAuth broke
told me it was a cookie problem, not auth logic — the refresh cookie was being set on the API host
instead of the origin the SPA calls. I routed the OAuth callback through the Vercel proxy so the
cookie is same-site, and both flows persist now. My takeaway: when two similar paths diverge, the
difference is the clue." *(Have Challenge 3 — Linux native binaries — ready as a second story.)*

## 10. Testing & what I'd improve (30s)
"Client logic — stores, auth flow, security utils — has about 51 Jest + RTL tests. I'm honest that
the biggest gap is server-side integration tests for permissions and refresh rotation, plus a Yjs
convergence test and a two-user Playwright end-to-end. I'd wire all of that into a CI gate, which the
project doesn't have yet."

## 11. Deployment reality (20s)
"SPA on Vercel with an `/api` rewrite to Render so cookies stay same-site; API and realtime as two
Render services run with `tsx` — I chose runtime execution over compiling because the host kept
forcing a TypeScript version that broke my module resolution. DB on MongoDB Atlas."

## 12. If I had more time (20s)
"CI/CD with server tests, React Query for server state, S3 for durable uploads, wire up the
virtualization I already installed, and add a version-history UI on top of the snapshot data I already
capture — plus fix two known bugs I found: malformed JSON returning 500, and a rate limiter that
no-ops behind the proxy."

---

### Delivery tips
- Full walkthrough ≈ 5 minutes; you can stop after section 8 for a ~3-minute version, or sections
  1–4 for ~90 seconds.
- Lead every subsystem with the **why**, then the **how**, then the **trade-off**.
- Keep two debugging stories loaded (OAuth cookie, Linux binaries) and the CRDT⇄DB decision as your
  depth centerpiece.
- Never claim users, traffic, or metrics — say "personal project, not load-tested with real users."
