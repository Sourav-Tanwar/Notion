/**
 * Theme system types.
 *
 * Keeping the resolved type narrow (`'light' | 'dark'`) — `'system'` is a
 * *preference*, never an applied state. Anything downstream that paints
 * pixels works with the resolved value only.
 */

export type ThemePref = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_PREFS: readonly ThemePref[] = ['system', 'light', 'dark'] as const;
export const DEFAULT_THEME_PREF: ThemePref = 'system';
export const LS_THEME_KEY = 'themePref';
export const BROADCAST_CHANNEL_NAME = 'notion-theme';
