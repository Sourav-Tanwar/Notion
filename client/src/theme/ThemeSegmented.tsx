import { setThemePref } from './manager';
import { useResolvedTheme, useSystemTheme, useThemePref } from './useTheme';
import type { ThemePref } from './types';

interface Option {
  value: ThemePref;
  label: string;
  icon: string;
}

const OPTIONS: readonly Option[] = [
  { value: 'light', label: 'Light', icon: '☀' },
  { value: 'dark', label: 'Dark', icon: '🌙' },
  { value: 'system', label: 'System', icon: '🖥' },
] as const;

interface Props {
  /** Compact mode hides labels (icons only). Use in sidebars. */
  compact?: boolean;
  /** Show the "Currently: …" effective-theme indicator below. */
  showEffective?: boolean;
  className?: string;
}

/**
 * Segmented theme control — the canonical UI for the theme system.
 *
 * - Reads from the theme store via `useThemePref` (one subscription).
 * - All writes flow through `setThemePref('local')` so every side effect
 *   (DOM, localStorage, BroadcastChannel, server) fires in lockstep.
 * - `aria-pressed` makes the active segment screen-reader-friendly.
 */
export function ThemeSegmented({ compact = false, showEffective = false, className }: Props): JSX.Element {
  const pref = useThemePref();
  const resolved = useResolvedTheme();
  const system = useSystemTheme();

  return (
    <div className={className}>
      <div
        role="radiogroup"
        aria-label="Theme"
        className="inline-flex rounded-md border border-border bg-surface p-0.5"
      >
        {OPTIONS.map((opt) => {
          const active = pref === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setThemePref(opt.value)}
              className={[
                'flex items-center gap-1.5 rounded px-2.5 py-1 text-sm transition-colors',
                active
                  ? 'bg-accent/15 text-zinc-100 shadow-sm ring-1 ring-accent/30'
                  : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60',
                compact && 'px-2',
              ]
                .filter(Boolean)
                .join(' ')}
              title={opt.label}
            >
              <span aria-hidden>{opt.icon}</span>
              {!compact && <span>{opt.label}</span>}
            </button>
          );
        })}
      </div>
      {showEffective && (
        <p className="mt-2 text-xs text-zinc-500">
          Currently <span className="font-medium text-zinc-300">{resolved}</span>
          {pref === 'system' && (
            <span> (your system prefers <span className="font-medium text-zinc-300">{system}</span>)</span>
          )}
        </p>
      )}
    </div>
  );
}
