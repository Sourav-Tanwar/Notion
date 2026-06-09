import { useMemo } from 'react';
import { useBlocksStore } from '@/stores/blocks.store';
import type { BlocksState } from '@/stores/blocks.store';
import type { RenderProps } from '../registry/blockRegistry';

/**
 * Table of Contents block.
 *
 * Auto-derives an outline from every heading on the page (h1/h2/h3), in
 * document order, and renders indented links that scroll to the heading.
 * It re-renders only when the heading set actually changes: the store
 * selector returns a serialized string so unrelated keystrokes don't churn it.
 */

interface Heading {
  id: string;
  level: 1 | 2 | 3;
  text: string;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/** Depth-first walk of the page block tree, collecting headings in order. */
function serializeHeadings(s: BlocksState, pageId: string): string {
  const out: string[] = [];
  const walk = (ids: string[]): void => {
    for (const id of ids) {
      const b = s.byId[id];
      if (!b) continue;
      if (b.type === 'heading' || b.type === 'heading2' || b.type === 'heading3') {
        const level = b.type === 'heading' ? 1 : b.type === 'heading2' ? 2 : 3;
        out.push(`${id}\u0001${level}\u0001${stripHtml(b.text)}`);
      }
      const kids = s.childrenOf[id];
      if (kids && kids.length) walk(kids);
    }
  };
  walk(s.rootByPage[pageId] ?? []);
  return out.join('\u0002');
}

export function TocRender({ block }: RenderProps): JSX.Element {
  const serialized = useBlocksStore((s) => serializeHeadings(s, block.pageId));

  const headings = useMemo<Heading[]>(() => {
    if (!serialized) return [];
    return serialized.split('\u0002').map((row) => {
      const [id, level, text] = row.split('\u0001');
      return { id, level: Number(level) as 1 | 2 | 3, text };
    });
  }, [serialized]);

  const jumpTo = (id: string): void => {
    const el = document.querySelector(`[data-block-id="${id}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (headings.length === 0) {
    return (
      <div className="my-1 rounded-md border border-dashed border-border px-3 py-2 text-sm text-zinc-400" contentEditable={false}>
        Table of contents — add headings to this page to populate it.
      </div>
    );
  }

  return (
    <div className="my-1 select-none" contentEditable={false}>
      {headings.map((h) => (
        <button
          key={h.id}
          type="button"
          onClick={() => jumpTo(h.id)}
          style={{ paddingLeft: `${(h.level - 1) * 16}px` }}
          className="block w-full truncate rounded px-1 py-0.5 text-left text-sm text-zinc-500 hover:bg-zinc-200/60 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100"
        >
          {h.text || 'Untitled heading'}
        </button>
      ))}
    </div>
  );
}
