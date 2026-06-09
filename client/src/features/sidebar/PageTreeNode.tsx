import { memo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { selectChildrenOf, selectPage, usePagesStore } from '@/stores/pages.store';
import type { ID } from '@/types/domain';
import { cn } from '@/lib/cn';

interface Props {
  id: ID;
  depth: number;
}

function PageTreeNodeImpl({ id, depth }: Props): JSX.Element | null {
  const page = usePagesStore(selectPage(id));
  const childIds = usePagesStore(useShallow(selectChildrenOf(id)));
  const createPage = usePagesStore((s) => s.createPage);
  const duplicatePage = usePagesStore((s) => s.duplicatePage);
  const deletePage = usePagesStore((s) => s.deletePage);
  const toggleFavorite = usePagesStore((s) => s.toggleFavorite);
  const { pageId } = useParams();
  const navigate = useNavigate();

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    data: { parentId: page?.parentId ?? null },
  });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };

  if (!page) return null;
  const active = pageId === id;

  const onDuplicate = async (): Promise<void> => {
    const copy = await duplicatePage(id);
    navigate(`/p/${copy.id}`);
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div
        className={cn(
          'group flex items-center gap-1 rounded px-1 py-1 text-sm',
          active
            ? 'bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50'
            : 'text-zinc-700 hover:bg-zinc-200/60 dark:text-zinc-300 dark:hover:bg-zinc-800/60',
        )}
        style={{ paddingLeft: 8 + depth * 12 }}
      >
        <span {...attributes} {...listeners} className="cursor-grab text-zinc-500 px-0.5">⋮⋮</span>
        <Link to={`/p/${id}`} className="flex-1 truncate">
          <span className="mr-1">{page.icon}</span>
          {page.title || 'Untitled'}
        </Link>
        <button
          aria-label={page.favorite ? 'unfavorite' : 'favorite'}
          title={page.favorite ? 'Remove from Favorites' : 'Add to Favorites'}
          onClick={() => void toggleFavorite(id)}
          className={cn(
            'px-1',
            page.favorite
              ? 'text-yellow-400 hover:text-yellow-300'
              : 'opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-yellow-300',
          )}
        >
          {page.favorite ? '★' : '☆'}
        </button>
        <button
          aria-label="add child"
          onClick={() => createPage(id)}
          className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-zinc-50 px-1"
        >
          +
        </button>
        <button
          aria-label="duplicate"
          title="Duplicate"
          onClick={() => void onDuplicate()}
          className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-zinc-50 px-1"
        >
          ⧉
        </button>
        <button
          aria-label="delete"
          title="Move to Trash"
          onClick={() => deletePage(id)}
          className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-400 px-1"
        >
          ×
        </button>
      </div>

      {childIds.map((cid) => (
        <PageTreeNode key={cid} id={cid} depth={depth + 1} />
      ))}
    </div>
  );
}

export const PageTreeNode = memo(PageTreeNodeImpl);
