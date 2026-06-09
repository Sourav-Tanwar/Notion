import { useEffect, useMemo, useState } from 'react';
import { selectAllActive, usePagesStore } from '@/stores/pages.store';
import type { Page } from '@/types/domain';
import { cn } from '@/lib/cn';

interface Props {
  query: string;
  onSelect: (page: Page) => void;
  onClose: () => void;
}

const MAX = 8;

/**
 * @-mention picker. Mirrors SlashMenu's keyboard/positioning behaviour but
 * lists pages (filtered by title) to link inline.
 */
export function MentionMenu({ query, onSelect, onClose }: Props): JSX.Element | null {
  const pages = usePagesStore(selectAllActive);
  const [active, setActive] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = [...pages].sort((a, b) =>
      (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''),
    );
    const list = q
      ? base.filter((p) => (p.title || 'Untitled').toLowerCase().includes(q))
      : base;
    return list.slice(0, MAX);
  }, [pages, query]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((a) => Math.min(a + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((a) => Math.max(a - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = filtered[active];
        if (item) onSelect(item);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [filtered, active, onSelect, onClose]);

  if (!filtered.length) return null;

  return (
    <div className="absolute z-50 mt-1 w-72 rounded-md border border-border bg-surface shadow-xl">
      <ul className="max-h-72 overflow-auto py-1">
        {filtered.map((page, i) => (
          <li key={page.id}>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(page);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn(
                'flex w-full items-center gap-2 px-3 py-2 text-left text-sm',
                i === active ? 'bg-zinc-800 text-zinc-50' : 'text-zinc-300 hover:bg-zinc-800/60',
              )}
            >
              <span className="text-base">{page.icon}</span>
              <span className="flex-1 truncate">{page.title || 'Untitled'}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
