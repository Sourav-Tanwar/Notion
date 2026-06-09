import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import type { Page } from '@/types/domain';
import { usePagesStore } from '@/stores/pages.store';
import { pagesApi } from '@/services/pages.api';

/**
 * Full-screen gallery for browsing every template in the workspace as cards.
 * Richer than the inline dropdown picker: shows all templates at a glance and
 * lets the user pick one to instantiate a fresh page.
 */
export function TemplatesGallery({ onClose }: { onClose: () => void }): JSX.Element {
  const navigate = useNavigate();
  const createFromTemplate = usePagesStore((s) => s.createFromTemplate);
  const [templates, setTemplates] = useState<Page[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    pagesApi.listTemplates().then(setTemplates).catch(() => setTemplates([]));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const use = async (templateId: string) => {
    if (busyId) return;
    setBusyId(templateId);
    try {
      const page = await createFromTemplate(templateId, null);
      onClose();
      navigate(`/p/${page.id}`);
    } catch {
      setBusyId(null);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      onMouseDown={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Templates</h2>
          <button
            onClick={onClose}
            className="rounded px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          >
            ✕
          </button>
        </div>

        <div className="overflow-auto p-5">
          {templates === null && (
            <div className="py-12 text-center text-sm text-zinc-400">Loading…</div>
          )}
          {templates !== null && templates.length === 0 && (
            <div className="py-12 text-center text-sm text-zinc-400">
              No templates yet. Open any page’s ⋯ menu → “Save as template” to add one.
            </div>
          )}
          {templates && templates.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => void use(t.id)}
                  disabled={busyId !== null}
                  className="group flex h-32 flex-col rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-left transition hover:border-zinc-300 hover:shadow disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800/50 dark:hover:border-zinc-600"
                >
                  <span className="text-3xl">{t.icon}</span>
                  <span className="mt-2 line-clamp-2 text-sm font-medium text-zinc-800 dark:text-zinc-100">
                    {t.title || 'Untitled'}
                  </span>
                  <span className="mt-auto text-xs text-zinc-400 opacity-0 transition group-hover:opacity-100">
                    {busyId === t.id ? 'Creating…' : 'Use template →'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
