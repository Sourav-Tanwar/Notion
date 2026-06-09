import { memo } from 'react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useShallow } from 'zustand/react/shallow';
import type { ID } from '@/types/domain';
import { useBlocksStore } from '@/stores/blocks.store';
import { BlockNode } from './BlockNode';

interface Props {
  ids: ID[];
  parentId: ID | null;
  pageId: ID;
}

/**
 * Renders a sortable list of sibling blocks. Each nested BlockNode also wraps
 * its children in another BlockList → recursion.
 *
 * NOTE: For very large flat lists (1k+ blocks), swap SortableContext children
 * with a react-window FixedSizeList. Trade-off: nested children make virtual
 * scrolling harder, so we virtualize only top-level lists past a threshold.
 */
function BlockListImpl({ ids, pageId, parentId }: Props): JSX.Element {
  // Per-run numbered index: each consecutive run of `numbered` siblings restarts
  // at 1. Bullets, text, etc. between numbered blocks break the run.
  const numberedIndexById = useBlocksStore(
    useShallow((s) => {
      const map: Record<ID, number> = {};
      let run = 0;
      for (const id of ids) {
        const t = s.byId[id]?.type;
        if (t === 'numbered') {
          map[id] = run;
          run += 1;
        } else {
          run = 0;
        }
      }
      return map;
    }),
  );

  return (
    <SortableContext id={parentId ?? `__root__:${pageId}`} items={ids} strategy={verticalListSortingStrategy}>
      {ids.map((id, i) => (
        <BlockNode key={id} id={id} index={numberedIndexById[id] ?? i} />
      ))}
    </SortableContext>
  );
}

export const BlockList = memo(BlockListImpl);
