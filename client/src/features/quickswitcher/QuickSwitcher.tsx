import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { selectAllActive, usePagesStore } from '@/stores/pages.store';
import { searchApi, type SearchHit } from '@/services/search.api';
import { cn } from '@/lib/cn';

/**
 * Cmd/Ctrl+K command palette: search every page by title *and* content.
 *
 * Empty query shows recently-updated pages (from the local store). Typing
 * (≥2 chars) runs a debounced workspace-scoped full-text search on the server
 * and shows matching pages with a highlighted content snippet.
 *
 * Bound globally; mounted once near the app root. The host (`App.tsx`) owns
 * the open/closed state so other features can call `openQuickSwitcher()`.
 */

interface Props {
  open: boolean;
  onClose: () => void;
}

interface Row {
  id: string;
  title: string;
  icon: string;
  snippet: string | null;
}

export function QuickSwitcher({ open, onClose }: Props): JSX.Element | null {
  const navigate = useNavigate();
  const pages = usePagesStore(selectAllActive);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  // Reset state whenever the modal opens.
  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      setHits(null);
      setLoading(false);
    }
  }, [open]);

  const trimmed = query.trim();
  const isSearching = trimmed.length >= 1;

  // Debounced server search for content + title matches.
  useEffect(() => {
    if (!open) return;
    if (!isSearching) {
      setHits(null);
      setLoading(false);
      return;
    }
    const token = ++seq.current;
    setLoading(true);
    const t = window.setTimeout(() => {
      searchApi
        .query(trimmed)
        .then((res) => {
          if (token === seq.current) setHits(res);
        })
        .catch(() => {
          if (token === seq.current) setHits([]);
        })
        .finally(() => {
          if (token === seq.current) setLoading(false);
        });
    }, 180);
    return () => window.clearTimeout(t);
  }, [open, trimmed, isSearching]);

  const items: Row[] = useMemo(() => {
    if (isSearching) {
      return (hits ?? []).map((h) => ({
        id: h.id,
        title: h.title,
        icon: h.icon,
        snippet: h.snippet,
      }));
    }
    return [...pages]
      .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
      .slice(0, 30)
      .map((p) => ({ id: p.id, title: p.title || 'Untitled', icon: p.icon, snippet: null }));
  }, [isSearching, hits, pages]);

  // Keep `active` in range as the list changes.
  useEffect(() => {
    if (active >= items.length) setActive(0);
  }, [items.length, active]);

  // Keyboard navigation only while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((a) => Math.min(a + 1, items.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((a) => Math.max(a - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const sel = items[active];
        if (sel) {
          navigate(`/p/${sel.id}`);
          onClose();
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, items, active, navigate, onClose]);

  if (!open) return null;

  const emptyLabel = loading ? 'Searching…' : isSearching ? 'No matches.' : 'No pages yet.';

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/60 pt-[15vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-[560px] max-w-[92vw] overflow-hidden rounded-lg border border-border bg-surface shadow-2xl">
        <div className="border-b border-border p-2">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pages and content…"
            className="w-full rounded bg-transparent px-2 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
          />
        </div>
        <ul className="max-h-[50vh] overflow-auto py-1" role="listbox" aria-label="Search results">
          {items.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-zinc-500">{emptyLabel}</li>
          )}
          {items.map((p, i) => (
            <li key={p.id}>
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  navigate(`/p/${p.id}`);
                  onClose();
                }}
                className={cn(
                  'flex w-full items-start gap-2 px-3 py-2 text-left text-sm',
                  i === active ? 'bg-zinc-800 text-zinc-50' : 'text-zinc-300 hover:bg-zinc-800/60',
                )}
              >
                <span className="mt-0.5 text-base">{p.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{highlight(p.title || 'Untitled', trimmed)}</span>
                  {p.snippet && (
                    <span className="mt-0.5 block truncate text-xs text-zinc-500">
                      {highlight(p.snippet, trimmed)}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between border-t border-border px-3 py-1.5 text-[11px] text-zinc-500">
          <span>↑↓ to navigate · Enter to open · Esc to close</span>
          <span>
            {items.length} {items.length === 1 ? 'result' : 'results'}
          </span>
        </div>
      </div>
    </div>
  );
}

/** Wrap case-insensitive occurrences of `q` in the text with a highlight. */
function highlight(text: string, q: string): JSX.Element | string {
  if (!q) return text;
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  const parts: JSX.Element[] = [];
  let i = 0;
  let from = 0;
  let key = 0;
  while ((i = lower.indexOf(needle, from)) !== -1) {
    if (i > from) parts.push(<span key={key++}>{text.slice(from, i)}</span>);
    parts.push(
      <mark key={key++} className="rounded bg-yellow-400/30 px-0.5 text-inherit">
        {text.slice(i, i + q.length)}
      </mark>,
    );
    from = i + q.length;
  }
  if (parts.length === 0) return text;
  if (from < text.length) parts.push(<span key={key++}>{text.slice(from)}</span>);
  return <>{parts}</>;
}

