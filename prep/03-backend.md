# 03 — Backend Mastery

Stack: **Node + Express 4 + TypeScript (run via `tsx`) + Mongoose 8 + Zod + JWT + bcryptjs +
Hocuspocus/Yjs + helmet + cors + express-rate-limit + multer + sharp**.

---

## 1. Architecture & request lifecycle [Confirmed]

Layered, feature-module structure: `modules/<x>/{routes,controller,service,model,schema}`.

```
request
 → helmet → cors(credentials) → express.json(2mb) → cookieParser
 → router (per module)
 → guards: authGuard → workspaceGuard → pageAccessGuard → rate limiter → validate(zod)
 → controller (HTTP glue: read req, call service, shape response)
 → service (business logic, DB access)
 → model (Mongoose)
 → response  |  errors → errorHandler (central)  |  unmatched → notFound
```

- `app.set('trust proxy', 1)` — correct client IP behind Render's proxy.
- Static uploads served from `/${UPLOAD_DIR}` (7d immutable cache in prod).
- **Controllers stay thin**; logic lives in **services** — good separation for testing/reasoning.
- `asyncHandler` wraps async routes so rejections reach the error handler.

## 2. Middleware catalog [Confirmed]

| Middleware | Job |
|---|---|
| `authGuard` | Verify `Authorization: Bearer` access JWT (HS256); attach `userId`, `userRole`, `tokenVersion` |
| `requireFreshUser` | DB check that token `tv` matches `User.tokenVersion` (catch password-change invalidation) |
| `requireVerifiedEmail` | Gate when `EMAIL_VERIFICATION_REQUIRED=true` |
| `requireRole(...)` | Global RBAC (user/admin) |
| `workspaceGuard` | Resolve workspace from `:workspaceId` or `x-workspace-id`; load `Membership`; attach `workspaceRole` |
| `requireCapability(cap)` | Capability matrix check by workspace role |
| `pageAccessGuard(level, param)` | Resolve effective page level via inheritance; **404** (not 403) on no-access to avoid existence leaks |
| `bulkPageAccessGuard` | Same, for batch payloads; caches per request |
| `publicShareGuard` | Token-based anonymous access; optional password; visible subtree |
| `requireCaptcha` | Cloudflare Turnstile verification (only if secret configured) |
| `validate(schema, src)` | Zod-parse `body`/`query`/`params`; 400 with details on failure |
| rate limiters | `loginLimiter`, `signupLimiter`, `passwordResetLimiter`, `sensitiveLimiter`, `restoreLimiter`, `aiLimiter`, `aiAutocompleteLimiter` |
| `errorHandler` | Map Zod→400, HttpError→status, Mongo 11000→409 |
| `notFound` | JSON 404 catch-all |

## 3. Modules & responsibilities [Confirmed]

- **auth** — signup/login/refresh/logout, verification, password reset/change/set, OAuth, sessions.
- **profile** — update profile, avatar upload/clear.
- **workspaces** — CRUD, members, roles, invitations, public share links, page permissions.
- **pages** — CRUD, trash/restore, duplicate, templates, import markdown, reorder, cover, history,
  backlinks, permissions, share links.
- **blocks** — list/bulk-upsert/bulk-delete/reorder, image/file upload, bookmark preview.
- **comments** — threads, replies, edit/delete, resolve/reopen, reactions.
- **notifications** — list, unread count, mark read/all.
- **database** — inline DB schema (columns/options) + rows/cells.
- **search** — workspace full-text, access-filtered.
- **ai** — status, streamed command, streamed autocomplete (Groq SSE).

## 4. API inventory (representative — full list in `08-api-design.md`)

Total: **~65 endpoints** across the modules above. Auth prefix `/api`.

| Method | Endpoint | Purpose | Auth | Request | Response | DB ops |
|---|---|---|---|---|---|---|
| POST | `/api/auth/login` | Password login | captcha | `{email,pw,captchaToken}` | `{accessToken,user}` + cookie | find user, insert RefreshToken |
| POST | `/api/auth/refresh` | Rotate token | cookie | — | `{accessToken}` + cookie | verify/rotate RefreshToken family |
| GET | `/api/pages` | List pages | authGuard+ws | — | `Page[]` | find pages by workspace |
| POST | `/api/pages` | Create page | ws+cap(page.create) | `{title,parentId}` | `Page` | insert Page |
| PATCH | `/api/pages/:id` | Update meta | pageAccess(edit) | `{title,icon,...}` | `Page` | update Page |
| GET | `/api/blocks/page/:pageId` | List blocks | pageAccess(view) | — | `Block[]` | find blocks sorted |
| POST | `/api/blocks/bulk` | Upsert blocks | ws+validate | `Block[]` | `{ok}` | bulkWrite upsert + rev beacon |
| POST | `/api/comments/page/:pageId` | Add comment | pageAccess(comment) | `{body,blockId,parentId}` | `Comment` | insert + notify mentions |
| GET | `/api/search?q=` | Search | ws | `q` | `SearchHit[]` | query pages/blocks |
| POST | `/api/ai/command` | AI transform | authGuard+aiLimiter | `{action,text,context}` | SSE stream | — (Groq call) |

