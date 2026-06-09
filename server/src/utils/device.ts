import { UAParser } from 'ua-parser-js';

export interface DeviceInfo {
  /** "Chrome on Windows", "Safari on iOS", "API client". One short string. */
  label: string;
  browser: string;
  os: string;
  /** "desktop" | "mobile" | "tablet" | "bot" | "other". Driven by UA parser. */
  kind: string;
}

const UNKNOWN: DeviceInfo = { label: 'Unknown device', browser: '', os: '', kind: 'other' };

/**
 * Parse a User-Agent into a stable, human-friendly device label.
 *
 * Why a dedicated helper instead of inline parsing:
 *  - Consistent labels across the audit log, sessions UI, and emails.
 *  - One place to swap in a fancier client-hints / fingerprint scheme later.
 *  - One place to defend against absurd UA strings (we cap label length).
 *
 * The function never throws — bots, CLI tools and forged UAs all fall back
 * to "Unknown device" rather than 500ing a security page.
 */
export function parseDevice(ua: string | undefined | null): DeviceInfo {
  if (!ua) return UNKNOWN;
  try {
    const r = new UAParser(ua).getResult();
    const browser = r.browser.name ?? '';
    const os = r.os.name ?? '';
    const kind = r.device.type ?? (browser ? 'desktop' : 'other');
    const label = formatLabel(browser, os);
    return { label, browser, os, kind };
  } catch {
    return UNKNOWN;
  }
}

function formatLabel(browser: string, os: string): string {
  const parts = [browser || 'Browser', os && `on ${os}`].filter(Boolean);
  const label = parts.join(' ');
  return label.length > 60 ? label.slice(0, 60) : label || 'Unknown device';
}
