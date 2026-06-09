import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Page } from '@/types/domain';
import { usePagesStore } from '@/stores/pages.store';
import { pagesApi } from '@/services/pages.api';

/**
 * "New from template" picker for the sidebar. Lists templates saved in this
 * workspace and instantiates a fresh page from the chosen one.
 */
export function TemplatesMenu(): JSX.Element {
  const navigate = useNavigate();
  const createFromTemplate = usePagesStore((s) => s.createFromTemplate);
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<Page[] | null>(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setTemplates(null);
    pagesApi.listTemplates().then(setTemplates).catch(() => setTemplates([]));
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const pick = async (templateId: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const page = await createFromTemplate(templateId, null);
      setOpen(false);
      navigate(`/p/${page.id}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={ref} className="relative mx-2 mt-1">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full rounded px-2 py-1 text-left text-xs text-zinc-500 hover:bg-zinc-200/60 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100"
      >
        ＋ New from template
      </button>
      {open && (
        <div className="absolute left-0 right-0 z-[80] mt-1 max-h-64 overflow-auto rounded-md border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          {templates === null && (
            <div className="px-3 py-2 text-xs text-zinc-400">Loading…</div>
          )}
          {templates !== null && templates.length === 0 && (
            <div className="px-3 py-2 text-xs text-zinc-400">
              No templates yet. Use a page’s ⋯ menu → “Save as template”.
            </div>
          )}
          {templates?.map((t) => (
            <button
              key={t.id}
              onClick={() => void pick(t.id)}
              disabled={busy}
              className="flex w-full items-center gap-2 truncate px-3 py-1.5 text-left text-xs text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <span>{t.icon}</span>
              <span className="truncate">{t.title || 'Untitled'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
