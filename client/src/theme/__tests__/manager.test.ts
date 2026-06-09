/**
 * Manager integration tests.
 *
 * Covers:
 *   - cold-start hydration from localStorage
 *   - DOM class application
 *   - matchMedia → system updates
 *   - BroadcastChannel sync between two "tabs"
 *   - auth → theme bridge (server pref mirrored)
 *   - loop prevention (broadcast/remote sources don't re-broadcast or re-sync)
 */

import { useAuthStore } from '@/stores/auth.store';

// Mock the network surface so manager.ts's syncToServerIfAuthed() never hits
// fetch. Note: jest hoists jest.mock — `profileUpdateSpy` must be declared with
// `var` to be visible inside the factory.
// eslint-disable-next-line no-var
var profileUpdateSpy: jest.Mock;
jest.mock('@/services/auth.api', () => {
  profileUpdateSpy = jest.fn(async (patch: { themePref?: 'system' | 'light' | 'dark' }) => {
    const current = useAuthStore.getState().user;
    return { ...current, ...patch };
  });
  return {
    authApi: {},
    profileApi: { update: profileUpdateSpy },
  };
});

import { __resetForTests, initThemeManager, setThemePref } from '../manager';
import { useThemeStore } from '../store';

function mockMatchMedia(initial: boolean) {
  let matches = initial;
  const listeners = new Set<(e: MediaQueryListEvent) => void>();
  const mql = {
    get matches() { return matches; },
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_t: 'change', fn: (e: MediaQueryListEvent) => void) => listeners.add(fn),
    removeEventListener: (_t: 'change', fn: (e: MediaQueryListEvent) => void) => listeners.delete(fn),
    addListener: (fn: (e: MediaQueryListEvent) => void) => listeners.add(fn),
    removeListener: (fn: (e: MediaQueryListEvent) => void) => listeners.delete(fn),
    dispatchEvent: () => true,
    onchange: null,
  };
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: () => mql,
  });
  return {
    setSystem(dark: boolean) {
      matches = dark;
      for (const fn of listeners) fn({ matches: dark } as MediaQueryListEvent);
    },
  };
}

const baseUser = {
  id: 'u1',
  email: 'a@b.co',
  emailVerified: true,
  hasPassword: true,
  name: 'A',
  username: 'a',
  bio: '',
  avatarUrl: null,
  themePref: 'system' as const,
};

describe('theme manager', () => {
  beforeEach(() => {
    __resetForTests();
    localStorage.clear();
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.style.colorScheme = '';
    // Clean auth state
    useAuthStore.setState({ user: null, status: 'unauthed' } as never, false);
    profileUpdateSpy.mockClear();
  });

  afterEach(() => {
    __resetForTests();
  });

  it('hydrates pref from localStorage and applies DOM class', () => {
    localStorage.setItem('themePref', 'light');
    mockMatchMedia(true); // system says dark, but pref pinned to light wins
    initThemeManager();

    expect(useThemeStore.getState().pref).toBe('light');
    expect(useThemeStore.getState().resolved).toBe('light');
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('falls back to system pref when localStorage is empty', () => {
    mockMatchMedia(false); // light system
    initThemeManager();

    expect(useThemeStore.getState().pref).toBe('system');
    expect(useThemeStore.getState().resolved).toBe('light');
    expect(document.documentElement.classList.contains('light')).toBe(true);
  });

  it('reacts to system theme changes when pref === "system"', () => {
    const { setSystem } = mockMatchMedia(false);
    initThemeManager();

    expect(useThemeStore.getState().resolved).toBe('light');
    setSystem(true);
    expect(useThemeStore.getState().resolved).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('ignores system changes when pref is pinned', () => {
    const { setSystem } = mockMatchMedia(false);
    initThemeManager();
    setThemePref('light');

    setSystem(true);
    expect(useThemeStore.getState().resolved).toBe('light');
  });

  it('persists pref to localStorage on change', () => {
    mockMatchMedia(true);
    initThemeManager();
    setThemePref('dark');
    expect(localStorage.getItem('themePref')).toBe('dark');
  });

  it('syncs to the server when authenticated', async () => {
    mockMatchMedia(true);
    initThemeManager();
    useAuthStore.setState({ user: { ...baseUser, themePref: 'system' }, status: 'authed' } as never, false);

    setThemePref('dark');
    await Promise.resolve(); // flush the syncToServerIfAuthed() microtask
    await Promise.resolve();

    expect(profileUpdateSpy).toHaveBeenCalledWith({ themePref: 'dark' });
  });

  it('does NOT sync to server when source is broadcast', async () => {
    mockMatchMedia(true);
    initThemeManager();
    useAuthStore.setState({ user: { ...baseUser, themePref: 'system' }, status: 'authed' } as never, false);

    // Simulate a sibling tab posting an update
    const peer = new BroadcastChannel('notion-theme');
    peer.postMessage({ type: 'THEME_SET', pref: 'dark' });
    peer.close();
    await Promise.resolve();
    await Promise.resolve();

    expect(useThemeStore.getState().pref).toBe('dark');
    expect(profileUpdateSpy).not.toHaveBeenCalled();
  });

  it('mirrors the authed user pref into the store (remote source)', async () => {
    mockMatchMedia(true);
    initThemeManager();
    expect(useThemeStore.getState().pref).toBe('system');

    useAuthStore.setState({ user: { ...baseUser, themePref: 'light' }, status: 'authed' } as never, false);
    // The auth subscription fires synchronously; the manager calls setThemePref
    // with source='remote' which must NOT re-sync to the server.
    expect(useThemeStore.getState().pref).toBe('light');
    expect(profileUpdateSpy).not.toHaveBeenCalled();
  });
});
