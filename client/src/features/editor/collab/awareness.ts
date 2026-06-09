/**
 * Awareness payload shape and helpers.
 *
 * Awareness is Yjs's lightweight, ephemeral protocol for "who's here and
 * where are they looking" — distinct from the durable document state. It's
 * a simple Map<clientId, JSON> that every peer broadcasts; state evaporates
 * on disconnect (handled by the Awareness instance itself).
 *
 * We keep the payload deliberately small (one JSON per user). It rides on
 * the same WebSocket as document updates, but updates are throttled in
 * `useLocalAwareness` to ~30 Hz so a fast-moving caret can't saturate the
 * link.
 */

import type { Awareness } from 'y-protocols/awareness';

export interface AwarenessUser {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  /** Stable display color hashed from `id`. Computed once on join. */
  color: string;
}

export interface AwarenessCaret {
  /** id of the block (contentEditable host) the caret is in. */
  blockId: string;
  /** Character offset of selection anchor inside the block's text. */
  anchor: number;
  /** Character offset of selection head inside the block's text. */
  head: number;
}

export interface AwarenessState {
  user: AwarenessUser;
  /** Absent → user is on the page but no caret inside a block (idle). */
  caret?: AwarenessCaret;
  /** ms epoch of last caret update — used to GC stale carets on UI. */
  lastActiveAt: number;
}

/** Deterministic 6-digit hex color from a string (HSL → hex). Stable across
 *  reloads so the same user keeps the same color in everyone's UI. */
export function colorFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const hue = Math.abs(h) % 360;
  return hslToHex(hue, 70, 55);
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const c = l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return Math.round(255 * c)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** Snapshot awareness into a plain array excluding the local user. */
export function readRemoteStates(
  awareness: Awareness,
): { clientId: number; state: AwarenessState }[] {
  const out: { clientId: number; state: AwarenessState }[] = [];
  awareness.getStates().forEach((value, clientId) => {
    if (clientId === awareness.clientID) return;
    const s = value as AwarenessState | undefined;
    if (!s?.user) return;
    out.push({ clientId, state: s });
  });
  return out;
}
