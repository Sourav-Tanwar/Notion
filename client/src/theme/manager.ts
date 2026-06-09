import { profileApi } from '@/services/auth.api';
import { useAuthStore } from '@/stores/auth.store';
import { useThemeStore } from './store';
import {
  BROADCAST_CHANNEL_NAME,
  DEFAULT_THEME_PREF,
  LS_THEME_KEY,
  type ResolvedTheme,
  type ThemePref,
} from './types';

/**
 * Theme manager — the *only* layer allowed to touch the DOM, localStorage,
 * BroadcastChannel, and the server.
 *
 * Responsibilities:
 *   1. Hydrate initial preference (localStorage → store) on cold start.
 *   2. Subscribe to `matchMedia('(prefers-color-scheme: dark)')` and feed the
 *      store's `system` value.
 *   3. Reflect store changes to <html> (`class="light"` / `class="dark"`).
 *   4. Persist the user-facing `pref` to localStorage on change.
 *   5. Broadcast pref changes to other tabs and apply incoming broadcasts
 *      *without* echoing back (loop guard).
 *   6. Bridge to the auth store: when an authenticated user is loaded, mirror
 *      their server pref into the theme store. When the user mutates the
 *      pref locally, push it to the server.
 *
 * Loop prevention: every mutation path that ends in `_setPref` flows through
 * `applyPref(pref, { source })`. The `source` decides which side effects fire
 * — e.g. a `'broadcast'` source must NOT re-broadcast, a `'remote'` source
 * (from auth) must NOT push to the server.
 */

type Source = 'local' | 'broadcast' | 'remote';

let bc: BroadcastChannel | null = null;
let mq: MediaQueryList | null = null;
let authUnsub: (() => void) | null = null;
let mqHandler: ((e: MediaQueryListEvent) => void) | null = null;
let bcHandler: ((e: MessageEvent) => void) | null = null;
let initialized = false;

/* -------------------------------------------------------------------------- */
/* Utilities                                                                  */
/* -------------------------------------------------------------------------- */

export function readSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function readStoredPref(): ThemePref {
  try {
    const raw = localStorage.getItem(LS_THEME_KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  } catch {
    /* localStorage may be unavailable (private mode, SSR) */
  }
  return DEFAULT_THEME_PREF;
}

function applyDom(resolved: ResolvedTheme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  root.classList.toggle('light', resolved === 'light');
  // Hint UA-level form widgets/scrollbars.
  root.style.colorScheme = resolved;
}

function persistLocal(pref: ThemePref): void {
  try {
    localStorage.setItem(LS_THEME_KEY, pref);
  } catch {
    /* swallow */
  }
}

/* -------------------------------------------------------------------------- */
/* Primary mutation entry point                                               */
/* -------------------------------------------------------------------------- */

/**
 * Apply a preference change. The `source` controls side-effect fan-out so
 * cross-tab/server echoes never feed back into themselves.
 */
export function setThemePref(pref: ThemePref, source: Source = 'local'): void {
  const prevPref = useThemeStore.getState().pref;
  if (prevPref === pref && source !== 'local') return; // no-op early exit

  useThemeStore.getState()._setPref(pref);
  const { resolved } = useThemeStore.getState();
  applyDom(resolved);

  // localStorage mirrors the *preference*, not the resolved value — so when
  // a 'system' user changes their OS theme later, we still respect their
  // intent and don't lock them to whatever was resolved at the time.
  persistLocal(pref);

  if (source !== 'broadcast') {
    bc?.postMessage({ type: 'THEME_SET', pref });
  }
  if (source === 'local') {
    // Only locally-initiated changes get pushed to the server. Remote/broadcast
    // sources are already authoritative or downstream of one.
    void syncToServerIfAuthed(pref).catch(() => {
      /* Non-fatal — local + LS still applied. */
    });
  }
}

async function syncToServerIfAuthed(pref: ThemePref): Promise<void> {
  const user = useAuthStore.getState().user;
  if (!user) return;
  if (user.themePref === pref) return;
  // Use the API directly so we DON'T re-enter auth.store.updateProfile —
  // that path posts on `authChannel` and could create extra noise. We do
  // patch the local user copy via the store's patchUser, so other auth
  // subscribers stay in sync.
  const fresh = await profileApi.update({ themePref: pref });
  useAuthStore.getState().patchUser(fresh);
}

/* -------------------------------------------------------------------------- */
/* Initialization                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Wire all side-effect sources to the store. Idempotent — calling it twice
 * is a no-op. Returns a disposer for tests / HMR.
 */
export function initThemeManager(): () => void {
  if (initialized) return dispose;
  initialized = true;

  // 1. Seed `system` from MQ + `pref` from localStorage (pre-paint script may
  //    have already applied the DOM class; we re-apply for consistency).
  useThemeStore.getState()._setSystem(readSystemTheme());
  useThemeStore.getState()._setPref(readStoredPref());
  applyDom(useThemeStore.getState().resolved);

  // 2. matchMedia listener — drives `system`. We do NOT call setThemePref
  //    here because the *preference* isn't changing, only the OS state.
  if (typeof window !== 'undefined' && window.matchMedia) {
    mq = window.matchMedia('(prefers-color-scheme: dark)');
    mqHandler = (e) => {
      useThemeStore.getState()._setSystem(e.matches ? 'dark' : 'light');
      applyDom(useThemeStore.getState().resolved);
    };
    if (mq.addEventListener) mq.addEventListener('change', mqHandler);
    else mq.addListener(mqHandler);
  }

  // 3. BroadcastChannel — sync `pref` across tabs in real time.
  if (typeof BroadcastChannel !== 'undefined') {
    bc = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
    bcHandler = (e) => {
      const data = e.data as { type?: string; pref?: ThemePref } | null;
      if (!data || data.type !== 'THEME_SET') return;
      if (data.pref !== 'system' && data.pref !== 'light' && data.pref !== 'dark') return;
      setThemePref(data.pref, 'broadcast');
    };
    bc.addEventListener('message', bcHandler);
  }

  // 4. Auth → theme bridge. When the authed user object first arrives (or
  //    changes), mirror their server pref into the store. Treats this as a
  //    `'remote'` source so it never re-syncs to the server.
  authUnsub = useAuthStore.subscribe((s, prev) => {
    const userPref = s.user?.themePref;
    const prevUserPref = prev.user?.themePref;
    if (!userPref || userPref === prevUserPref) return;
    if (userPref === useThemeStore.getState().pref) return;
    setThemePref(userPref, 'remote');
  });

  return dispose;
}

export function dispose(): void {
  if (mq && mqHandler) {
    if (mq.removeEventListener) mq.removeEventListener('change', mqHandler);
    else mq.removeListener(mqHandler);
  }
  if (bc && bcHandler) {
    bc.removeEventListener('message', bcHandler);
    bc.close();
  }
  authUnsub?.();
  mq = null;
  bc = null;
  mqHandler = null;
  bcHandler = null;
  authUnsub = null;
  initialized = false;
}

/** @internal — test-only */
export function __resetForTests(): void {
  dispose();
  useThemeStore.getState()._reset();
}
