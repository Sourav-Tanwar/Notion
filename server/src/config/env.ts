import 'dotenv/config';

const required = (key: string, fallback?: string): string => {
  const v = process.env[key] ?? fallback;
  if (!v) throw new Error(`Missing env var: ${key}`);
  return v;
};

const bool = (k: string, d = false): boolean => (process.env[k] ? process.env[k] === 'true' : d);

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  /**
   * Realtime (Hocuspocus) listens on its own port so REST and WebSocket
   * processes can scale independently. The SPA computes its WS URL from
   * `VITE_REALTIME_URL` and never reaches this value directly.
   */
  realtimePort: Number(process.env.REALTIME_PORT ?? 4001),
  /**
   * Internal HTTP base URL used by the REST process to ping the realtime
   * process after structural block mutations (create/delete/reorder) so
   * other connected clients can refresh their local block list without
   * waiting for a page reload. The realtime process listens on the same
   * port for both WebSocket upgrades and internal HTTP — Hocuspocus
   * exposes the HTTP server via the `onRequest` hook.
   */
  realtimeInternalUrl: process.env.REALTIME_INTERNAL_URL ?? `http://127.0.0.1:${Number(process.env.REALTIME_PORT ?? 4001)}`,
  /**
   * Shared secret authenticating REST → realtime internal pings. Required
   * in production; defaults to a dev-only value if unset. Rotate together
   * with the JWT secret in prod deploys.
   */
  internalBroadcastSecret: process.env.INTERNAL_BROADCAST_SECRET ?? 'dev-internal-broadcast-secret',

  /**
   * Hard upper bound on a single page's encoded Y.Doc snapshot. A document
   * exceeding this is refused at `onStoreDocument` time — the in-memory
   * room keeps serving clients, but persistence pauses until the doc
   * shrinks (e.g. blocks deleted) or the limit is raised. Defends against
   * a malicious / runaway client paste-bombing a page into multi-GB
   * snapshots that would OOM the realtime process on next load.
   */
  maxSnapshotBytes: Number(process.env.MAX_SNAPSHOT_BYTES ?? 5 * 1024 * 1024),
  /**
   * Throttle window for the per-page history archive. We append a copy of
   * the snapshot to `dochistories` at most once per this many milliseconds
   * of activity, so a stream of keystroke debounces doesn't fill the
   * archive. Default 60s.
   */
  historyMinIntervalMs: Number(process.env.HISTORY_MIN_INTERVAL_MS ?? 60_000),
  /**
   * How many archived history rows to keep per page. Older rows past this
   * cap are deleted on insert. 0 disables history entirely.
   */
  historyRetainCount: Number(process.env.HISTORY_RETAIN_COUNT ?? 20),
  mongoUri: required('MONGO_URI'),
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  cookieDomain: process.env.COOKIE_DOMAIN, // undefined → host-only cookie

  /* --- JWT --- */
  jwtAccessSecret: required('JWT_ACCESS_SECRET', process.env.JWT_SECRET),
  jwtAccessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
  jwtRefreshSecret: required('JWT_REFRESH_SECRET', process.env.JWT_SECRET),
  refreshTtlDays: Number(process.env.REFRESH_TTL_DAYS ?? 30),
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS ?? 12),

  /* --- Email --- */
  emailFrom: process.env.EMAIL_FROM ?? 'no-reply@notion-clone.local',
  emailDriver: (process.env.EMAIL_DRIVER ?? 'console') as 'console' | 'smtp',

  /* --- OAuth ---
   * NOTE: The redirect URI must be on the *client* origin so that the
   * Set-Cookie response (refresh token) lands on the same origin the SPA
   * runs on. In dev the request flows: browser → Vite proxy (5173) → API
   * (4000), and Vite forwards the cookie back to localhost:5173. */
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
  googleRedirectUri:
    process.env.GOOGLE_REDIRECT_URI ??
    `${process.env.CLIENT_ORIGIN ?? 'http://localhost:5173'}/api/auth/oauth/google/callback`,

  /* --- Storage --- */
  storageDriver: (process.env.STORAGE_DRIVER ?? 'local') as 'local' | 's3',
  uploadDir: process.env.UPLOAD_DIR ?? 'uploads',
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? 'http://localhost:4000',

  /* --- Behavior --- */
  emailVerificationRequired: bool('EMAIL_VERIFICATION_REQUIRED', false),

  /* --- CAPTCHA (Cloudflare Turnstile) --- */
  turnstileSecret: process.env.TURNSTILE_SECRET || undefined,
  turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || undefined,
  // When the Turnstile API is unreachable, do we let the request through?
  // Default false → fail closed (security over availability). Flip to true if
  // your traffic profile makes this a worse experience than the alternative.
  turnstileFailOpen: bool('TURNSTILE_FAIL_OPEN', false),

  /* --- Account deletion --- */
  // How long deleted accounts retain their anonymised stub before purge.
  // Used purely for audit / re-signup detection — no personal data remains.
  deletedAccountRetentionDays: Number(process.env.DELETED_ACCOUNT_RETENTION_DAYS ?? 30),

  /* --- Trash --- */
  // Pages sitting in Trash longer than this are permanently purged by a
  // periodic sweep. 0 disables auto-purge (trash kept forever).
  trashRetentionDays: Number(process.env.TRASH_RETENTION_DAYS ?? 30),
  // How often the purge sweep runs, in milliseconds. Default 6h.
  trashSweepIntervalMs: Number(process.env.TRASH_SWEEP_INTERVAL_MS ?? 6 * 60 * 60 * 1000),
} as const;

export const isProd = env.nodeEnv === 'production';
