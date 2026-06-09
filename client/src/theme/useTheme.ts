import { selectPref, selectResolved, selectSystem, useThemeStore } from './store';
import type { ResolvedTheme, ThemePref } from './types';

/**
 * Public read-only hooks. Components MUST mutate via `setThemePref` from
 * theme/manager.ts so all side effects (LS, broadcast, server) fire.
 */

export function useThemePref(): ThemePref {
  return useThemeStore(selectPref);
}

export function useResolvedTheme(): ResolvedTheme {
  return useThemeStore(selectResolved);
}

export function useSystemTheme(): ResolvedTheme {
  return useThemeStore(selectSystem);
}
