import { api } from './http';
import type { ID } from '@/types/domain';

export const COLUMN_TYPES = ['text', 'number', 'select', 'checkbox', 'date', 'url', 'email', 'phone'] as const;
export type ColumnType = (typeof COLUMN_TYPES)[number];

export interface SelectOption {
  id: string;
  name: string;
  color: string;
}

export interface Column {
  id: string;
  name: string;
  type: ColumnType;
  options?: SelectOption[];
}

export type CellValue = string | number | boolean | null;

export interface DatabaseRow {
  id: string;
  cells: Record<string, CellValue>;
  order: number;
}

export interface Database {
  id: ID;
  pageId: ID;
  title: string;
  columns: Column[];
}

export interface DatabasePayload {
  database: Database;
  rows: DatabaseRow[];
}

export const databaseApi = {
  create: (pageId: ID, title?: string) =>
    api<DatabasePayload>('/databases', { method: 'POST', json: { pageId, title } }),

  get: (id: ID) => api<DatabasePayload>(`/databases/${id}`),

  rename: (id: ID, title: string) =>
    api<Database>(`/databases/${id}`, { method: 'PATCH', json: { title } }),

  addColumn: (id: ID, name: string, type: ColumnType) =>
    api<Database>(`/databases/${id}/columns`, { method: 'POST', json: { name, type } }),

  updateColumn: (id: ID, colId: string, patch: { name?: string; type?: ColumnType }) =>
    api<Database>(`/databases/${id}/columns/${colId}`, { method: 'PATCH', json: patch }),

  deleteColumn: (id: ID, colId: string) =>
    api<Database>(`/databases/${id}/columns/${colId}`, { method: 'DELETE' }),

  addOption: (id: ID, colId: string, name: string, color?: string) =>
    api<Database>(`/databases/${id}/columns/${colId}/options`, {
      method: 'POST',
      json: { name, color },
    }),

  addRow: (id: ID) => api<DatabaseRow>(`/databases/${id}/rows`, { method: 'POST' }),

  updateCells: (id: ID, rowId: string, cells: Record<string, CellValue>) =>
    api<DatabaseRow>(`/databases/${id}/rows/${rowId}`, { method: 'PATCH', json: { cells } }),

  deleteRow: (id: ID, rowId: string) =>
    api<{ ok: true }>(`/databases/${id}/rows/${rowId}`, { method: 'DELETE' }),
};
