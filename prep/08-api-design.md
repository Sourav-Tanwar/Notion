# 08 — API Design

RESTful HTTP + JSON, prefix **`/api`**, ~**65 endpoints** across 12 routers. Realtime is a separate
WebSocket surface (see `06-realtime.md`). Streaming AI uses **SSE**.

---

## 1. Conventions [Confirmed]

- **Resource-oriented nesting:** `/api/pages/:id/permissions`, `/api/workspaces/:id/members/:userId`,
  `/api/blocks/page/:pageId`, `/api/comments/page/:pageId`.
- **HTTP methods:** GET (read), POST (create/action), PATCH (partial update), PUT (upsert grant),
  DELETE (remove). Actions that aren't pure CRUD use POST sub-resources
  (`/restore`, `/duplicate`, `/resolve`, `/react`, `/history/:rev/restore`).
- **Status codes:** 200/201, 204 (beacons/no-content), 400 (validation/captcha), 401 (auth),
  404 (not found / hidden existence), 409 (duplicate key), 429 (rate limit), 500 (unexpected).
- **Auth:** `Authorization: Bearer <access JWT>` + `x-workspace-id` header for workspace scoping;
  httpOnly refresh cookie for `/refresh`.
- **Validation:** every mutating endpoint runs a **Zod** schema via `validate(schema, source)`.

## 2. Full endpoint map (by module)

**auth** (`/api/auth`): `signup`, `login`, `refresh`, `logout`, `logout-all`, `me`,
`request-verify`, `verify-email`, `forgot-password`, `reset-password`, `change-password`,
`request-password-setup`, `set-password`, `sessions`, `oauth/google/authorize`,
`oauth/google/callback`.

**profile** (`/api/profile`): `PATCH /`, `POST /avatar`, `DELETE /avatar`.

**workspaces** (`/api/workspaces`): `GET /`, `POST /`, `PATCH /:id`, `DELETE /:id`,
`GET/PATCH/DELETE /:id/members[...]`, `GET/POST /:id/invitations`,
`POST /:id/invitations/:inv/resend`, `DELETE /:id/invitations/:inv`.
**invitations** (`/api/invitations`): `GET /:token`, `POST /:token/accept`.
**public** (`/api/public`): `GET /links/:token`, `POST /links/:token/unlock`,
`GET /links/:token/tree`, `GET /links/:token/pages/:pageId/blocks`.

**pages** (`/api/pages`): `GET /`, `GET /trash`, `GET /templates`, `POST /templates/:id/new`,
`POST /`, `POST /import`, `PATCH /reorder`, `PATCH /:id`, `DELETE /:id`, `POST /:id/restore`,
`POST /:id/duplicate`, `POST /:id/template`, `GET /:id/backlinks`, `DELETE /:id/permanent`,
`POST/DELETE /:id/cover`, `GET /:id/access`, `GET /:id/history`,
`GET /:id/history/:rev/preview`, `POST /:id/history/:rev/restore`,
`GET /:id/permissions/candidate`, `GET/PUT /:id/permissions`, `DELETE /:id/permissions/:userId`,
`GET/POST /:id/share-links`, `PATCH/DELETE /:id/share-links/:linkId`.

**blocks** (`/api/blocks`): `GET /page/:pageId`, `POST /bulk`, `POST /delete`, `PATCH /reorder`,
`POST /image`, `POST /file`, `GET /bookmark`.

**comments** (`/api/comments`): `GET/POST /page/:pageId`, `PATCH/DELETE /:id`,
`POST /:id/resolve`, `POST /:id/reopen`, `POST /:id/react`.

**notifications** (`/api/notifications`): `GET /`, `GET /unread-count`, `POST /read-all`,
`POST /:id/read`.

**database** (`/api/databases`): `POST /`, `GET /:id`, `PATCH /:id`, `POST /:id/columns`,
`PATCH/DELETE /:id/columns/:colId`, `POST /:id/columns/:colId/options`,
`DELETE /:id/columns/:colId/options/:optId`, `POST /:id/rows`, `PATCH/DELETE /:id/rows/:rowId`.

**search** (`/api/search`): `GET /?q=`.
**ai** (`/api/ai`): `GET /status`, `POST /command` (SSE), `POST /complete` (SSE).

## 3. Error responses [Confirmed]

Central `errorHandler` returns JSON `{ error, details? }`:
- ZodError → 400 with field details.
- `HttpError(status, message)` → that status.
- Mongo duplicate (11000) → 409 (`EmailInUse` / `UsernameTaken` / `DuplicateKey`).
- Anti-enumeration: signup/forgot-password always return 200 regardless of email existence.
- Page denial → 404 (not 403) to avoid existence leaks.

## 4. Idempotency [Confirmed]
- `POST /api/blocks/bulk` is **idempotent** — keyed by client UUIDs, re-sending the same batch
  converges. Good for retry-on-failure autosave.
- Beacons return **204**; `notify-blocks` on a page with no open room returns 204 (no-op).

## 5. Pagination / filtering / sorting [Confirmed / Improvement]
- Lists are workspace/page-scoped, returned sorted by `order` or `createdAt`. **No cursor
  pagination yet** — fine at current scale; add `{createdAt,_id}` cursors before scaling
  (`04-database.md` §7).

## 6. Versioning [Confirmed / Improvement]
- **No API version prefix** (`/api/...`, not `/api/v1/...`). Acceptable for a solo project;
  **[Improvement]** add `/v1` before exposing to third parties so breaking changes are safe.

## 7. Consistency & things I'd improve
- **Consistent:** layered validation, resource nesting, status-code discipline, guard ordering.
- **[Improvement] mixed method semantics:** some actions are POST sub-resources (fine) — document
  them so consumers know they're non-idempotent.
- **[Improvement] uniform pagination** wrapper `{ items, nextCursor }` across list endpoints.
- **[Improvement] a machine-readable error `code`** field (not just a message string) for clients.
- **[Improvement] OpenAPI/Swagger** spec generated from the Zod schemas (zod-to-openapi) for docs
  and typed clients.

## 8. Likely questions
1. Why 404 instead of 403 on a page you can't access? *(don't leak existence.)*
2. Which endpoint is idempotent and why does that matter? *(bulk upsert; safe retries.)*
3. How is a request validated before it hits business logic? *(Zod `validate` middleware.)*
4. How do you scope every request to the right tenant? *(`x-workspace-id` + `workspaceGuard` +
   denormalized `workspaceId`.)*
5. How would you version this API without breaking existing clients?
6. Why SSE (not WebSocket) for AI responses? *(one-way token stream, simpler, works over HTTP.)*
