import { useState } from 'react';
import { blocksApi } from '@/services/blocks.api';
import { useBlocksStore } from '@/stores/blocks.store';
import type { RenderProps } from '../registry/blockRegistry';

/**
 * Web bookmark block. Paste a URL → the server scrapes Open Graph metadata →
 * we render a rich link card (title, description, site + favicon, thumbnail).
 * Metadata is cached in props so the card survives reloads without re-fetching.
 */

interface Preview {
  url: string;
  title: string;
  description: string;
  image: string | null;
  favicon: string | null;
  siteName: string | null;
}

export function BookmarkRender({ block }: RenderProps): JSX.Element {
  const setProp = useBlocksStore((s) => s.setProp);
  const url = (block.props.url as string) ?? '';
  const title = (block.props.title as string) ?? '';
  const description = (block.props.description as string) ?? '';
  const image = (block.props.image as string) || null;
  const favicon = (block.props.favicon as string) || null;
  const siteName = (block.props.siteName as string) || null;

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const save = (p: Preview): void => {
    setProp(block.id, 'url', p.url);
    setProp(block.id, 'title', p.title);
    setProp(block.id, 'description', p.description);
    setProp(block.id, 'image', p.image ?? '');
    setProp(block.id, 'favicon', p.favicon ?? '');
    setProp(block.id, 'siteName', p.siteName ?? '');
  };

  const startEdit = (): void => {
    setDraft(title || url);
    setEditing(true);
  };

  const commitTitle = (): void => {
    setProp(block.id, 'title', draft.trim() || url);
    setEditing(false);
  };

  const fetchPreview = async (raw: string): Promise<void> => {
    const v = raw.trim();
    if (!v) return;
    const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
    setError(null);
    setLoading(true);
    try {
      const meta = await blocksApi.linkPreview(withScheme);
      save(meta);
    } catch (e) {
      // Fall back to a bare link card so the block is still usable.
      const msg = (e as Error).message || 'Could not load preview';
      setError(msg);
      save({ url: withScheme, title: withScheme, description: '', image: null, favicon: null, siteName: null });
    } finally {
      setLoading(false);
    }
  };

  if (!url) {
    return (
      <div className="my-1 rounded-md border border-dashed border-border bg-surface/40 px-3 py-3" contentEditable={false}>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void fetchPreview(input);
              }
            }}
            placeholder="🔖 Paste a link to bookmark"
            className="min-w-0 flex-1 rounded border border-border bg-surface px-2 py-1 text-sm text-foreground outline-none"
          />
          <button
            type="button"
            disabled={loading}
            onClick={() => void fetchPreview(input)}
            className="rounded bg-zinc-800 px-3 py-1 text-sm text-zinc-100 hover:bg-zinc-700 disabled:opacity-50"
          >
            {loading ? 'Loading…' : 'Bookmark'}
          </button>
        </div>
        {error && <div className="mt-1 text-xs text-amber-500">{error}</div>}
      </div>
    );
  }

  return (
    <div className="my-1" contentEditable={false}>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex overflow-hidden rounded-md border border-border bg-surface transition hover:bg-zinc-100 dark:hover:bg-zinc-800/40"
      >
        <span className="flex min-w-0 flex-1 flex-col justify-between gap-1 px-3 py-2">
          {editing ? (
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitTitle();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setEditing(false);
                }
              }}
              onBlur={commitTitle}
              className="min-w-0 rounded border border-border bg-surface px-1 py-0.5 text-sm font-medium text-foreground outline-none"
            />
          ) : (
            <span
              title="Double-click to edit title"
              onClick={(e) => {
                // Keep single clicks on the title from following the link so a
                // double-click can register to enter edit mode.
                e.preventDefault();
                e.stopPropagation();
              }}
              onDoubleClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                startEdit();
              }}
              className="cursor-text truncate text-sm font-medium text-zinc-800 dark:text-zinc-100"
            >
              {title || url}
            </span>
          )}
          {description && (
            <span className="line-clamp-2 text-xs text-zinc-500 dark:text-zinc-400">{description}</span>
          )}
          <span className="flex items-center gap-1.5 text-xs text-zinc-400">
            {favicon && <img src={favicon} alt="" className="h-3.5 w-3.5 rounded-sm" />}
            <span className="truncate">{siteName || new URL(url).hostname}</span>
          </span>
        </span>
        {image && (
          <span className="hidden w-40 shrink-0 sm:block">
            <img src={image} alt="" className="h-full w-full object-cover" />
          </span>
        )}
      </a>
    </div>
  );
}
