import sharp from 'sharp';
import { HttpError } from '../utils/HttpError';

/**
 * Server-side image hardening pipeline.
 *
 * Why this exists even though the client resizes:
 *  - The client is an attacker-controlled surface. A malformed JPEG, a
 *    polyglot file (image headers + embedded scripts), or a pathological
 *    blow-up image (small file → 100 MP decoded) can each cause downstream
 *    harm: stored XSS via served content type, DoS via decoder, or exfil
 *    of EXIF GPS data the user did not realise was there.
 *  - `sharp` uses libvips, which decodes streaming. Combined with a hard
 *    pixel cap (`limitInputPixels`) and a strict output codec, every byte
 *    persisted is something we produced — never something the client gave us.
 *
 * Outputs are normalised to WebP. WebP achieves smaller payloads than JPEG at
 * the qualities we serve and is universally supported by modern browsers.
 *
 * The function is purposely small so a future thumbnail size or AVIF variant
 * is a one-line change.
 */

export interface ProcessedImage {
  buffer: Buffer;
  mime: 'image/webp';
  width: number;
  height: number;
  ext: 'webp';
}

export interface ImageOptions {
  /** Output square dimension in pixels. */
  size?: number;
  /** WebP quality 1-100. 78 is the libwebp sweet spot for photos. */
  quality?: number;
  /** Reject inputs larger than this many decoded pixels (defends against
   *  decompression bombs like 50000x50000 images stored in a 30 KB file). */
  maxInputPixels?: number;
  /** Reject the resulting buffer if it exceeds this many bytes. */
  maxOutputBytes?: number;
}

const DEFAULTS: Required<ImageOptions> = {
  size: 256,
  quality: 78,
  maxInputPixels: 24_000_000, // ~24 MP — bigger than any realistic phone photo upload
  maxOutputBytes: 300 * 1024, // 300 KB
};

/** Magic-byte sniff. Trusting `Content-Type` from the client is malpractice. */
function sniffMime(buf: Buffer): 'image/png' | 'image/jpeg' | 'image/webp' | null {
  if (buf.length < 12) return null;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  // WebP: 'RIFF' .... 'WEBP'
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return 'image/webp';
  return null;
}

export async function processAvatar(
  input: Buffer,
  opts: ImageOptions = {},
): Promise<ProcessedImage> {
  const o = { ...DEFAULTS, ...opts };

  const sniffed = sniffMime(input);
  if (!sniffed) throw new HttpError(400, 'UnsupportedImage');

  let pipeline: sharp.Sharp;
  try {
    // `failOn: 'error'` rejects truncated or malformed streams.
    // `limitInputPixels` is the decompression-bomb defense.
    pipeline = sharp(input, { failOn: 'error', limitInputPixels: o.maxInputPixels });
  } catch {
    throw new HttpError(400, 'UnsupportedImage');
  }

  let meta: sharp.Metadata;
  try {
    meta = await pipeline.metadata();
  } catch {
    throw new HttpError(400, 'UnsupportedImage');
  }
  if (!meta.width || !meta.height) throw new HttpError(400, 'UnsupportedImage');

  const out = await pipeline
    .rotate() // honour EXIF orientation before stripping it
    .resize(o.size, o.size, { fit: 'cover', position: 'centre' })
    // Strip ALL metadata. We never want client-supplied EXIF (GPS, device IDs,
    // editing history) persisted; `.withMetadata()` would do the opposite.
    .webp({ quality: o.quality, effort: 4 })
    .toBuffer();

  if (out.byteLength > o.maxOutputBytes) {
    throw new HttpError(400, 'ImageTooLarge');
  }

  return { buffer: out, mime: 'image/webp', width: o.size, height: o.size, ext: 'webp' };
}

/**
 * Page cover banner — wide aspect, served at the top of a page.
 * Wider than tall (1500×500-ish). We don't enforce a square crop; sharp
 * keeps the visible centre using `cover` fit.
 */
export async function processCover(input: Buffer): Promise<ProcessedImage> {
  const sniffed = sniffMime(input);
  if (!sniffed) throw new HttpError(400, 'UnsupportedImage');

  const W = 1500;
  const H = 500;
  const MAX_BYTES = 600 * 1024; // 600 KB

  let pipeline: sharp.Sharp;
  try {
    pipeline = sharp(input, { failOn: 'error', limitInputPixels: 50_000_000 });
  } catch {
    throw new HttpError(400, 'UnsupportedImage');
  }
  let meta: sharp.Metadata;
  try {
    meta = await pipeline.metadata();
  } catch {
    throw new HttpError(400, 'UnsupportedImage');
  }
  if (!meta.width || !meta.height) throw new HttpError(400, 'UnsupportedImage');

  const out = await pipeline
    .rotate()
    .resize(W, H, { fit: 'cover', position: 'centre' })
    .webp({ quality: 80, effort: 4 })
    .toBuffer();

  if (out.byteLength > MAX_BYTES) throw new HttpError(400, 'ImageTooLarge');
  return { buffer: out, mime: 'image/webp', width: W, height: H, ext: 'webp' };
}

/**
 * Content image (inserted as an `image` block). Preserves aspect ratio,
 * caps the longest side at 1600px, and re-encodes to WebP. Metadata is
 * stripped (same EXIF-GPS concerns as avatars).
 */
export async function processContentImage(input: Buffer): Promise<ProcessedImage> {
  const sniffed = sniffMime(input);
  if (!sniffed) throw new HttpError(400, 'UnsupportedImage');

  const MAX_SIDE = 1600;
  const MAX_BYTES = 1_500 * 1024; // 1.5 MB

  let pipeline: sharp.Sharp;
  try {
    pipeline = sharp(input, { failOn: 'error', limitInputPixels: 50_000_000 });
  } catch {
    throw new HttpError(400, 'UnsupportedImage');
  }
  let meta: sharp.Metadata;
  try {
    meta = await pipeline.metadata();
  } catch {
    throw new HttpError(400, 'UnsupportedImage');
  }
  if (!meta.width || !meta.height) throw new HttpError(400, 'UnsupportedImage');

  const out = await pipeline
    .rotate()
    .resize(MAX_SIDE, MAX_SIDE, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82, effort: 4 })
    .toBuffer();

  if (out.byteLength > MAX_BYTES) throw new HttpError(400, 'ImageTooLarge');

  // Recompute output dimensions from the actual buffer (resize 'inside' may
  // leave one dimension under MAX_SIDE).
  const outMeta = await sharp(out).metadata();
  return {
    buffer: out,
    mime: 'image/webp',
    width: outMeta.width ?? MAX_SIDE,
    height: outMeta.height ?? MAX_SIDE,
    ext: 'webp',
  };
}
