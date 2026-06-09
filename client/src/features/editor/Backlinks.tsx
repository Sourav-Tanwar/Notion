import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { pagesApi, type Backlink } from '@/services/pages.api';
import type { ID } from '@/types/domain';

interface Props {
  pageId: ID;
}

/**
 * "Linked references" — the list of pages that @-mention this page. Rendered
 * at the bottom of the editor. Refetches whenever the page changes.
 */
export function Backlinks({ pageId }: Props): JSX.Element | null {
  const navigate = useNavigate();
  const [links, setLinks] = useState<Backlink[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoaded(false);
    pagesApi
      .backlinks(pageId)
      .then((res) => {
        if (alive) {
          setLinks(res);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (alive) {
          setLinks([]);
          setLoaded(true);
        }
      });
    return () => {
      alive = false;
    };
  }, [pageId]);

  if (!loaded || links.length === 0) return null;

  return (
    <section className="mt-12 border-t border-border pt-4">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Linked references
      </h2>
      <ul className="flex flex-col gap-1">
        {links.map((l) => (
          <li key={l.id}>
            <button
              type="button"
              onClick={() => navigate(`/p/${l.id}`)}
              className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <span className="mt-0.5 text-base">{l.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-zinc-200">
                  {l.title || 'Untitled'}
                </span>
                {l.snippet && (
                  <span className="mt-0.5 block truncate text-xs text-zinc-500">{l.snippet}</span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
