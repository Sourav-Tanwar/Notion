/**
 * Editable table grid block (`/table`).
 *
 * The grid data lives entirely in `block.props`:
 *   - `rows`:   string[][]  — row-major cell text (plain text per cell)
 *   - `header`: boolean     — render the first row as a bold header (default true)
 *
 * Each cell is an uncontrolled contentEditable that commits on blur, so typing
 * never loses the caret when the store re-renders. Structural edits (add/remove
 * row or column) rewrite the whole `rows` array immutably, which keeps undo/redo
 * and autosave working through the normal `setProp` path.
 */

import { useEffect, useRef } from 'react';
import type { RenderProps } from '../registry/blockRegistry';
import { useBlocksStore } from '@/stores/blocks.store';
import { cn } from '@/lib/cn';

const DEFAULT_ROWS: string[][] = [
  ['Column 1', 'Column 2', 'Column 3'],
  ['', '', ''],
  ['', '', ''],
];

function readRows(value: unknown): string[][] {
  if (Array.isArray(value) && value.length && Array.isArray(value[0])) {
    return (value as unknown[][]).map((row) => row.map((c) => (c == null ? '' : String(c))));
  }
  return DEFAULT_ROWS;
}

export function TableRender({ block }: RenderProps): JSX.Element {
  const setProp = useBlocksStore((s) => s.setProp);
  const rows = readRows(block.props.rows);
  const header = block.props.header !== false;
  const cols = rows[0]?.length ?? 0;
  const wrapRef = useRef<HTMLDivElement>(null);

  const commit = (next: string[][]): void => setProp(block.id, 'rows', next);

  /** Move focus + caret to the editable surface of cell (r, c), if it exists. */
  const focusCell = (r: number, c: number): void => {
    const el = wrapRef.current?.querySelector<HTMLElement>(`[data-cell="${r}-${c}"]`);
    if (!el) return;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false); // caret at end
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  };

  const setCell = (r: number, c: number, val: string): void => {
    if (rows[r]?.[c] === val) return;
    commit(rows.map((row, ri) => (ri === r ? row.map((cell, ci) => (ci === c ? val : cell)) : row)));
  };
  const addRow = (): void => commit([...rows, Array.from({ length: cols }, () => '')]);
  const addCol = (): void => commit(rows.map((row) => [...row, '']));
  const delRow = (r: number): void => {
    if (rows.length <= 1) return;
    commit(rows.filter((_, i) => i !== r));
  };
  const delCol = (c: number): void => {
    if (cols <= 1) return;
    commit(rows.map((row) => row.filter((_, i) => i !== c)));
  };

  return (
    <div ref={wrapRef} className="group/table my-2 w-full overflow-x-auto" contentEditable={false}>
      <table className="border-collapse text-sm">
        <tbody>
          {/* Column controls: a thin row of delete buttons, visible on hover. */}
          <tr className="opacity-0 transition group-hover/table:opacity-100">
            {Array.from({ length: cols }, (_, c) => (
              <td key={c} className="p-0 text-center align-bottom">
                <button
                  type="button"
                  onClick={() => delCol(c)}
                  aria-label={`delete column ${c + 1}`}
                  className="mx-auto mb-0.5 block rounded px-1 text-[10px] leading-none text-zinc-400 hover:bg-red-500/20 hover:text-red-400"
                >
                  ✕
                </button>
              </td>
            ))}
            <td className="p-0" />
          </tr>

          {rows.map((row, r) => (
            <tr key={r} className="group/row">
              {row.map((cell, c) => (
                <Cell
                  key={c}
                  r={r}
                  c={c}
                  rowCount={rows.length}
                  colCount={cols}
                  value={cell}
                  isHeader={header && r === 0}
                  onCommit={(val) => setCell(r, c, val)}
                  focusCell={focusCell}
                />
              ))}
              {/* Row delete handle, visible on row hover. */}
              <td className="border-0 p-0 pl-1 align-middle">
                <button
                  type="button"
                  onClick={() => delRow(r)}
                  aria-label={`delete row ${r + 1}`}
                  className="rounded px-1 text-[10px] leading-none text-zinc-400 opacity-0 transition hover:bg-red-500/20 hover:text-red-400 group-hover/row:opacity-100"
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-1 flex gap-2">
        <button
          type="button"
          onClick={addRow}
          className="rounded border border-border px-2 py-0.5 text-xs text-zinc-400 hover:bg-black/5 hover:text-zinc-200 dark:hover:bg-white/10"
        >
          + Row
        </button>
        <button
          type="button"
          onClick={addCol}
          className="rounded border border-border px-2 py-0.5 text-xs text-zinc-400 hover:bg-black/5 hover:text-zinc-200 dark:hover:bg-white/10"
        >
          + Column
        </button>
      </div>
    </div>
  );
}

interface CellProps {
  r: number;
  c: number;
  rowCount: number;
  colCount: number;
  value: string;
  isHeader: boolean;
  onCommit: (value: string) => void;
  focusCell: (r: number, c: number) => void;
}

function Cell({
  r,
  c,
  rowCount,
  colCount,
  value,
  isHeader,
  onCommit,
  focusCell,
}: CellProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);

  // Keep the DOM in sync with external changes (AI fill, undo/redo) without
  // clobbering the caret while the user is actively editing this cell.
  useEffect(() => {
    const el = ref.current;
    if (el && document.activeElement !== el && el.textContent !== value) {
      el.textContent = value;
    }
  });

  return (
    <td
      className={cn(
        'border border-border px-2 py-1 align-top',
        isHeader && 'bg-surface font-semibold',
      )}
    >
      <div
        ref={ref}
        data-cell={`${r}-${c}`}
        role="textbox"
        contentEditable
        suppressContentEditableWarning
        className="min-w-[5rem] max-w-[24rem] outline-none"
        onKeyDown={(e) => {
          // Don't let block-level handlers (Enter→new block, Backspace→delete
          // block, Tab→indent) fire while editing a cell.
          e.stopPropagation();
          // Tab / Shift+Tab: walk cells left-to-right, wrapping across rows.
          if (e.key === 'Tab') {
            e.preventDefault();
            const flat = r * colCount + c;
            const next = e.shiftKey ? flat - 1 : flat + 1;
            if (next >= 0 && next < rowCount * colCount) {
              focusCell(Math.floor(next / colCount), next % colCount);
            }
            return;
          }
          // Enter: move down a row, or commit + leave the table on the last row.
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (r + 1 < rowCount) focusCell(r + 1, c);
            else (e.currentTarget as HTMLDivElement).blur();
          }
        }}
        onBlur={(e) => onCommit((e.currentTarget.textContent ?? '').trim())}
      />
    </td>
  );
}
