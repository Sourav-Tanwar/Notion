# 09 — Performance

> Format per optimization: **Problem → Solution → Why it works → Trade-off → How to measure.**
> No invented numbers — measurement methods only.

---

## Frontend

### 1. Uncontrolled editor (don't re-render on keystrokes) [Confirmed]
- **Problem:** rendering every keystroke through React state is expensive in a doc editor.
- **Solution:** inline text lives in **ProseMirror/Yjs**, not React state. React only re-renders on
  **structural** changes (add/remove/reorder/type-change).
- **Why:** ProseMirror mutates the DOM surgically; React never sees per-character updates.
- **Trade-off:** you manage focus imperatively (`useFocusBlock`) and fight React's model.
- **Measure:** React DevTools Profiler — confirm no `BlockNode` renders while typing.

### 2. Normalized store + selective subscriptions [Confirmed]
- **Problem:** editing one block re-rendering the whole tree.
- **Solution:** `byId`/`childrenOf`/`rootByPage` + memoized selectors + `useShallow`.
- **Why:** a component subscribes to the smallest slice; unrelated updates don't notify it.
- **Trade-off:** more store bookkeeping than a nested tree.
- **Measure:** Profiler render counts before/after editing a leaf.

### 3. `React.memo` / `useMemo` / `useCallback` [Confirmed]
- **Applied to:** `BlockNode`, `BlockList`, `BlockContent`, `SlashMenu`, block renderers; memoized
  numbered-index and filtered menu results; stable callbacks to memoized children.
- **Why:** skips reconciliation for unchanged subtrees.
- **Trade-off:** referential-stability discipline; over-memoizing can add noise.
- **Measure:** Profiler "why did this render".

### 4. Debounced autosave & serialization [Confirmed]
- **Problem:** a network write per keystroke would flood the API.
- **Solution:** **600ms** debounced block autosave (batched bulk upsert) + **400ms** debounced
  PM→HTML serialization to Zustand.
- **Why:** coalesces bursts of typing into one batched request.
- **Trade-off:** up to ~600ms of unsaved window (covered by CRDT + IndexedDB, so not data loss).
- **Measure:** Network tab request count while typing a paragraph.

### 5. Route-level code splitting [Confirmed]
- **Problem:** shipping the whole app (incl. ProseMirror/Yjs) on first paint.
- **Solution:** `lazy()` + `Suspense` per route (Editor, auth pages, settings, public).
- **Why:** the editor chunk only loads when you open a page.
- **Trade-off:** a suspense fallback on first navigation.
- **Measure:** build output chunk sizes; Lighthouse first-load JS.

### 6. Offline / IndexedDB cache [Confirmed]
- **Problem:** blank editor until the socket syncs.
- **Solution:** `y-indexeddb` hydrates the doc **before** connecting.
- **Why:** instant content from local cache; deltas sync after.
- **Trade-off:** local storage growth per page.
- **Measure:** time-to-first-content offline vs online.

### 7. Optimistic updates [Confirmed]
- Local mutation is applied immediately (blocks, db cells, session revoke); server confirms later.
- **Measure:** perceived latency (UI updates at input time, not on response).

### 8. [Potential issue] no list virtualization yet
- `react-window` is installed and `BlockList` notes 1k+ virtualization, but it's **not wired**.
- **Improvement:** virtualize flat long pages; nested children complicate it — measure with a
  1k-block page in the Profiler first.

---

## Backend

### 1. Index-backed hot queries [Confirmed]
- **Problem:** sidebar/blocks/membership lookups on every navigation.
- **Solution:** compound indexes (`{workspaceId,parentId,order}`, `{pageId,parentId,order}`,
  unique `{userId,workspaceId}`) following the ESR (equality→sort→range) rule.
- **Measure:** `explain('executionStats')` — confirm `IXSCAN`, not `COLLSCAN`.

### 2. Per-request permission cache (N+1 avoidance) [Confirmed]
- **Problem:** bulk page ops resolving permissions could re-walk ancestors repeatedly.
- **Solution:** `PermissionCache` memoizes workspace + ancestor lookups per request;
  `bulkPageAccessGuard` reuses it.
- **Measure:** query count per bulk request.

### 3. Bulk block writes [Confirmed]
- **Problem:** one request per changed block.
- **Solution:** `POST /api/blocks/bulk` upserts many + deletes many in batched writes.
- **Measure:** DB op count per autosave flush.

### 4. Snapshot cap & throttled history [Confirmed]
- 5MB Yjs snapshot cap prevents OOM; history archive throttled to ≥60s / keep 20 — bounds write
  amplification from rapid saves.

### 5. Image pipeline [Confirmed]
- `sharp` resizes/optimizes uploads (avatars/covers/images) → smaller payloads served with
  long-lived immutable cache headers (7d) in prod.

### 6. [Potential issue] search may be a scan
- Verify `$text`/Atlas Search index; a regex scan is O(docs) and won't scale.

---

## Network

- **Fewer requests:** batched block writes; debounced saves; `x-workspace-id` header avoids extra
  round-trips.
- **Caching:** static uploads immutable 7d in prod; Vercel serves hashed asset bundles.
- **Payload size:** blocks fetched per page (not whole workspace); AI streamed via SSE (progressive).
- **[Improvement]:** enable gzip/brotli compression on the API (`compression` middleware) and put a
  CDN in front of uploads (S3 driver already abstracted).

---

## What to say about measurement
Be honest: this is a personal project without production telemetry. The **right** answer is to add
**RUM (web-vitals)** on the client, **`explain()`** + slow-query logs on Mongo, and simple
server timing/metrics (Prometheus) — then optimize against real data rather than guesses. Never
quote invented percentages.
