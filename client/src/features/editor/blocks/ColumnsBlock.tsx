import { useShallow } from 'zustand/react/shallow';
import type { ID } from '@/types/domain';
import { useBlocksStore, selectChildBlockIds } from '@/stores/blocks.store';
import { BlockList } from '../BlockList';
import type { RenderProps } from '../registry/blockRegistry';

/**
 * Multi-column layout. A `columns` block is a container whose direct children
 * are `column` blocks; each column holds ordinary blocks rendered with a nested
 * BlockList. We render the columns side-by-side with flexbox.
 *
 * Columns are seeded once at creation time (see BlockNode's slash handler) — the
 * renderer is purely presentational and never mutates state during render, which
 * previously caused runaway column/block creation under StrictMode + CRDT
 * re-renders. A corrupted container with no columns offers a user-clicked
 * fallback to (re)create them.
 */

function ColumnContainer({ columnId, pageId }: { columnId: ID; pageId: ID }): JSX.Element {
  const childIds = useBlocksStore(useShallow(selectChildBlockIds(columnId)));
  const insertChild = useBlocksStore((s) => s.insertChild);

  return (
    <div className="min-w-0 flex-1 rounded-md px-1">
      <BlockList parentId={columnId} ids={childIds} pageId={pageId} />
      {childIds.length === 0 && (
        <button
          type="button"
          contentEditable={false}
          onClick={() => insertChild(columnId, 'text')}
          className="w-full rounded border border-dashed border-border px-2 py-3 text-xs text-zinc-400 hover:bg-surface/60"
        >
          + Add block
        </button>
      )}
    </div>
  );
}

export function ColumnsRender({ block }: RenderProps): JSX.Element {
  const columnIds = useBlocksStore(useShallow(selectChildBlockIds(block.id)));
  const insertChild = useBlocksStore((s) => s.insertChild);

  // Presentational only — no state mutation during render. A corrupted/legacy
  // container with no columns shows a button so the user can recreate them.
  if (columnIds.length === 0) {
    return (
      <div className="my-1" contentEditable={false}>
        <button
          type="button"
          onClick={() => {
            insertChild(block.id, 'column');
            insertChild(block.id, 'column');
          }}
          className="w-full rounded border border-dashed border-border px-2 py-3 text-xs text-zinc-400 hover:bg-surface/60"
        >
          + Add two columns
        </button>
      </div>
    );
  }

  return (
    <div className="my-1 flex flex-col gap-3 sm:flex-row" data-columns={block.id}>
      {columnIds.map((cid) => (
        <ColumnContainer key={cid} columnId={cid} pageId={block.pageId} />
      ))}
    </div>
  );
}

/**
 * A bare `column` renderer. Columns are normally drawn by their parent
 * `ColumnsRender`, so this is only a fallback for an orphaned column block.
 */
export function ColumnRender({ block }: RenderProps): JSX.Element {
  const childIds = useBlocksStore(useShallow(selectChildBlockIds(block.id)));
  return <BlockList parentId={block.id} ids={childIds} pageId={block.pageId} />;
}
