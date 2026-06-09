import { useState } from 'react';
import { useDatabaseStore } from '@/stores/database.store';
import type { Column, DatabaseRow, SelectOption } from '@/services/database.api';
import { cn } from '@/lib/cn';
import { optionChipClass } from './CellEditors';

/**
 * Kanban board view. Rows are grouped into lanes by a chosen `select` column;
 * an extra "No <column>" lane collects rows with no value. Cards can be dragged
 * between lanes (which rewrites that row's cell) and each lane can spawn a new
 * row pre-set to its value.
 *
 * Like TableView, this is a *presentation* over the shared store — it receives
 * the already filtered/sorted `rows` and mutates through store actions.
 */

const NO_GROUP = '__none__';

interface Lane {
  key: string;
  option: SelectOption | null;
  rows: DatabaseRow[];
}

export function BoardView({
  databaseId,
  rows,
  groupCol,
}: {
  databaseId: string;
  rows: DatabaseRow[];
  groupCol: Column | null;
}): JSX.Element {
  const updateCells = useDatabaseStore((s) => s.updateCells);
  const addRow = useDatabaseStore((s) => s.addRow);
  const database = useDatabaseStore((s) => s.byId[databaseId]?.database);
  const [dragRow, setDragRow] = useState<string | null>(null);
  const [overLane, setOverLane] = useState<string | null>(null);

  if (!groupCol || groupCol.type !== 'select') {
    return (
      <div className="rounded-lg border border-dashed border-black/15 px-4 py-8 text-center text-sm text-neutral-400 dark:border-white/15">
        Pick a <span className="font-medium">Select</span> property to group by from the
        “Group” menu to use the board.
      </div>
    );
  }

  const options = groupCol.options ?? [];
  const lanes: Lane[] = [
    ...options.map((opt) => ({
      key: opt.id,
      option: opt,
      rows: rows.filter((r) => r.cells[groupCol.id] === opt.id),
    })),
    {
      key: NO_GROUP,
      option: null,
      rows: rows.filter((r) => {
        const v = r.cells[groupCol.id];
        return v === null || v === undefined || v === '' || !options.some((o) => o.id === v);
      }),
    },
  ];

  // The first text column becomes the card title; everything else shows as meta.
  const titleCol = database?.columns.find((c) => c.type === 'text') ?? null;
  const metaCols = (database?.columns ?? []).filter(
    (c) => c.id !== groupCol.id && c.id !== titleCol?.id,
  );

  const drop = (laneKey: string) => {
    if (!dragRow) return;
    const value = laneKey === NO_GROUP ? null : laneKey;
    void updateCells(databaseId, dragRow, { [groupCol.id]: value });
    setDragRow(null);
    setOverLane(null);
  };

  const addCard = async (laneKey: string) => {
    await addRow(databaseId);
    if (laneKey === NO_GROUP) return;
    const latest = useDatabaseStore.getState().byId[databaseId]?.rows;
    const newRow = latest?.[latest.length - 1];
    if (newRow) void updateCells(databaseId, newRow.id, { [groupCol.id]: laneKey });
  };

  return (
    <div className="flex gap-3 overflow-x-auto pb-2" contentEditable={false}>
      {lanes.map((lane) => (
        <div
          key={lane.key}
          className={cn(
            'flex w-64 shrink-0 flex-col rounded-lg border p-2 transition',
            overLane === lane.key
              ? 'border-indigo-400 bg-indigo-400/5'
              : 'border-black/10 bg-black/[0.02] dark:border-white/[0.1] dark:bg-white/[0.02]',
          )}
          onDragOver={(e) => {
            e.preventDefault();
            setOverLane(lane.key);
          }}
          onDragLeave={() => setOverLane((l) => (l === lane.key ? null : l))}
          onDrop={() => drop(lane.key)}
        >
          <div className="mb-2 flex items-center gap-2 px-1">
            {lane.option ? (
              <span className={cn('rounded px-1.5 py-0.5 text-xs font-medium', optionChipClass(lane.option.color))}>
                {lane.option.name}
              </span>
            ) : (
              <span className="text-xs font-medium text-neutral-400">No {groupCol.name}</span>
            )}
            <span className="text-xs text-neutral-400">{lane.rows.length}</span>
          </div>

          <div className="flex flex-col gap-2">
            {lane.rows.map((row) => (
              <BoardCard
                key={row.id}
                row={row}
                titleColId={titleCol?.id ?? null}
                metaCols={metaCols}
                dragging={dragRow === row.id}
                onDragStart={() => setDragRow(row.id)}
                onDragEnd={() => {
                  setDragRow(null);
                  setOverLane(null);
                }}
              />
            ))}
          </div>

          <button
            type="button"
            className="mt-2 flex items-center gap-1 rounded px-2 py-1 text-xs text-neutral-400 hover:bg-black/5 hover:text-neutral-600 dark:hover:bg-white/5"
            onClick={() => void addCard(lane.key)}
          >
            <span className="text-sm leading-none">+</span> New
          </button>
        </div>
      ))}
    </div>
  );
}

function BoardCard({
  row,
  titleColId,
  metaCols,
  dragging,
  onDragStart,
  onDragEnd,
}: {
  row: DatabaseRow;
  titleColId: string | null;
  metaCols: Column[];
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}): JSX.Element {
  const title = titleColId ? String(row.cells[titleColId] ?? '') : '';
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        'cursor-grab rounded-md border border-black/10 bg-surface p-2 text-sm shadow-sm active:cursor-grabbing dark:border-white/10',
        dragging && 'opacity-40',
      )}
    >
      <div className={cn('truncate font-medium', !title && 'text-neutral-400')}>
        {title || 'Untitled'}
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        {metaCols.map((col) => {
          const v = row.cells[col.id];
          if (v === null || v === undefined || v === '') return null;
          if (col.type === 'select') {
            const opt = col.options?.find((o) => o.id === v);
            if (!opt) return null;
            return (
              <span key={col.id} className={cn('rounded px-1.5 py-0.5 text-[11px]', optionChipClass(opt.color))}>
                {opt.name}
              </span>
            );
          }
          if (col.type === 'checkbox') {
            return (
              <span key={col.id} className="text-[11px] text-neutral-400">
                {v === true ? `☑ ${col.name}` : ''}
              </span>
            );
          }
          return (
            <span key={col.id} className="rounded bg-black/5 px-1.5 py-0.5 text-[11px] text-neutral-500 dark:bg-white/10 dark:text-neutral-300">
              {String(v)}
            </span>
          );
        })}
      </div>
    </div>
  );
}
