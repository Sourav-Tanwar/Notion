import { useEffect, useRef, useState } from 'react';
import { useDatabaseStore } from '@/stores/database.store';
import { COLUMN_TYPES, type ColumnType, type SelectOption, type DatabaseRow } from '@/services/database.api';
import { cn } from '@/lib/cn';
import { CellEditor } from './CellEditors';
import { Popover } from './Popover';

const TYPE_LABEL: Record<ColumnType, string> = {
  text: 'Text',
  number: 'Number',
  select: 'Select',
  checkbox: 'Checkbox',
  date: 'Date',
  url: 'URL',
  email: 'Email',
  phone: 'Phone',
};
const TYPE_ICON: Record<ColumnType, string> = {
  text: 'A',
  number: '#',
  select: '◉',
  checkbox: '☑',
  date: '📅',
  url: '🔗',
  email: '✉',
  phone: '☎',
};

/** Header dropdown: rename, retype, or delete a column. */
function ColumnMenu({
  databaseId,
  colId,
  name,
  type,
  anchor,
  onClose,
}: {
  databaseId: string;
  colId: string;
  name: string;
  type: ColumnType;
  anchor: HTMLElement | null;
  onClose: () => void;
}): JSX.Element {
  const updateColumn = useDatabaseStore((s) => s.updateColumn);
  const deleteColumn = useDatabaseStore((s) => s.deleteColumn);
  const [draftName, setDraftName] = useState(name);
  // Keep the latest typed value in a ref so we can commit it on unmount. The
  // popover closes (and unmounts the input) on outside-click *before* the
  // input's blur fires, so relying on onBlur alone silently drops the rename.
  const draftRef = useRef(name);
  useEffect(() => {
    draftRef.current = draftName;
  }, [draftName]);
  useEffect(
    () => () => {
      if (draftRef.current !== name) updateColumn(databaseId, colId, { name: draftRef.current });
    },
    // Commit once on unmount; deps intentionally empty.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <Popover anchor={anchor} onClose={onClose} width={224}>
      <input
        autoFocus
        className="mb-1 w-full rounded bg-black/5 px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-indigo-400 dark:bg-white/10"
        value={draftName}
        onChange={(e) => setDraftName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      <div className="px-2 pb-0.5 pt-1 text-[11px] font-medium uppercase tracking-wide text-neutral-400">
        Property type
      </div>
      {COLUMN_TYPES.map((t) => (
        <button
          key={t}
          type="button"
          className={cn(
            'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5',
            t === type && 'text-indigo-500',
          )}
          onClick={() => {
            if (t !== type) updateColumn(databaseId, colId, { type: t });
            onClose();
          }}
        >
          <span className="w-4 text-center text-xs text-neutral-400">{TYPE_ICON[t]}</span>
          {TYPE_LABEL[t]}
          {t === type && <span className="ml-auto text-xs">✓</span>}
        </button>
      ))}
      <div className="my-1 h-px bg-black/10 dark:bg-white/10" />
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-red-500 hover:bg-red-500/10"
        onClick={() => {
          deleteColumn(databaseId, colId);
          onClose();
        }}
      >
        <span className="w-4 text-center text-xs">🗑</span>
        Delete column
      </button>
    </Popover>
  );
}

export function TableView({
  blockId,
  databaseId,
  rows,
}: {
  blockId: string;
  databaseId: string;
  rows: DatabaseRow[];
}): JSX.Element | null {
  const entry = useDatabaseStore((s) => s.byId[databaseId]);
  const addColumn = useDatabaseStore((s) => s.addColumn);
  const addOption = useDatabaseStore((s) => s.addOption);
  const addRow = useDatabaseStore((s) => s.addRow);
  const updateCells = useDatabaseStore((s) => s.updateCells);
  const deleteRow = useDatabaseStore((s) => s.deleteRow);
  const [menuCol, setMenuCol] = useState<string | null>(null);
  const headerRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  if (!entry) return null;

  const { database } = entry;

  // Add a select option and return it (so the cell can immediately select it).
  const handleAddOption = async (colId: string, name: string): Promise<SelectOption | undefined> => {
    await addOption(databaseId, colId, name);
    const col = useDatabaseStore.getState().byId[databaseId]?.database.columns.find((c) => c.id === colId);
    const opts = col?.options ?? [];
    return [...opts].reverse().find((o) => o.name === name);
  };

  return (
    <div className="select-text" contentEditable={false}>
      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/[0.12]">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-black/[0.03] dark:bg-white/[0.04]">
              {database.columns.map((col, i) => (
                <th
                  key={col.id}
                  className={cn(
                    'min-w-[10rem] border-b border-black/10 p-0 text-left font-medium dark:border-white/[0.12]',
                    i > 0 && 'border-l border-black/10 dark:border-white/[0.12]',
                  )}
                >
                  <button
                    ref={(el) => (headerRefs.current[col.id] = el)}
                    type="button"
                    className="flex w-full items-center gap-1.5 px-2.5 py-2 text-left text-neutral-600 hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/5"
                    onClick={() => setMenuCol((c) => (c === col.id ? null : col.id))}
                  >
                    <span className="text-[11px] text-neutral-400">{TYPE_ICON[col.type]}</span>
                    <span className="truncate">{col.name || 'Untitled'}</span>
                  </button>
                  {menuCol === col.id && (
                    <ColumnMenu
                      databaseId={databaseId}
                      colId={col.id}
                      name={col.name}
                      type={col.type}
                      anchor={headerRefs.current[col.id] ?? null}
                      onClose={() => setMenuCol(null)}
                    />
                  )}
                </th>
              ))}
              <th className="w-10 border-b border-l border-black/10 p-0 dark:border-white/[0.12]">
                <button
                  type="button"
                  className="flex h-full w-full items-center justify-center px-2 py-2 text-base text-neutral-400 hover:bg-black/5 hover:text-neutral-600 dark:hover:bg-white/5"
                  title="Add column"
                  onClick={() => addColumn(databaseId, 'New column', 'text')}
                >
                  +
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className="group border-t border-black/[0.06] hover:bg-black/[0.015] dark:border-white/[0.07] dark:hover:bg-white/[0.02]"
              >
                {database.columns.map((col, i) => (
                  <td
                    key={col.id}
                    data-caret-id={`${blockId}:${row.id}:${col.id}`}
                    className={cn(
                      'align-top',
                      i > 0 && 'border-l border-black/[0.06] dark:border-white/[0.07]',
                    )}
                  >
                    <CellEditor
                      column={col}
                      value={row.cells[col.id] ?? null}
                      onCommit={(value) => updateCells(databaseId, row.id, { [col.id]: value })}
                      onAddOption={
                        col.type === 'select' ? (name) => handleAddOption(col.id, name) : undefined
                      }
                    />
                  </td>
                ))}
                <td className="w-10 border-l border-black/[0.06] align-middle dark:border-white/[0.07]">
                  <button
                    type="button"
                    className="flex w-full items-center justify-center px-2 py-1 text-neutral-300 opacity-0 transition hover:text-red-500 group-hover:opacity-100"
                    title="Delete row"
                    onClick={() => deleteRow(databaseId, row.id)}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        className="mt-1.5 flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-neutral-400 hover:bg-black/5 hover:text-neutral-600 dark:hover:bg-white/5"
        onClick={() => addRow(databaseId)}
      >
        <span className="text-base leading-none">+</span> New row
      </button>
    </div>
  );
}
