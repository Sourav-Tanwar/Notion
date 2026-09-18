# 15 — Challenges & Debugging

Real problems from this project. Format: **Symptom → Root cause → Investigation → Fix → Why it
worked → Alternatives → Lesson → Interview story.** These are your strongest "tell me about a hard
bug" answers because they're true.

---

## Challenge 1 — Google OAuth login logs out on refresh (cookie stranded on the wrong host)

- **Symptom:** email/password login persisted across reloads, but **Google OAuth** login dropped to
  `/login` on refresh.
- **Root cause:** the OAuth callback ran on the **Render** host (`GOOGLE_REDIRECT_URI` → onrender.com),
  so `setRefreshCookie()` set the httpOnly cookie on `onrender.com`. The browser then landed on
  `vercel.app` with the access token in the URL fragment (works once, in memory). On refresh,
  `fetch('/api/auth/refresh')` went through the Vercel origin — where the Render cookie **isn't sent**
  — → 401 → logout.
- **Investigation:** noticed the difference was *only* the OAuth path; inspected `Set-Cookie` domain
  and saw it on `onrender.com`, not `vercel.app`.
- **Fix (config only):** route the callback **through the Vercel proxy** so the cookie lands on
  `vercel.app` (host-only): `GOOGLE_REDIRECT_URI = https://notion-client-one.vercel.app/api/auth/oauth/google/callback`
  (Vercel rewrites `/api/*` → Render), and add that URI in Google Console.
- **Why it worked:** cookie is now same-site with every subsequent API call.
- **Lesson:** with httpOnly cookies across two hosts, **which origin sets the cookie is everything**;
  funnel all API traffic through one origin.
- **Story hook:** "Two auth methods behaved differently on refresh — the difference told me it was a
  cookie-domain problem, not an auth-logic problem."

## Challenge 2 — CORS trailing-slash blocks all credentialed requests

- **Symptom:** "Failed to fetch" on login; OAuth bounced back to `/login`.
- **Root cause:** `CLIENT_ORIGIN` on Render had a **trailing slash**. `cors({origin})` echoes it
  verbatim → `Access-Control-Allow-Origin: https://app.vercel.app/`; the browser's `Origin` has **no**
  slash; **credentialed CORS requires an exact match** → every request blocked.
- **Fix:** `env.ts` strips trailing slashes from `clientOrigin` (and the OAuth redirect base).
- **Lesson:** credentialed CORS is byte-exact; normalize origins centrally.
- **Story hook:** "The allow-origin header looked right until I noticed a single trailing slash."

## Challenge 3 — Linux native binaries missing from a Windows-generated lockfile

- **Symptom:** Vercel/Render builds failed: "Cannot find module `@rollup/rollup-linux-x64-gnu`",
  "Could not load `sharp` linux-x64", `@esbuild/linux-x64` not found.
- **Root cause:** `package-lock.json` generated on Windows records only win32 optional binaries;
  transitive **Linux** optional deps get stripped, so the CI host can't resolve them.
- **Investigation:** errors pointed at `rollup/dist/native.js` and `vite/node_modules/esbuild` —
  platform-specific `.node` binaries.
- **Fix:** declare the Linux binaries as **explicit direct `optionalDependencies`** in
  `client/package.json`, pinned to the **nested** versions actually used
  (`@rollup/rollup-linux-x64-gnu@4.60.4`, `@esbuild/linux-x64@0.21.5` — Vite's esbuild, not tsx's);
  for `sharp`, `npm install --os=linux --include=optional` and commit the lockfile. Direct optional
  deps are **always** recorded in the lockfile and only install on the matching OS.
- **Why it worked:** the lockfile now carries both platforms; each host installs its own.
- **Lesson:** cross-OS `npm ci` needs platform binaries pinned explicitly; watch **nested** versions.
- **Story hook:** "A green local build failed in the cloud — classic 'works on my machine' caused by
  OS-specific native binaries in the lockfile."

## Challenge 4 — Fighting the platform's TypeScript version (→ run with `tsx`)

- **Symptom:** Render deploys failed because a newer TS turned `moduleResolution: node10` into a
  **fatal** deprecation (TS5107); pinning the TS version was unreliable (host resolved its own).
- **Fix:** stop compiling on the server — run directly with **`tsx`** (esbuild strips types at
  runtime); keep `tsc --noEmit` as a **local** type-check only. `tsx` is a runtime **dependency**.
- **Trade-off:** no deploy-time type gate (would restore via CI).
- **Lesson:** don't fight a platform's toolchain version; sidestep it and move type-checking into CI.

## Challenge 5 — A false "server 500" caused by the shell, not the server

- **Symptom:** every auth route appeared to return 500 during manual `curl` probing.
- **Root cause:** PowerShell's `curl` is `Invoke-WebRequest`, and `curl.exe -d '{"k":"v"}'` **strips
  the quotes**, so the server received `{k:v}` → body-parser `entity.parse.failed` → looked like a
  crash on every route.
- **Fix:** use `curl.exe` and pass JSON from a **file** (`--data "@tmp.json"`).
- **Lesson:** verify your **tooling** before blaming the service; reproduce a "500" with a clean
  client. *(This also exposed a real bug — see Challenge 6.)*

## Challenge 6 — Malformed JSON returns 500 instead of 400 [Potential issue, found while debugging]

- **Root cause:** `error.middleware.ts` doesn't special-case body-parser's `SyntaxError`
  (`err.type === 'entity.parse.failed'`, `statusCode 400`) → falls through to 500.
- **Fix (proposed):** map `err.type === 'entity.parse.failed'` / `err.statusCode` to **400**.
- **Lesson:** the global error handler should honor errors that already carry a status.

## Challenge 7 — Rate limiter silently no-ops behind the proxy [Potential issue]

- **Symptom:** auth endpoints never returned 429.
- **Root cause:** behind Render's proxy `req.ip` can be undefined →
  `express-rate-limit` logs `ERR_ERL_UNDEFINED_IP_ADDRESS` and **skips** limiting.
- **Fix (proposed):** ensure `trust proxy` (set to 1) yields a real `req.ip` from `X-Forwarded-For`,
  or supply a custom `keyGenerator` (`ipKeyGenerator`).
- **Lesson:** security middleware that **fails open** is worse than none — test that it actually
  throttles in the deployed topology.

---

## The CRDT ⇄ Mongo reconciliation problem (the deepest one) [Confirmed]

- **Problem:** Yjs owns live text; Mongo owns the queryable block tree. After collaborative edits,
  the two must agree without clobbering a user who is actively typing.
- **Approach:** the realtime process, on Hocuspocus persist, POSTs a small **`rev` beacon** (internal
  HTTP + shared secret) to the API; clients run `useBlocksLiveRefresh` to re-pull and **merge while
  preserving locally dirty blocks**; a debounced PM→HTML projection keeps a readable snapshot for
  search/exports.
- **Lesson:** define a clear **source of truth per concern** (text = CRDT, structure = DB) and keep
  the bridge tiny and idempotent.
- **Story hook:** "The interesting part wasn't real-time editing — Yjs gives that — it was keeping a
  CRDT and a document database consistent without overwriting an active typist."

> Where exact historical detail beyond the notes above is asked (dates, commit-by-commit order),
> answer from memory honestly and say "I'd have to check the commit history" rather than inventing
> specifics. *(Historical context required from developer.)*
