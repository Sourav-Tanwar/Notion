import { create } from 'zustand';
import { DEFAULT_THEME_PREF, type ResolvedTheme, type ThemePref } from './types';

/**
 * Pure theme state.
 *
 * `pref`     — user intent (`system` | `light` | `dark`).
 * `system`   — what the OS currently advertises via `prefers-color-scheme`.
 * `resolved` — the value actually applied to <html>; derived from the two
 *              above and recomputed on every mutation.
 *
 * No side effects live here. The manager layer (theme/manager.ts) reads from
 * this store and writes to DOM, localStorage, and BroadcastChannel.
 *
 * Splitting state from side effects makes the store cheap to unit-test
 * (no jsdom MediaQueryList shim needed) and keeps React subscribers free of
 * DOM coupling.
 */

interface ThemeState {
  pref: ThemePref;
  system: ResolvedTheme;
  resolved: ResolvedTheme;

  /** @internal Use `setThemePref` from manager.ts; only call this directly in tests. */
  _setPref(pref: ThemePref): void;
  /** @internal Used by the matchMedia listener. */
  _setSystem(system: ResolvedTheme): void;
  /** Test-only reset hook. */
  _reset(): void;
}

function resolve(pref: ThemePref, system: ResolvedTheme): ResolvedTheme {
  return pref === 'system' ? system : pref;
}

export const useThemeStore = create<ThemeState>((set) => ({
  pref: DEFAULT_THEME_PREF,
  system: 'dark',
  resolved: 'dark',

  _setPref(pref) {
    set((s) => ({ pref, resolved: resolve(pref, s.system) }));
  },
  _setSystem(system) {
    set((s) => ({ system, resolved: resolve(s.pref, system) }));
  },
  _reset() {
    set({ pref: DEFAULT_THEME_PREF, system: 'dark', resolved: 'dark' });
  },
}));

/* -------------------------------------------------------------------------- */
/* Selectors — kept as named functions so React.memo / useShallow can match. */
/* -------------------------------------------------------------------------- */

export const selectPref = (s: ThemeState): ThemePref => s.pref;
export const selectResolved = (s: ThemeState): ResolvedTheme => s.resolved;
export const selectSystem = (s: ThemeState): ResolvedTheme => s.system;
