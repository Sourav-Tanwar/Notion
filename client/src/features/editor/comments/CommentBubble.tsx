/**
 * CommentBubble — per-block comment affordance.
 *
 * Sits in the block's gutter. When a block has open threads it shows a small
 * pill with the count; otherwise it shows a faint "add comment" icon that
 * only appears on block hover (the parent applies `group-hover`). Either way
 * a click opens the comments drawer anchored to this block.
 */

import { useCommentsStore, useCommentsUiStore, selectBlockOpenCount } from '@/stores/comments.store';
import type { ID } from '@/types/domain';

interface Props {
  pageId: ID;
  blockId: ID;
}

export function CommentBubble({ pageId, blockId }: Props): JSX.Element {
  const count = useCommentsStore(selectBlockOpenCount(pageId, blockId));
  const openForBlock = useCommentsUiStore((s) => s.openForBlock);

  if (count > 0) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          openForBlock(blockId);
        }}
        title={`${count} open comment${count > 1 ? 's' : ''}`}
        className="mt-1 inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 hover:bg-amber-200 dark:bg-amber-500/20 dark:text-amber-300"
      >
        💬 {count}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        openForBlock(blockId);
      }}
      aria-label="Add comment"
      title="Add comment"
      className="mt-1 px-1 text-zinc-400 opacity-0 transition-opacity hover:text-zinc-600 group-hover:opacity-100 dark:hover:text-zinc-200"
    >
      💬
    </button>
  );
}
