import { Link } from 'react-router-dom';
import { selectPage, usePagesStore } from '@/stores/pages.store';
import type { ID, Page } from '@/types/domain';

interface Props { pageId: ID }

/**
 * Title-path breadcrumb walks parentId up to the workspace root.
 * Walk-up is O(depth); we cap at 12 to defend against any future cycle bug.
 */
export function Breadcrumbs({ pageId }: Props): JSX.Element | null {
  const page = usePagesStore(selectPage(pageId));
  const byId = usePagesStore((s) => s.byId);
  if (!page) return null;

  const chain: { id: ID; title: string; icon: string }[] = [];
  let cursor: ID | null = pageId;
  let safety = 0;
  while (cursor && safety < 12) {
    const p: Page | undefined = byId[cursor];
    if (!p) break;
    chain.unshift({ id: p.id, title: p.title || 'Untitled', icon: p.icon });
    cursor = p.parentId;
    safety++;
  }
  if (chain.length <= 1) return null;

  return (
    <nav className="mb-2 flex flex-wrap items-center gap-1 text-xs text-zinc-500">
      {chain.map((node, i) => {
        const isLast = i === chain.length - 1;
        return (
          <span key={node.id} className="flex items-center gap-1">
            {isLast ? (
              <span className="text-zinc-400">
                <span className="mr-1">{node.icon}</span>
                {node.title}
              </span>
            ) : (
              <Link to={`/p/${node.id}`} className="hover:text-zinc-200">
                <span className="mr-1">{node.icon}</span>
                {node.title}
              </Link>
            )}
            {!isLast && <span className="text-zinc-600">/</span>}
          </span>
        );
      })}
    </nav>
  );
}
