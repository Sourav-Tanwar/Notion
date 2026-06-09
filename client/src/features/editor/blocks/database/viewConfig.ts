import type { Column, ColumnType, CellValue, DatabaseRow } from '@/services/database.api';

/**
 * Per-block view configuration for an inline database.
 *
 * This lives in the database *block's* props (persisted through the blocks
 * store) rather than on the shared database entity — so two embeds of the same
 * table can show different views, and we avoid a server schema migration.
 */

export type ViewMode = 'table' | 'board' | 'gallery' | 'calendar';
export type SortDir = 'asc' | 'desc';

export interface SortRule {
  colId: string;
  dir: SortDir;
}

export type FilterOp =
  | 'is'
  | 'isNot'
  | 'contains'
  | 'isEmpty'
  | 'isNotEmpty'
  | 'isChecked'
  | 'isUnchecked';

export interface FilterRule {
  colId: string;
  op: FilterOp;
  value?: CellValue;
}

export interface ViewConfig {
  mode: ViewMode;
  /** Select column rows are grouped by in board mode. */
  groupColId: string | null;
  /** Column whose value is shown under the title on gallery cards. */
  galleryMetaColId: string | null;
  /** Date column rows are placed on in calendar mode. */
  calendarDateColId: string | null;
  filters: FilterRule[];
  sorts: SortRule[];
}

export const DEFAULT_VIEW: ViewConfig = {
  mode: 'table',
  groupColId: null,
  galleryMetaColId: null,
  calendarDateColId: null,
  filters: [],
  sorts: [],
};

const MODES: ViewMode[] = ['table', 'board', 'gallery', 'calendar'];

/** Coerce a possibly-partial persisted value into a complete ViewConfig. */
export function normalizeView(raw: unknown): ViewConfig {
  const v = (raw ?? {}) as Partial<ViewConfig>;
  return {
    mode: MODES.includes(v.mode as ViewMode) ? (v.mode as ViewMode) : 'table',
    groupColId: typeof v.groupColId === 'string' ? v.groupColId : null,
    galleryMetaColId: typeof v.galleryMetaColId === 'string' ? v.galleryMetaColId : null,
    calendarDateColId: typeof v.calendarDateColId === 'string' ? v.calendarDateColId : null,
    filters: Array.isArray(v.filters) ? v.filters : [],
    sorts: Array.isArray(v.sorts) ? v.sorts : [],
  };
}

/** Filter operators that make sense for a given column type. */
export function opsForType(type: ColumnType): FilterOp[] {
  switch (type) {
    case 'text':
      return ['contains', 'is', 'isNotEmpty', 'isEmpty'];
    case 'url':
    case 'email':
    case 'phone':
      return ['contains', 'is', 'isNotEmpty', 'isEmpty'];
    case 'number':
      return ['is', 'isNotEmpty', 'isEmpty'];
    case 'select':
      return ['is', 'isNot', 'isNotEmpty', 'isEmpty'];
    case 'checkbox':
      return ['isChecked', 'isUnchecked'];
    case 'date':
      return ['is', 'isNotEmpty', 'isEmpty'];
    default:
      return ['isNotEmpty', 'isEmpty'];
  }
}

export const OP_LABEL: Record<FilterOp, string> = {
  is: 'is',
  isNot: 'is not',
  contains: 'contains',
  isEmpty: 'is empty',
  isNotEmpty: 'is not empty',
  isChecked: 'is checked',
  isUnchecked: 'is unchecked',
};

/** True if the operator needs a value input. */
export function opNeedsValue(op: FilterOp): boolean {
  return op === 'is' || op === 'isNot' || op === 'contains';
}

function isEmptyVal(v: CellValue): boolean {
  return v === null || v === undefined || v === '';
}

function matches(rule: FilterRule, cell: CellValue): boolean {
  switch (rule.op) {
    case 'isEmpty':
      return isEmptyVal(cell);
    case 'isNotEmpty':
      return !isEmptyVal(cell);
    case 'isChecked':
      return cell === true;
    case 'isUnchecked':
      return cell !== true;
    case 'is':
      return String(cell ?? '') === String(rule.value ?? '');
    case 'isNot':
      return String(cell ?? '') !== String(rule.value ?? '');
    case 'contains':
      return String(cell ?? '')
        .toLowerCase()
        .includes(String(rule.value ?? '').toLowerCase());
    default:
      return true;
  }
}

function compareCells(a: CellValue, b: CellValue, type: ColumnType): number {
  const ae = isEmptyVal(a);
  const be = isEmptyVal(b);
  if (ae && be) return 0;
  if (ae) return 1; // empties sink to the bottom regardless of direction
  if (be) return -1;
  if (type === 'number') return Number(a) - Number(b);
  if (type === 'checkbox') return (a === true ? 1 : 0) - (b === true ? 1 : 0);
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

/**
 * Apply filters then sorts to a row list. Pure — returns a new array and never
 * mutates the input. Empty config returns the rows in their stored order.
 */
export function applyView(
  rows: DatabaseRow[],
  columns: Column[],
  config: ViewConfig,
): DatabaseRow[] {
  const colById = new Map(columns.map((c) => [c.id, c]));

  let out = rows;
  if (config.filters.length) {
    out = out.filter((row) =>
      config.filters.every((f) => {
        if (!colById.has(f.colId)) return true;
        return matches(f, row.cells[f.colId] ?? null);
      }),
    );
  }

  if (config.sorts.length) {
    out = [...out].sort((ra, rb) => {
      for (const s of config.sorts) {
        const col = colById.get(s.colId);
        if (!col) continue;
        const cmp = compareCells(ra.cells[s.colId] ?? null, rb.cells[s.colId] ?? null, col.type);
        if (cmp !== 0) return s.dir === 'desc' ? -cmp : cmp;
      }
      return 0;
    });
  }

  return out;
}
