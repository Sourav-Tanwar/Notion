# 05 — Authentication & Security

> Only features present in the code are described. Where something is a gap, it's marked
> **[Potential issue]** or **[Improvement]**.

---

## 1. Authentication flow [Confirmed]

**Two token model:**
- **Access token** — JWT (HS256), TTL **15m**, payload `{ sub: userId, tv: tokenVersion, role }`,
  signed with `JWT_ACCESS_SECRET`. Verified statelessly by `authGuard` on every protected request.
  Stored **in browser memory only** (never localStorage) → mitigates XSS token theft.
- **Refresh token** — opaque **48-byte random** value. Only its **SHA-256 hash** is stored in
  `RefreshToken` with `family`, `replacedBy`, `revokedAt`, `ip`, `userAgent`, `expiresAt` (TTL).
  Delivered as an **httpOnly cookie** (JS can't read it). TTL **30 days**.

**Login:** `bcrypt.compare` (rounds **12**) executed **timing-safe** even when the user doesn't
exist (anti-enumeration) → issue access + refresh → set cookie.

**Refresh rotation with reuse detection:** every `/refresh` issues a new token in the **same
family** and marks the old one `replacedBy`. If a token that's already been rotated (`revokedAt`
set) is presented again, the server treats it as a **stolen-token replay** and **revokes the whole
family** (audit-logged). This is the OWASP-recommended refresh rotation pattern.

**Session invalidation:** password change / reset / `logout-all` **bumps `User.tokenVersion`** and
revokes all refresh tokens. Because the access JWT carries `tv`, `requireFreshUser` (or the next
refresh) detects the mismatch → old access tokens are effectively killed within their ≤15m window.

## 2. OAuth (Google) [Confirmed]

- `/oauth/google/authorize` generates a **CSRF state** (random), stored **in-memory** with a
  **10-minute TTL**, then redirects to Google.
- Callback verifies + consumes state, exchanges the code server-side for tokens, fetches the
  profile, and does **find-or-link** by `(provider, providerAccountId)` then by email. New users
  inherit `emailVerified` from the provider.
- **[Potential issue]** in-memory state won't survive multi-instance scaling → move to Redis.

## 3. Captcha [Confirmed]

- **Cloudflare Turnstile** via `requireCaptcha` on signup/login/forgot-password/request-verify —
  **only when `TURNSTILE_SECRET` is set**. `TURNSTILE_FAIL_OPEN=false` by default (fail **closed**:
  security over availability).

## 4. Password & token handling [Confirmed]

| Secret | Storage | Notes |
|---|---|---|
| Password | `bcrypt` hash (12 rounds) | nullable for OAuth-only users |
| Refresh token | SHA-256 hash | raw shown once to client (cookie) |
| Verification/reset/set token | SHA-256 hash, single-use (`consumedAt`), TTL | 32-byte random |
| Invitation token | SHA-256 hash, 7-day TTL | 32-byte random |
| Share-link token | SHA-256 hash | 48-byte; optional bcrypt password |

Helpers: `utils/crypto.ts` (`randomToken`, `sha256`, `timingSafeEqual`), `utils/cookies.ts`
(cookie flags).

## 5. Authorization [Confirmed]

- **Workspace roles:** `guest(0) < member(1) < admin(2) < owner(3)` via `Membership` +
  capability matrix (`requireCapability`). `canAssignRole` prevents privilege escalation (you can't
  grant a role above your own; only an owner can mint owners).
- **Page permissions:** `none < view < comment < edit < full`. `pageAccessGuard(level)` →
  `pagePermissionsService.resolve`: owner/admin ⇒ full; member baseline edit; guest baseline none;
  explicit `PagePermission` grants on the page **or any ancestor** raise the level (inheritance),
  cached per request. **Denies return 404**, not 403, to avoid leaking page existence.
- **Public shares:** anonymous bearer token (hashed), optional bcrypt password gate, optional
  expiry, optional subpage inclusion; read-only.

