import { useState } from 'react';
import { useDatabaseStore } from '@/stores/database.store';
import type { Column, DatabaseRow } from '@/services/database.api';
import { cn } from '@/lib/cn';

/**
 * Calendar view — lays rows onto a month grid keyed on a chosen `date` column
 * (values are native `YYYY-MM-DD` strings). Navigate months with the header
 * arrows; clicking a day's "+" creates a new row pre-set to that date.
 *
 * Presentation-only over the shared store; it receives already filtered/sorted
 * `rows`.
 */

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Local YYYY-MM-DD (avoids the UTC shift of toISOString on the date input). */
function ymd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function CalendarView({
  databaseId,
  rows,
  dateCol,
}: {
  databaseId: string;
  rows: DatabaseRow[];
  dateCol: Column | null;
}): JSX.Element {
  const database = useDatabaseStore((s) => s.byId[databaseId]?.database);
  const addRow = useDatabaseStore((s) => s.addRow);
  const updateCells = useDatabaseStore((s) => s.updateCells);
  const titleCol = database?.columns.find((c) => c.type === 'text') ?? null;

  const today = new Date();
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));

  if (!dateCol) {
    return (
      <div className="rounded-lg border border-dashed border-black/15 px-4 py-8 text-center text-sm text-neutral-400 dark:border-white/15" contentEditable={false}>
        Pick a <span className="font-medium">Date</span> property from the “Date” menu to use the calendar.
      </div>
    );
  }

  // Bucket rows by their date string for O(1) day lookup.
  const byDay = new Map<string, DatabaseRow[]>();
  for (const row of rows) {
    const v = row.cells[dateCol.id];
    if (typeof v !== 'string' || !v) continue;
    const key = v.slice(0, 10);
    const list = byDay.get(key);
    if (list) list.push(row);
    else byDay.set(key, [row]);
  }

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayKey = ymd(today);

  // 6 rows × 7 cols grid; leading/trailing cells fall outside the month.
  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstWeekday; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const addOn = async (key: string): Promise<void> => {
    await addRow(databaseId);
    const latest = useDatabaseStore.getState().byId[databaseId]?.rows;
    const newRow = latest?.[latest.length - 1];
    if (newRow) void updateCells(databaseId, newRow.id, { [dateCol.id]: key });
  };

  const monthLabel = cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <div contentEditable={false}>
      <div className="mb-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setCursor(new Date(year, month - 1, 1))}
          className="rounded px-2 py-1 text-sm hover:bg-black/5 dark:hover:bg-white/10"
          aria-label="Previous month"
        >
          ‹
        </button>
        <span className="min-w-[9rem] text-center text-sm font-medium">{monthLabel}</span>
        <button
          type="button"
          onClick={() => setCursor(new Date(year, month + 1, 1))}
          className="rounded px-2 py-1 text-sm hover:bg-black/5 dark:hover:bg-white/10"
          aria-label="Next month"
        >
          ›
        </button>
        <button
          type="button"
          onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}
          className="ml-1 rounded border border-black/10 px-2 py-0.5 text-xs hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
        >
          Today
        </button>
      </div>

      <div className="grid grid-cols-7 overflow-hidden rounded-lg border border-black/10 text-sm dark:border-white/10">
        {WEEKDAYS.map((w) => (
          <div
            key={w}
            className="border-b border-black/10 bg-black/[0.02] px-2 py-1 text-[11px] font-medium text-neutral-400 dark:border-white/10 dark:bg-white/[0.03]"
          >
            {w}
          </div>
        ))}

        {cells.map((date, i) => {
          if (!date) {
            return <div key={`e${i}`} className="min-h-[84px] border-b border-r border-black/[0.06] bg-black/[0.01] last:border-r-0 dark:border-white/[0.05]" />;
          }
          const key = ymd(date);
          const dayRows = byDay.get(key) ?? [];
          const isToday = key === todayKey;
          return (
            <div
              key={key}
              className="group min-h-[84px] border-b border-r border-black/[0.06] p-1 align-top last:border-r-0 dark:border-white/[0.05]"
            >
              <div className="mb-1 flex items-center justify-between">
                <span
                  className={cn(
                    'inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px]',
                    isToday ? 'bg-indigo-500 text-white' : 'text-neutral-400',
                  )}
                >
                  {date.getDate()}
                </span>
                <button
                  type="button"
                  onClick={() => void addOn(key)}
                  className="opacity-0 transition group-hover:opacity-100 text-xs text-neutral-400 hover:text-neutral-600"
                  aria-label="Add entry"
                >
                  +
                </button>
              </div>
              <div className="flex flex-col gap-1">
                {dayRows.map((row) => {
                  const title = titleCol ? String(row.cells[titleCol.id] ?? '') : '';
                  return (
                    <div
                      key={row.id}
                      className="truncate rounded bg-indigo-500/10 px-1.5 py-0.5 text-[11px] text-indigo-700 dark:text-indigo-300"
                      title={title || 'Untitled'}
                    >
                      {title || 'Untitled'}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
