import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { HttpError } from '../utils/HttpError';

export interface LinkPreview {
  url: string;
  title: string;
  description: string;
  image: string | null;
  favicon: string | null;
  siteName: string | null;
}

/** Block obviously-internal targets to mitigate SSRF. */
function isPrivateIp(ip: string): boolean {
  if (ip === '::1' || ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80')) return true;
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return false;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) || // link-local / cloud metadata (169.254.169.254)
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

async function assertPublicHost(hostname: string): Promise<void> {
  const lower = hostname.toLowerCase();
  if (lower === 'localhost' || lower.endsWith('.local') || lower.endsWith('.internal')) {
    throw new HttpError(400, 'BlockedHost');
  }
  // If it's a literal IP, check directly; otherwise resolve and check.
  if (isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new HttpError(400, 'BlockedHost');
    return;
  }
  try {
    const { address } = await lookup(hostname);
    if (isPrivateIp(address)) throw new HttpError(400, 'BlockedHost');
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, 'UnresolvableHost');
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&nbsp;/g, ' ');
}

function metaContent(html: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = re.exec(html);
    if (m?.[1]) return decodeEntities(m[1].trim());
  }
  return null;
}

function absolutize(base: URL, maybe: string | null): string | null {
  if (!maybe) return null;
  try {
    return new URL(maybe, base).toString();
  } catch {
    return null;
  }
}

/** Known bot-challenge / interstitial page titles that aren't the real title. */
const INTERSTITIAL_TITLES = [
  'just a moment',
  'attention required',
  'access denied',
  'please wait',
  'security check',
  'checking your browser',
  'are you a robot',
  'one moment please',
];

function isInterstitialTitle(title: string): boolean {
  const t = title.trim().toLowerCase();
  return INTERSTITIAL_TITLES.some((p) => t.includes(p));
}

/**
 * Fetch a URL and scrape OG / meta tags into a compact preview. Never throws
 * for missing tags — only for invalid / blocked / unreachable URLs.
 */
export async function fetchLinkPreview(rawUrl: string): Promise<LinkPreview> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new HttpError(400, 'InvalidUrl');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new HttpError(400, 'UnsupportedProtocol');
  }
  await assertPublicHost(parsed.hostname);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  let html = '';
  try {
    const resp = await fetch(parsed.toString(), {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; NotionCloneBot/1.0)', accept: 'text/html' },
    });
    const ct = resp.headers.get('content-type') ?? '';
    if (ct.includes('text/html')) {
      // Cap the body we read so a huge page can't exhaust memory.
      const buf = await resp.arrayBuffer();
      html = Buffer.from(buf.slice(0, 512 * 1024)).toString('utf8');
    }
  } catch {
    throw new HttpError(502, 'FetchFailed');
  } finally {
    clearTimeout(timer);
  }

const scrapedTitle = metaContent(html, [
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i,
    /<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']*)["']/i,
    /<title[^>]*>([^<]*)<\/title>/i,
  ]);
  // Bot-protection / interstitial pages (Cloudflare, WAFs, etc.) return a
  // placeholder title instead of the real one. Fall back to the hostname so the
  // card isn't labelled "Just a moment…".
  const title = scrapedTitle && !isInterstitialTitle(scrapedTitle) ? scrapedTitle : parsed.hostname;

  const description =
    metaContent(html, [
      /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i,
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i,
      /<meta[^>]+name=["']twitter:description["'][^>]+content=["']([^"']*)["']/i,
    ]) ?? '';

  const image = absolutize(
    parsed,
    metaContent(html, [
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)["']/i,
      /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']*)["']/i,
    ]),
  );

  const iconHref = metaContent(html, [
    /<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']*)["']/i,
    /<link[^>]+href=["']([^"']*)["'][^>]+rel=["'](?:shortcut )?icon["']/i,
  ]);
  const favicon = absolutize(parsed, iconHref) ?? absolutize(parsed, '/favicon.ico');

  const siteName = metaContent(html, [
    /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']*)["']/i,
  ]);

  return { url: parsed.toString(), title, description, image, favicon, siteName };
}
