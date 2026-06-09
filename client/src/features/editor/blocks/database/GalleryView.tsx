import { useDatabaseStore } from '@/stores/database.store';
import type { Column, DatabaseRow } from '@/services/database.api';
import { cn } from '@/lib/cn';
import { optionChipClass } from './CellEditors';

/**
 * Gallery view — renders each row as a card in a responsive grid. The first
 * text column is the card title; an optional "subtitle" column (any type,
 * chosen from the toolbar) and the row's select chips fill the card body.
 *
 * Presentation-only: receives already filtered/sorted `rows` and mutates via
 * the shared store.
 */
export function GalleryView({
  databaseId,
  rows,
  metaCol,
}: {
  databaseId: string;
  rows: DatabaseRow[];
  metaCol: Column | null;
}): JSX.Element {
  const database = useDatabaseStore((s) => s.byId[databaseId]?.database);
  const addRow = useDatabaseStore((s) => s.addRow);

  const titleCol = database?.columns.find((c) => c.type === 'text') ?? null;
  const chipCols = (database?.columns ?? []).filter(
    (c) => c.type === 'select' && c.id !== metaCol?.id,
  );

  const renderMeta = (row: DatabaseRow): string => {
    if (!metaCol) return '';
    const v = row.cells[metaCol.id];
    if (v === null || v === undefined || v === '') return '';
    if (metaCol.type === 'select') {
      return metaCol.options?.find((o) => o.id === v)?.name ?? '';
    }
    if (metaCol.type === 'checkbox') return v === true ? '☑' : '';
    return String(v);
  };

  return (
    <div contentEditable={false}>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
        {rows.map((row) => {
          const title = titleCol ? String(row.cells[titleCol.id] ?? '') : '';
          const meta = renderMeta(row);
          return (
            <div
              key={row.id}
              className="flex flex-col gap-2 rounded-lg border border-black/10 bg-surface p-3 shadow-sm dark:border-white/10"
            >
              <div className={cn('truncate text-sm font-medium', !title && 'text-neutral-400')}>
                {title || 'Untitled'}
              </div>
              {meta && <div className="truncate text-xs text-neutral-500">{meta}</div>}
              <div className="mt-auto flex flex-wrap gap-1">
                {chipCols.map((col) => {
                  const v = row.cells[col.id];
                  const opt = col.options?.find((o) => o.id === v);
                  if (!opt) return null;
                  return (
                    <span
                      key={col.id}
                      className={cn('rounded px-1.5 py-0.5 text-[11px]', optionChipClass(opt.color))}
                    >
                      {opt.name}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}

        <button
          type="button"
          onClick={() => void addRow(databaseId)}
          className="flex min-h-[96px] items-center justify-center rounded-lg border border-dashed border-black/15 text-sm text-neutral-400 transition hover:border-black/25 hover:text-neutral-600 dark:border-white/15 dark:hover:border-white/30"
        >
          + New
        </button>
      </div>

      {rows.length === 0 && (
        <p className="mt-2 px-1 text-xs text-neutral-400">No cards match the current filters.</p>
      )}
    </div>
  );
}
