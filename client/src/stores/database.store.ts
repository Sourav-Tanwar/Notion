import { create } from 'zustand';
import {
  databaseApi,
  type Database,
  type DatabaseRow,
  type CellValue,
  type ColumnType,
} from '@/services/database.api';

/**
 * Inline-database cache.
 *
 * Keyed by databaseId so a page with several tables (or the same table shown
 * twice) shares one source of truth. Mutations are optimistic where it's cheap
 * and safe (cells, row add/delete); structural column ops just trust the
 * server's returned schema since they're rare and order-sensitive.
 */
interface Entry {
  database: Database;
  rows: DatabaseRow[];
  loading: boolean;
}

interface DatabaseState {
  byId: Record<string, Entry>;
  seed: (database: Database, rows: DatabaseRow[]) => void;
  load: (id: string) => Promise<void>;
  rename: (id: string, title: string) => Promise<void>;
  addColumn: (id: string, name: string, type: ColumnType) => Promise<void>;
  updateColumn: (id: string, colId: string, patch: { name?: string; type?: ColumnType }) => Promise<void>;
  deleteColumn: (id: string, colId: string) => Promise<void>;
  addOption: (id: string, colId: string, name: string, color?: string) => Promise<void>;
  addRow: (id: string) => Promise<void>;
  updateCells: (id: string, rowId: string, cells: Record<string, CellValue>) => Promise<void>;
  deleteRow: (id: string, rowId: string) => Promise<void>;
}

export const useDatabaseStore = create<DatabaseState>((set, get) => {
  const patchEntry = (id: string, fn: (e: Entry) => Entry) => {
    const e = get().byId[id];
    if (!e) return;
    set({ byId: { ...get().byId, [id]: fn(e) } });
  };
  const setDatabase = (id: string, database: Database) =>
    patchEntry(id, (e) => ({ ...e, database }));

  return {
    byId: {},

    seed(database, rows) {
      set({ byId: { ...get().byId, [database.id]: { database, rows, loading: false } } });
    },

    async load(id) {
      const existing = get().byId[id];
      if (existing?.loading) return;
      set({
        byId: {
          ...get().byId,
          [id]: existing ?? { database: { id, pageId: '', title: '', columns: [] }, rows: [], loading: true },
        },
      });
      try {
        const { database, rows } = await databaseApi.get(id);
        set({ byId: { ...get().byId, [id]: { database, rows, loading: false } } });
      } catch {
        patchEntry(id, (e) => ({ ...e, loading: false }));
      }
    },

    async rename(id, title) {
      patchEntry(id, (e) => ({ ...e, database: { ...e.database, title } }));
      const database = await databaseApi.rename(id, title);
      setDatabase(id, database);
    },

    async addColumn(id, name, type) {
      const database = await databaseApi.addColumn(id, name, type);
      setDatabase(id, database);
    },

    async updateColumn(id, colId, patch) {
      const database = await databaseApi.updateColumn(id, colId, patch);
      setDatabase(id, database);
    },

    async deleteColumn(id, colId) {
      patchEntry(id, (e) => ({
        ...e,
        database: { ...e.database, columns: e.database.columns.filter((c) => c.id !== colId) },
      }));
      const database = await databaseApi.deleteColumn(id, colId);
      setDatabase(id, database);
    },

    async addOption(id, colId, name, color) {
      const database = await databaseApi.addOption(id, colId, name, color);
      setDatabase(id, database);
    },

    async addRow(id) {
      const row = await databaseApi.addRow(id);
      patchEntry(id, (e) => ({ ...e, rows: [...e.rows, row] }));
    },

    async updateCells(id, rowId, cells) {
      patchEntry(id, (e) => ({
        ...e,
        rows: e.rows.map((r) => (r.id === rowId ? { ...r, cells: { ...r.cells, ...cells } } : r)),
      }));
      try {
        await databaseApi.updateCells(id, rowId, cells);
      } catch {
        // Best-effort: a failed cell write leaves the optimistic value; the next
        // full load reconciles. Acceptable for a low-stakes table edit.
      }
    },

    async deleteRow(id, rowId) {
      patchEntry(id, (e) => ({ ...e, rows: e.rows.filter((r) => r.id !== rowId) }));
      await databaseApi.deleteRow(id, rowId);
    },
  };
});
