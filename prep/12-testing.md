# 12 — Testing

**Framework:** Jest + `ts-jest` + React Testing Library + `@testing-library/user-event`, jsdom
environment. Tests live under `client/src/**/__tests__/`. **~51 tests across 12 files pass.**
**No server-side tests exist** — be honest about this.

---

## 1. What's actually tested [Confirmed]

| Area | File | What it covers |
|---|---|---|
| Blocks store | `stores/__tests__/blocks.store.test.ts` | normalized mutations, insert/remove/indent/reorder, undo/redo, dirty tracking |
| Auth store | `stores/__tests__/auth.store.test.ts` | login/hydrate/session lifecycle |
| Auth invalidation | `stores/__tests__/auth.store.invalidation.test.ts` | tokenVersion / session invalidation behavior |
| Security | `stores/__tests__/phase4.security.test.ts` | security-related store behavior |
| Theme | `theme/__tests__/store.test.ts`, `manager.test.ts` | theme state + system preference resolution |
| Auth channel | `lib/__tests__/authChannel.test.ts` | cross-tab BroadcastChannel signaling |
| Asset URL | `lib/__tests__/assetUrl.test.ts` | scheme allow-list (rejects `javascript:`/`file:`) |
| Avatar | `components/__tests__/Avatar.test.tsx` | rendering/fallback |
| Block content | `features/editor/__tests__/BlockContent.test.tsx` | contentEditable surface behavior |
| Auth schemas | `features/auth/__tests__/schemas.test.ts` | Zod validation rules |
| AI apply | `features/editor/ai/__tests__/applyResult.test.ts` | AI result insertion logic |

## 2. Types of testing present [Confirmed]
- **Unit tests** — stores, utils, schemas, pure logic (the majority).
- **Component tests** — Avatar, BlockContent via RTL.
- **No integration/API/e2e tests.** No supertest, no Playwright/Cypress.

## 3. Mocking approach [Confirmed]
- `client/src/tests/setup.ts` + `styleMock.ts` (CSS import stub). Network/`http.ts` is mocked in
  store tests; BroadcastChannel is exercised directly for `authChannel`.

## 4. Coverage [Confirmed]
- A `client/coverage/` report exists (Istanbul/lcov) — coverage is collected. It's **client-only**;
  server coverage is 0%.

## 5. What SHOULD be tested (gaps to name proactively)

**High-value, currently untested:**
- **Server permission resolver** (`pagePermissions.resolve`) — inheritance, baselines, guest grants.
  This is security-critical.
- **Refresh-token rotation + reuse detection** (`token.service.rotate`) — the family-revocation path.
- **`pageAccessGuard` returning 404 not 403** on denial.
- **CRDT ⇄ Mongo reconciliation** (the `rev` beacon; `useBlocksLiveRefresh` merge preserving dirty).
- **Bulk upsert idempotency** and autosave retry.
- **Public share password gate** and expiry.

**How I'd test them:**
- **API/integration:** `supertest` against the Express app with an in-memory Mongo
  (`mongodb-memory-server`) — sign up, create workspace/page, assert permission matrix and rotation.
- **Concurrent CRDT edits:** two `Y.Doc`s + a shared update channel; apply interleaved updates,
  assert convergence (Yjs is deterministic, so this is unit-testable without a socket).
- **E2E collaboration:** Playwright with two browser contexts editing the same page; assert both see
  each other's text + presence.
- **Component:** slash menu, mention insertion, drag reorder via user-event.

## 6. Interview-style testing questions (with the point they probe)

1. **"Why did you test the blocks store so heavily?"** — it's the core invariant (normalized tree +
   undo + dirty tracking); a bug there corrupts documents.
2. **"Why isn't the editor's live text unit-tested?"** — it's owned by ProseMirror/Yjs (well-tested
   libraries); I test *my* glue (serialization, structural mutations) instead, and would add a Yjs
   convergence test for the reconciliation logic.
3. **"How would you test that two concurrent updates don't lose data?"** — deterministic Yjs test:
   two docs, interleave updates, assert equal final state; plus a Playwright two-context e2e.
4. **"How would you test an API failure path?"** — mock `http.ts` to reject; assert the store sets
   `error` and (for autosave) re-marks blocks dirty; supertest for real 4xx/5xx mapping.
5. **"What's your riskiest untested area?"** — the **permission resolver** and **refresh rotation**;
   both are security-critical and server-side, where I currently have zero automated coverage.
6. **"What would you put in CI first?"** — `typecheck` + jest on the client, then supertest for
   auth/permissions, gating deploys.

## 7. Honest summary to say out loud
> "Client logic — stores, auth flow, security utils — has unit + component coverage (~51 tests). The
> **gap I'd close first** is server-side integration tests for permissions and refresh-token
> rotation, plus a Yjs convergence test and a two-user Playwright e2e for collaboration. I'd wire all
> of that into GitHub Actions to gate deploys, which the project doesn't have yet."
