import crypto from 'crypto';

/** Generate a URL-safe random token (default 32 bytes → 43 chars base64url). */
export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** SHA-256 hash → hex. Used to store opaque tokens (email/reset/refresh). */
export function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/** Constant-time string compare (use only for equal-length strings). */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