## 6. Cookies / CORS / headers [Confirmed]

- `helmet()` with `crossOriginResourcePolicy: cross-origin` (so uploads load cross-origin).
- `cors({ origin: clientOrigin, credentials: true })` — `clientOrigin` has trailing slash stripped
  in `env.ts` because credentialed CORS needs an **exact** origin match (a stray `/` silently
  breaks everything).
- Refresh cookie: `httpOnly`, `secure` in prod, `SameSite=None` in prod (cross-site) / `Lax` in dev.
  In production the SPA reaches the API through Vercel's same-site rewrite, so the cookie lands on
  the SPA origin and survives reloads.

## 7. Threat-by-threat table

For each: **Current → Risk → Why it matters → Interview question → Better.**

### XSS
- **Current:** access token in memory (not localStorage); refresh cookie httpOnly; React escapes by
  default; `assetUrl.ts` rejects `javascript:`/`file:` schemes.
- **Risk:** the editor renders **HTML** (`Block.text`) — if that HTML isn't sanitized, stored XSS is
  possible. **[Potential issue: verify sanitization on render/paste.]**
- **Question:** "Your blocks store HTML — how do you stop stored XSS?"
- **Better:** sanitize on input/paste and/or render through a strict allow-list
  (DOMPurify or a schema-constrained serializer). ProseMirror's schema already constrains inline
  marks, which helps for PM-authored content — confirm paste paths.

### CSRF
- **Current:** access token is a Bearer header (not auto-sent), so most mutations aren't CSRF-able.
  The refresh cookie **is** auto-sent, but `SameSite` limits cross-site use; OAuth uses a state
  param.
- **Risk:** `/refresh` relies on the cookie — `SameSite=None` in prod widens exposure.
- **Question:** "Is `/refresh` CSRF-safe?"
- **Better:** add a double-submit CSRF token or `SameSite=Strict` where the proxy allows; the
  same-site Vercel rewrite already mitigates most of it.

### Injection (NoSQL)
- **Current:** **Zod validation** on inputs + Mongoose typed queries reduce operator-injection risk.
- **Question:** "How do you prevent `$gt`-style NoSQL injection?"
- **Better:** ensure query values are validated/coerced (Zod already does) and never spread raw
  request objects into queries.

### SSRF (link preview / bookmarks)
- **Current:** `linkPreview.service.ts` is **SSRF-guarded** (public hosts only, capped body,
  timeout).
- **Question:** "Your server fetches arbitrary URLs for bookmarks — how do you stop SSRF to
  169.254.x / internal services?" *(host allow/deny, DNS resolution check, no redirects to private
  ranges.)*

### DoS / resource exhaustion
- **Current:** JSON body cap (2MB), Yjs snapshot cap (**5MB**, refuses to persist beyond it),
  upload size caps (avatar 2MB, image 8MB, file 100MB), rate limiters.
- **[Potential issue]** rate limiters can no-op if `req.ip` is undefined behind the proxy — verify.

### Rate limiting
- **Current:** per-endpoint limiters (login 10/15m, signup 20/1h, reset 5/1h, sensitive 30/1m, AI
  30/1m, autocomplete 80/1m, restore 60/1h).
- **[Potential issue]** in-memory store ⇒ per-instance only; keys must resolve to the real client IP.

### Secrets / env
- **Current:** all secrets via `env.ts`; server **refuses to boot** without `MONGO_URI` +
  JWT secrets. Groq key server-side only; AI auto-disables without it.
- **Better:** ensure `NODE_ENV=production` on Render (affects cookie `Secure`/`SameSite`),
  and `INTERNAL_BROADCAST_SECRET` is a strong non-default value.

## 8. Things to memorize
- Access JWT 15m, refresh 30d, bcrypt 12 rounds, refresh stored as SHA-256 hash, family rotation +
  reuse detection, `tokenVersion` for global invalidation, 404-not-403 on page denial, captcha
  fail-closed, snapshot cap 5MB.
