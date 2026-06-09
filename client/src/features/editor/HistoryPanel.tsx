/**
 * Page-history viewer.
 *
 * Lists the snapshot archive for the current page (newest-first) on the
 * left, with a rendered HTML preview of the selected revision on the
 * right. The footer holds a destructive **Restore this revision**
 * action that replaces the live page's inline content with the chosen
 * snapshot; connected collaborators see the rollback animate in place
 * via Yjs broadcast.
 *
 * Modal pattern matches `SharingModal` (overlay + escape-to-close +
 * outside-click-to-close) so the editor experience is consistent.
 *
 * Network shape
 * -------------
 * - `listHistory` is a single cheap call on open (metadata only).
 * - `getHistoryPreview` fires per-row click and decodes the snapshot
 *   server-side. We cache previews in component state by revisionId so
 *   re-selecting a row is instant.
 * - `restoreFromHistory` POSTs through REST → realtime; awaited.
 */

import { useEffect, useState } from 'react';
import { pagesApi, type HistoryRevision, type HistoryPreview } from '@/services/pages.api';
import type { ID } from '@/types/domain';

interface Props {
  pageId: ID;
  onClose: () => void;
}

export function HistoryPanel({ pageId, onClose }: Props): JSX.Element {
  const [rows, setRows] = useState<HistoryRevision[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewCache, setPreviewCache] = useState<Record<string, HistoryPreview>>({});
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    pagesApi
      .listHistory(pageId)
      .then((list) => {
        if (cancelled) return;
        setRows(list);
        if (list.length > 0) setSelectedId(list[0].id);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load history');
      });
    return () => {
      cancelled = true;
    };
  }, [pageId]);

  useEffect(() => {
    if (!selectedId) return;
    if (previewCache[selectedId]) return;
    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError(null);
    pagesApi
      .getHistoryPreview(pageId, selectedId)
      .then((p) => {
        if (cancelled) return;
        setPreviewCache((prev) => ({ ...prev, [selectedId]: p }));
      })
      .catch((e) => {
        if (cancelled) return;
        setPreviewError(e instanceof Error ? e.message : 'Failed to load preview');
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, pageId, previewCache]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const preview = selectedId ? previewCache[selectedId] : null;
  const selectedRow = selectedId ? rows?.find((r) => r.id === selectedId) ?? null : null;

  const handleRestore = async (): Promise<void> => {
    if (!selectedId || !selectedRow || restoring) return;
    // Native confirm is intentional: a custom modal-on-modal is more
    // surface than a destructive one-click action warrants here.
    const ok = window.confirm(
      `Restore page to the revision from ${formatTime(selectedRow.createdAt)}?\n\n` +
        'This replaces the page content and block structure (order, type, ' +
        'and any deleted blocks) for everyone viewing this page. The ' +
        'current state is auto-archived as a new revision so you can ' +
        'roll the restore back from history if needed.',
    );
    if (!ok) return;
    setRestoring(true);
    setRestoreError(null);
    try {
      await pagesApi.restoreFromHistory(pageId, selectedId);
      // Live editors receive the rollback over WebSocket — nothing else
      // to do on the client beyond closing the panel.
      onClose();
    } catch (e) {
      setRestoreError(e instanceof Error ? e.message : 'Restore failed');
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Page history"
    >
      <div
        className="flex h-[80vh] w-[80vw] max-w-5xl flex-col overflow-hidden rounded-lg bg-white shadow-xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">Page history</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        <div className="flex min-h-0 flex-1">
          {/* Revision list */}
          <aside className="w-64 shrink-0 overflow-y-auto border-r border-zinc-200 dark:border-zinc-800">
            {error ? (
              <div className="p-4 text-xs text-rose-600">{error}</div>
            ) : !rows ? (
              <div className="p-4 text-xs text-zinc-500">Loading…</div>
            ) : rows.length === 0 ? (
              <div className="p-4 text-xs text-zinc-500">
                No history yet. Snapshots are archived as you edit.
              </div>
            ) : (
              <ul>
                {rows.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(r.id)}
                      className={`flex w-full flex-col items-start gap-0.5 border-l-2 px-3 py-2 text-left text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800 ${
                        selectedId === r.id
                          ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30'
                          : 'border-transparent'
                      }`}
                    >
                      <span className="flex items-center gap-1.5 font-medium text-zinc-700 dark:text-zinc-200">
                        {formatTime(r.createdAt)}
                        {r.cause === 'restore' ? (
                          <span
                            className="rounded bg-amber-100 px-1 text-[9px] font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                            title="Auto-archived snapshot taken just before a restore"
                          >
                            pre-restore
                          </span>
                        ) : null}
                      </span>
                      <span className="text-[10px] text-zinc-500">
                        rev {r.revision} · {formatBytes(r.sizeBytes)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          {/* Preview pane */}
          <section className="min-w-0 flex-1 overflow-y-auto p-6">
            {!selectedId ? (
              <div className="text-sm text-zinc-500">Select a revision to preview.</div>
            ) : previewError ? (
              <div className="text-sm text-rose-600">{previewError}</div>
            ) : previewLoading && !preview ? (
              <div className="text-sm text-zinc-500">Loading preview…</div>
            ) : preview ? (
              <article
                // The preview HTML comes from the server, where it was
                // assembled from controlled `fragmentToHtml` output and a
                // small whitelist of block-wrapper tags — no user-supplied
                // raw HTML is interpolated. Safe to render directly.
                dangerouslySetInnerHTML={{ __html: preview.html || '<em>(empty)</em>' }}
                className="prose prose-sm max-w-none dark:prose-invert [&_[data-removed]]:opacity-60"
              />
            ) : null}
          </section>
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-zinc-200 px-4 py-2 dark:border-zinc-800">
          <span className="text-[11px] text-zinc-500">
            {restoreError ? (
              <span className="text-rose-600">{restoreError}</span>
            ) : (
              <>
                Restoring replaces content and structure for everyone. The
                current state is archived first — use the
                <span className="mx-1 rounded bg-amber-100 px-1 text-[9px] font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                  pre-restore
                </span>
                row to undo.
              </>
            )}
          </span>
          <button
            type="button"
            onClick={handleRestore}
            disabled={!selectedId || !preview || restoring}
            className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {restoring ? 'Restoring…' : 'Restore this revision'}
          </button>
        </footer>
      </div>
    </div>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatBytes(n: number): string {
  if (!n) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}
