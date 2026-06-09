import { useEffect, useMemo, useState } from 'react';
import type { BlockType } from '@/types/domain';
import { allBlockSpecs } from './registry/blockRegistry';
import { cn } from '@/lib/cn';

interface Props {
  query: string;
  onSelect: (type: BlockType) => void;
  onClose: () => void;
}

export function SlashMenu({ query, onSelect, onClose }: Props): JSX.Element | null {
  const items = useMemo(() => allBlockSpecs().filter((s) => !s.hidden), []);
  const filtered = items.filter(
    (i) =>
      i.label.toLowerCase().includes(query.toLowerCase()) ||
      String(i.type).toLowerCase().includes(query.toLowerCase()),
  );
  const [active, setActive] = useState(0);
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
        if (item) onSelect(item.type as BlockType);
      } else if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [filtered, active, onSelect, onClose]);

  if (!filtered.length) return null;
  return (
    <div className="absolute z-50 mt-1 w-72 rounded-md border border-border bg-surface shadow-xl">
      <ul className="max-h-80 overflow-auto py-1">
        {filtered.map((item, i) => (
          <li key={item.type as string}>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(item.type as BlockType);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn(
                'w-full px-3 py-2 text-left text-sm flex items-center gap-3',
                i === active ? 'bg-zinc-800' : 'hover:bg-zinc-800/60',
              )}
            >
              <span className="inline-flex h-7 w-7 items-center justify-center rounded border border-border text-xs text-zinc-400">
                {item.icon ?? '·'}
              </span>
              <span className="flex flex-col">
                <span className="text-zinc-100">{item.label}</span>
                <span className="text-xs text-zinc-500">{item.hint}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
