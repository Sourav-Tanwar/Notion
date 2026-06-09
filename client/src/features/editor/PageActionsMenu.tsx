import { useEffect, useRef, useState } from 'react';
import type { ID } from '@/types/domain';
import { usePagesStore, selectPage } from '@/stores/pages.store';
import { pageToMarkdown } from './export/markdown';
import { pageToPrintableHtml } from './export/html';
import { downloadText, slugifyFilename, printHtml } from '@/lib/download';

interface Props {
  pageId: ID;
}

/**
 * Overflow ("⋯") menu in the page header: Markdown / PDF export and
 * save-as-template.
 */
export function PageActionsMenu({ pageId }: Props): JSX.Element {
  const page = usePagesStore(selectPage(pageId));
  const saveAsTemplate = usePagesStore((s) => s.saveAsTemplate);
  const setPageSettings = usePagesStore((s) => s.setPageSettings);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const flash = (msg: string) => {
    setNote(msg);
    setTimeout(() => setNote(null), 2000);
  };

  const exportMarkdown = () => {
    const md = pageToMarkdown(pageId);
    downloadText(`${slugifyFilename(page?.title ?? '')}.md`, md, 'text/markdown');
    setOpen(false);
  };

  const exportPdf = () => {
    const html = pageToPrintableHtml(pageId);
    const ok = printHtml(html);
    setOpen(false);
    if (!ok) flash('Allow pop-ups to export PDF');
  };

  const onSaveTemplate = async () => {
    setOpen(false);
    try {
      await saveAsTemplate(pageId);
      flash('Saved as template');
    } catch {
      flash('Could not save template');
    }
  };

  const itemCls =
    'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800';

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-label="More actions"
        title="More actions"
        onClick={() => setOpen((v) => !v)}
        className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        ⋯
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-[80] w-52 overflow-hidden rounded-md border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          <div className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
            Layout
          </div>
          <button
            type="button"
            className={itemCls}
            onClick={() => void setPageSettings(pageId, { fullWidth: !page?.fullWidth })}
          >
            <span className="w-4 text-center">{page?.fullWidth ? '☑' : '▭'}</span>
            Full width
          </button>
          <button
            type="button"
            className={itemCls}
            onClick={() => void setPageSettings(pageId, { smallText: !page?.smallText })}
          >
            <span className="w-4 text-center">{page?.smallText ? '☑' : 'A'}</span>
            Small text
          </button>
          <button
            type="button"
            className={itemCls}
            onClick={() => void setPageSettings(pageId, { locked: !page?.locked })}
          >
            <span className="w-4 text-center">{page?.locked ? '🔒' : '🔓'}</span>
            {page?.locked ? 'Unlock page' : 'Lock page (read-only)'}
          </button>
          <div className="my-1 border-t border-zinc-200 dark:border-zinc-700" />
          <div className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
            Export
          </div>
          <button type="button" className={itemCls} onClick={exportMarkdown}>
            ⬇️ Markdown (.md)
          </button>
          <button type="button" className={itemCls} onClick={exportPdf}>
            🖨️ PDF (print)
          </button>
          <div className="my-1 border-t border-zinc-200 dark:border-zinc-700" />
          <button type="button" className={itemCls} onClick={() => void onSaveTemplate()}>
            ⭐ Save as template
          </button>
        </div>
      )}
      {note && (
        <div className="absolute right-0 top-9 z-[90] whitespace-nowrap rounded bg-zinc-900 px-2 py-1 text-[11px] text-white shadow dark:bg-zinc-700">
          {note}
        </div>
      )}
    </div>
  );
}