## 5. The 10 most important endpoints — full execution flow

### 1) `POST /api/auth/login`
`loginLimiter → validate → requireCaptcha → controller → authService.login`:
find user by email → **timing-safe bcrypt.compare** (runs even if user missing) →
`tokenService.signAccess` (JWT 15m, `{sub,tv,role}`) + `issueRefresh` (48-byte token, store
SHA-256 hash + family + IP/UA) → `setRefreshCookie` (httpOnly) → return `{accessToken,user}`.

### 2) `POST /api/auth/refresh`
Read cookie → `tokenService.rotate`: SHA-256 the presented token → look up →
if `revokedAt` set ⇒ **reuse detected** ⇒ revoke whole family (audit) ⇒ 401 → else issue new
refresh in same family, mark old `replacedBy`, sign new access, set new cookie.

### 3) `GET /api/pages` (list workspace tree)
`authGuard → workspaceGuard → pagesController.list → pagesService.list`: find non-archived pages
in workspace accessible to the actor (respects access). Feeds the sidebar tree
(`{workspaceId,parentId,order}` index).

### 4) `POST /api/pages` (create)
`workspaceGuard → requireCapability(page.create) → validate → pagesService.create`: allocate
ObjectId, set `order`, insert Page (root or child).

### 5) `PATCH /api/pages/:id` (update / rename)
`pageAccessGuard(edit) → validate → pagesService.update`: update title/icon/cover/layout flags.
Permission resolved by inheritance before the write.

### 6) `GET /api/blocks/page/:pageId`
`pageAccessGuard(view, 'pageId') → blocksService.listByPage`: find blocks by page sorted by
`order`; returned as the initial editor payload (CRDT then takes over for live text).

### 7) `POST /api/blocks/bulk` (autosave)
`workspaceGuard → validate → blocksService.upsertMany`: idempotent upsert keyed by
client-generated UUID; detect new/removed ids (structural) → ping realtime
`/__internal__/notify-blocks` so peers refetch.

### 8) `POST /api/comments/page/:pageId`
`pageAccessGuard(comment,'pageId') → validate → commentsService.create`: insert root/reply;
parse `@mentions` → emit `Notification` rows for mentioned users.

### 9) `POST /api/workspaces/:id/invitations`
`workspaceGuard → requireCapability(workspace.member.invite) → validate → invitationsService.create`:
generate 32-byte token, store SHA-256 hash, 7-day TTL, partial-unique index prevents duplicate
pending invites, send email.

### 10) `POST /api/pages/:id/history/:revisionId/restore`
`pageAccessGuard(edit) → restoreLimiter → controller` forwards to the **realtime** process
(`/__internal__/restore`) which re-fetches the `DocHistory` row, applies it to the live Y.Doc,
and writes a new "restore" history entry. Cross-process by design (the realtime side owns the
live doc).

## 6. Async operations & HTTP status codes [Confirmed]

- All handlers `async`; `asyncHandler`/try-catch route errors to the central handler.
- Status mapping: 200/201 success, 204 no-content (beacons), 400 validation/captcha, 401 auth,
  404 not-found / hidden-existence, 409 duplicate (Mongo 11000), 429 rate limit, 500 unexpected.

## 7. Security highlights (full detail in `05-auth-security.md`) [Confirmed]

- helmet, CORS with credentials + exact-origin match (trailing slash stripped in `env.ts`).
- bcrypt (12 rounds), SHA-256 hashing of refresh/verification/invite/share tokens (never store raw).
- SSRF-guarded link previews; snapshot byte cap (5MB) to prevent OOM; anti-enumeration on auth
  responses.

## 8. [Potential issues] worth naming yourself
- `errorHandler` returns **500** for body-parser `SyntaxError` (should map to 400).
- Rate limiters can no-op if `req.ip` is undefined behind the proxy → verify key generator.
- In-memory OAuth-state & rate-limit stores block multi-instance scaling → move to Redis.
- No server-side automated tests → add supertest coverage for auth/permissions.
