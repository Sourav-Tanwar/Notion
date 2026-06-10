/**
 * Page summary dialog.
 *
 * Streams an AI summary of the whole page. We reuse the existing `summarize`
 * AI command: the page is serialised to Markdown (via the export helper) and
 * sent as the source text, then the streamed result is rendered in a modal.
 *
 * Nothing is written back to the document — this is a read-only overlay the
 * user can copy from or regenerate.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ID } from '@/types/domain';
import { usePagesStore, selectPage } from '@/stores/pages.store';
import { streamAiCommand } from '@/services/ai.api';
import { pageToMarkdown } from './export/markdown';
import { inlineMarkdownToHtml } from './ai/applyResult';

interface Props {
  pageId: ID;
  onClose: () => void;
}

// The server caps `text` at 8000 chars; stay safely under it.
const MAX_INPUT = 7_800;

/** Minimal Markdown → HTML for display (headings, bullets, inline marks). */
function renderMarkdown(md: string): string {
  const lines = md.split('\n');
  const out: string[] = [];
  let inList = false;
  const closeList = (): void => {
    if (inList) {
      out.push('</ul>');
      inList = false;
    }
  };
  for (const raw of lines) {
    const t = raw.trim();
    if (!t) {
      closeList();
      continue;
    }
    const h = t.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      closeList();
      const lvl = Math.min(h[1].length, 3) + 2; // h3..h5
      out.push(`<h${lvl}>${inlineMarkdownToHtml(h[2])}</h${lvl}>`);
      continue;
    }
    const b = t.match(/^[-*]\s+(.*)$/);
    if (b) {
      if (!inList) {
        out.push('<ul>');
        inList = true;
      }
      out.push(`<li>${inlineMarkdownToHtml(b[1])}</li>`);
      continue;
    }
    closeList();
    out.push(`<p>${inlineMarkdownToHtml(t)}</p>`);
  }
  closeList();
  return out.join('');
}

export function PageSummaryDialog({ pageId, onClose }: Props): JSX.Element {
  const page = usePagesStore(selectPage(pageId));
  const [summary, setSummary] = useState('');
  const [status, setStatus] = useState<'loading' | 'streaming' | 'done' | 'error' | 'empty'>(
    'loading',
  );
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setSummary('');
    setError('');
    setCopied(false);
    setStatus('loading');

    const md = pageToMarkdown(pageId).trim();
    if (!md) {
      setStatus('empty');
      return;
    }
    const text = md.length > MAX_INPUT ? `${md.slice(0, MAX_INPUT)}\n…` : md;

    try {
      setStatus('streaming');
      await streamAiCommand(
        { action: 'summarize', text },
        (full) => setSummary(full),
        controller.signal,
      );
      if (!controller.signal.aborted) setStatus('done');
    } catch (e) {
      if (controller.signal.aborted) return;
      setError(e instanceof Error ? e.message : 'Failed to summarize');
      setStatus('error');
    }
  }, [pageId]);

  useEffect(() => {
    void run();
    return () => abortRef.current?.abort();
  }, [run]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — ignore */
    }
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-start justify-center bg-black/40 p-4 pt-[10vh]"
      onMouseDown={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
          <div className="flex items-center gap-2">
            <span aria-hidden>✨</span>
            <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
              Summary of “{page?.title || 'Untitled'}”
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {status === 'empty' && (
            <p className="text-sm text-zinc-500">This page is empty — nothing to summarize yet.</p>
          )}
          {status === 'error' && (
            <p className="text-sm text-red-500">{error}</p>
          )}
          {status === 'loading' && (
            <p className="animate-pulse text-sm text-zinc-400">Reading the page…</p>
          )}
          {(status === 'streaming' || status === 'done') && (
            <div
              className="ai-summary prose-summary text-sm leading-relaxed text-zinc-700 dark:text-zinc-200"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(summary) }}
            />
          )}
          {status === 'streaming' && (
            <span className="ml-0.5 inline-block h-4 w-2 animate-pulse bg-zinc-400 align-middle" />
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-zinc-200 px-4 py-3 dark:border-zinc-700">
          <button
            type="button"
            onClick={() => void run()}
            disabled={status === 'loading' || status === 'streaming'}
            className="rounded border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Regenerate
          </button>
          <button
            type="button"
            onClick={() => void copy()}
            disabled={!summary}
            className="rounded bg-zinc-900 px-3 py-1.5 text-xs text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </footer>
      </div>
    </div>
  );
}
