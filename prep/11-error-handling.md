# 11 — Error Handling & Reliability

---

## 1. Frontend error handling [Confirmed]

- **HTTP layer (`http.ts`):** non-2xx responses throw; **401 triggers a single coalesced
  `/refresh`** then one retry; if refresh fails, the access token is cleared and the app falls to
  `guest`. Errors bubble to the calling store, which sets an `error` field consumed by the UI.
- **Auth store:** exposes `status` (`idle`/`hydrating`/`authed`/`guest`) + `error`; forms show
  validation (Zod) and server errors.
- **Autosave failure:** blocks are **re-marked dirty** and retried on the next flush — no silent
  data loss.
- **Optimistic rollback:** session revoke and DB mutations restore prior state on failure.
- **[Potential issue]** verify a top-level **React error boundary** exists around the Editor;
  contentEditable/PM errors should be contained, not white-screen the app. **[Improvement]** add
  one with a "reload page" fallback.

## 2. Backend error handling [Confirmed]

- `asyncHandler` / try-catch route rejections to a **central `errorHandler`**:
  - ZodError → 400 (+ field details), `HttpError` → its status, Mongo 11000 → 409.
- `notFound` returns JSON 404 for unmatched routes.
- **Anti-enumeration:** auth endpoints return uniform responses regardless of account existence.
- **[Potential issue]** body-parser `SyntaxError` currently maps to **500** (should be 400) — name
  this as a known bug + easy fix (`err.type === 'entity.parse.failed' → 400`).

## 3. Realtime reliability [Confirmed]
- Socket auth failures **throw** (never admit as writer).
- Snapshot > 5MB ⇒ persistence pauses but the live room keeps serving (data not lost in-session).
- Provider auto-reconnects; token refresh forces reconnect; `StatusPill`/`OfflineBanner` surface
  state; `y-indexeddb` preserves offline edits until resync.

## 4. Retries / timeouts / fallbacks [Confirmed / Improvement]
- **Retries:** autosave retries dirty blocks; refresh retried once.
- **Timeouts:** link-preview fetch is time-bounded (SSRF guard). **[Improvement]** add explicit
  timeouts/AbortController to all client fetches and a bounded retry/backoff for idempotent GETs.
- **Fallbacks:** AI auto-disables without a key; editor loads from REST + IndexedDB when realtime is
  down.

## 5. Logging & monitoring [Confirmed / Improvement]
- `audit.service.ts` logs security-relevant events (login success/failure, refresh reuse,
  suspicious IP/UA drift, password resets). Console logging elsewhere.
- **[Improvement]** structured logging (pino), request IDs, error aggregation (Sentry), uptime +
  metrics. No production monitoring today — say so honestly.

---

## 6. Failure-scenario walkthroughs (interview gold)

### "Database goes down. What happens?"
- **Now:** Mongoose operations reject → central handler returns 500; the app surfaces an error. The
  editor still shows cached content (IndexedDB) but can't persist structural changes. Realtime text
  keeps merging in memory but `onStoreDocument` fails.
- **Better:** health checks + ret/backoff on transient errors, a read-through cache so reads survive
  brief outages, and a maintenance banner.

### "API returns 500. What happens?"
- **Now:** the store's `error` is set; UI shows failure; autosave keeps the block dirty and retries.
- **Better:** typed error codes, user-friendly messaging, Sentry capture, circuit-breaker on repeated
  failures.

### "WebSocket disconnects. What happens?"
- **Now:** provider reconnects automatically; `StatusPill` shows disconnected; edits continue
  locally (IndexedDB) and merge on reconnect. Token refresh forces a fresh handshake.
- **Better:** exponential backoff caps + a "trying to reconnect" affordance (present via banner).

### "User loses internet. What happens?"
- **Now:** **offline-first** — edits apply to the local Y.Doc, persist to IndexedDB, and sync when
  back online. REST calls fail until reconnect.
- **Better:** queue failed REST mutations (structural ops) for replay on reconnect.

### "Two users edit the same block simultaneously. What happens?"
- **Now:** **Yjs CRDT merges conflict-free** — both edits converge; per-user undo via origin-aware
  `yUndoPlugin`. This is the headline reliability feature.

### "Two users do conflicting *structural* ops (both reorder)."
- **Now:** last-writer-wins via idempotent UUID upsert; the `rev` beacon makes both clients refetch
  and converge on the server's order.
- **Honest caveat:** structural + inline are two systems; the reconciliation window is the main risk
  area. **[Improvement]** move structural ops into the CRDT too, or make Yjs the single authority and
  project to Mongo server-side.

### "A malicious client pastes a 1GB document."
- **Now:** JSON 2MB cap + Yjs **5MB snapshot cap** refuse persistence; upload caps bound files.

## 7. Likely questions
1. Walk me through your 401 handling. *(coalesced refresh + single retry.)*
2. How do you avoid losing edits on a failed save? *(dirty-remark + retry; CRDT/IndexedDB backstop.)*
3. What's your worst reliability risk? *(Mongo/Yjs reconciliation — be candid + give the fix.)*
4. How would you add observability from zero? *(pino + request IDs + Sentry + metrics + `explain()`.)*
