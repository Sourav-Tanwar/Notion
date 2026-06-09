/**
 * Cross-tab auth synchronisation.
 *
 * We use BroadcastChannel where available and fall back to a `storage` event
 * trick for older browsers. The channel deliberately carries only *signals*
 * and the public user object — never the access token. Each tab re-fetches
 * its own token via the httpOnly refresh cookie + /api/auth/refresh.
 *
 * Why no token sharing across tabs:
 *  - The access token lives in memory only (XSS mitigation). Posting it on a
 *    BroadcastChannel would let any other tab observe it, even ones loaded
 *    from compromised script origins, defeating the design.
 *  - /refresh is the canonical source of truth; new tabs can always ask.
 */

import type { User } from '@/types/domain';

export type AuthSignal =
  | { type: 'LOGIN'; user: User }
  | { type: 'LOGOUT' }
  | { type: 'USER_UPDATED'; user: User };

type Listener = (s: AuthSignal) => void;

const CHANNEL = 'auth';
const STORAGE_KEY = '__auth_signal__';
// Tag each message with a per-tab id so we can ignore our own echoes when the
// transport (e.g. storage event) lacks native loop suppression.
const TAB_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

interface Envelope {
  tabId: string;
  signal: AuthSignal;
}

const listeners = new Set<Listener>();
let bc: BroadcastChannel | null = null;

function init(): void {
  if (typeof window === 'undefined') return;
  if (typeof BroadcastChannel !== 'undefined') {
    bc = new BroadcastChannel(CHANNEL);
    bc.addEventListener('message', (ev: MessageEvent<Envelope>) => {
      const env = ev.data;
      if (!env || env.tabId === TAB_ID) return;
      for (const l of listeners) l(env.signal);
    });
    return;
  }
  // Fallback: localStorage event fires in OTHER tabs only.
  window.addEventListener('storage', (ev) => {
    if (ev.key !== STORAGE_KEY || !ev.newValue) return;
    try {
      const env = JSON.parse(ev.newValue) as Envelope;
      if (env.tabId === TAB_ID) return;
      for (const l of listeners) l(env.signal);
    } catch {
      /* ignore corrupt payloads */
    }
  });
}

init();

export const authChannel = {
  post(signal: AuthSignal): void {
    const env: Envelope = { tabId: TAB_ID, signal };
    if (bc) {
      try {
        bc.postMessage(env);
        return;
      } catch {
        /* fall through to storage */
      }
    }
    if (typeof window === 'undefined') return;
    try {
      // Mutating the value (including the timestamp) guarantees the storage
      // event fires even when we send "the same" signal twice in a row.
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...env, t: Date.now() }));
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage disabled (private mode, quota); silent — sync is best-effort */
    }
  },

  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  /** Test hook — clears state so each test starts fresh. */
  _reset(): void {
    listeners.clear();
  },
};
