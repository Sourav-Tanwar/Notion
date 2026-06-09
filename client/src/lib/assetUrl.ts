/**
 * Centralised resolver for asset URLs returned by the API.
 *
 * Strategy:
 *  - The server is the authority on where a file lives, so it returns either:
 *      (a) an absolute URL (current LocalDiskAdapter, future S3/CDN), or
 *      (b) a relative path like `/uploads/avatars/xxx.jpg`.
 *  - The SPA never hard-codes a host. Absolute URLs are passed through; data:
 *    and blob: URLs (used by uploaders for previews) are passed through; only
 *    bare relative paths are joined to a configured origin.
 *
 * Why a single helper instead of `<img src={user.avatarUrl}>` everywhere:
 *  - One place to swap in a CDN, signed URLs, or a /thumb resizer later.
 *  - One place to enforce that the value is safe (we refuse `javascript:`).
 *  - Makes tests trivial — no mocking required.
 */

const SAFE_SCHEMES = /^(https?:|data:|blob:)/i;
const UNSAFE_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Resolves the API origin used to prefix bare relative asset paths.
 *
 * Vite replaces `import.meta.env.VITE_API_ORIGIN` at build time. We read it
 * indirectly through `globalThis` so that the same source file also compiles
 * under ts-jest's CommonJS target (which would reject the `import.meta`
 * syntax at parse time). Tests can stub it by setting the global.
 */
function getApiOrigin(): string {
  const g = globalThis as { __VITE_API_ORIGIN__?: string };
  return (g.__VITE_API_ORIGIN__ ?? '').replace(/\/+$/, '');
}

export function resolveAssetUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (SAFE_SCHEMES.test(trimmed)) return trimmed;
  // Refuse anything with an unknown scheme (e.g. javascript:, file:).
  if (UNSAFE_SCHEME.test(trimmed)) return null;
  const origin = getApiOrigin();
  const path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return origin ? `${origin}${path}` : path;
}
