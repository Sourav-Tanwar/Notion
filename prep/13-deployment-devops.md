# 13 — Deployment & DevOps

---

## 1. Topology [Confirmed]

| Piece | Host | Command / config |
|---|---|---|
| SPA (client) | **Vercel** | build `tsc -b && vite build`; `client/vercel.json` |
| REST API | **Render** | start `tsx src/index.ts` |
| Realtime | **Render** (separate service) | start `tsx src/realtime/index.ts` |
| Database | **MongoDB Atlas** | `MONGO_URI` |
| AI | **Groq API** | server-side, optional |

Live: SPA `https://notion-client-one.vercel.app`, API `https://notion-7nj1.onrender.com`.

## 2. The `tsx`-at-runtime decision [Confirmed — important & interesting]

The server does **not** compile with `tsc`. `server/package.json` `build` is an **echo no-op**; the
service runs directly with **`tsx`** (esbuild-based, strips types at runtime).

- **Why:** Render kept installing a newer TypeScript that turned `moduleResolution: node10` into a
  **fatal** deprecation (TS5107), and pinning the compiler version was unreliable (hoisted/own TS).
  Running with `tsx` sidesteps type-checking and tsconfig resolution entirely at deploy time.
- **Trade-off:** **no type-check gate at deploy** — types are validated only locally
  (`npm run typecheck`) / in CI (which doesn't exist yet). `tsx` must be a **dependency** (not
  devDependency) so it survives on the runtime host.
- **Interview framing:** a pragmatic call to stop fighting the platform's compiler version; the
  correct hardening is a CI `typecheck` step before deploy.

## 3. Cross-origin SPA ↔ API (the tricky part) [Confirmed]

- The browser must only hit **one origin** so the httpOnly refresh cookie survives reloads. Solution:
  `client/vercel.json` **rewrites** `/api/:path*` → the Render API, and the client fetches
  **relative** `/api/...`. Cookie lands on the Vercel origin (same-site) and persists.
- `env.ts` **strips trailing slashes** from `CLIENT_ORIGIN` because credentialed CORS requires an
  **exact** origin match — a stray `/` silently breaks every cross-site request.
- Refresh cookie `SameSite=None; Secure` in prod (requires `NODE_ENV=production` on Render), `Lax`
  in dev.

## 4. Cross-platform native binaries (real deployment pain) [Confirmed]
- `sharp` and `esbuild`/`rollup` ship **OS-specific** native binaries. A `package-lock.json`
  generated on Windows omits the Linux binaries, so Render/Vercel builds failed
  ("Could not load sharp linux-x64", "@rollup/rollup-linux-x64-gnu not found").
- **Fix:** declare the Linux binaries as **explicit `optionalDependencies`** in `client/package.json`
  (`@esbuild/linux-x64`, `@rollup/rollup-linux-x64-gnu`, pinned to the nested versions) so the
  lockfile always records them; each OS installs only its match. Server did the same for `sharp` via
  a targeted `--os=linux` install committed to the lockfile.
- **Interview framing:** great "debugging a deployment" story (see `15-challenges-debugging.md`).

## 5. Environment variables [Confirmed]

Server refuses to boot without `MONGO_URI`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`.
Recommended in prod: `NODE_ENV=production`, `CLIENT_ORIGIN`, `INTERNAL_BROADCAST_SECRET` (same on
API + realtime), `REALTIME_INTERNAL_URL`. Client build-time: `VITE_API_ORIGIN`, `VITE_REALTIME_URL`.
Optional: Google OAuth, Turnstile, Groq, SMTP, S3. Full list in `env.ts` (`03/05` reference it).

## 6. Build → deploy flow [Confirmed]

```
git push origin main
   ├─► Vercel: install (workspace) → tsc -b && vite build → deploy static SPA + /api rewrite
   └─► Render: install → (server build = no-op) → start `tsx src/index.ts` (API)
                                                → start `tsx src/realtime/index.ts` (realtime)
MongoDB Atlas: always-on managed cluster
```

- **No GitHub Actions / CI pipeline** in the repo — deploys are **push-to-deploy** via each
  platform's git integration. (The candidate holds GH-300 Copilot + GH-500 Advanced Security certs,
  but there is no CI workflow committed here.)

## 7. HTTPS / domains / CORS [Confirmed]
- HTTPS terminated by Vercel/Render. CORS locked to `CLIENT_ORIGIN` with credentials. Uploads served
  with `crossOriginResourcePolicy: cross-origin` so images load from the API origin.

## 8. Rollback strategy [Confirmed / Improvement]
- **Now:** Vercel/Render keep previous deployments → instant redeploy of a prior build is the
  rollback. No DB migration versioning.
- **[Improvement]:** add CI gating (typecheck + tests + smoke), tag releases, and a documented
  migration/rollback runbook. Add health checks + alerting.

## 9. Known prod gotchas to mention (from real debugging) [Confirmed]
- PowerShell `curl` is `Invoke-WebRequest`; use `curl.exe` and pass JSON via a file (quote-stripping
  produced a false "server 500" diagnosis).
- `NODE_ENV` must be `production` on Render or cookies come back `Lax` without `Secure` (fragile).
- `req.ip` undefined behind the proxy can neuter rate limiters (`trust proxy` is set to 1).
- Uploads on Render's disk are **ephemeral** → move to S3 for durability.

## 10. Likely questions
1. "Why run the server with `tsx` instead of compiling?" *(platform TS-version fight; pragmatic;
   trade-off = no deploy-time type gate.)*
2. "How does login survive a page refresh across two hosts?" *(Vercel rewrite → same-site cookie.)*
3. "Why did your Linux build fail and how did you fix it?" *(native binaries missing from a Windows
   lockfile → explicit optionalDependencies.)*
4. "What's missing from your DevOps?" *(CI/CD gate, monitoring, durable storage, migrations.)*
