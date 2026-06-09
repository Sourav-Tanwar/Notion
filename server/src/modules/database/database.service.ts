import { Types } from 'mongoose';
import { randomUUID } from 'node:crypto';
import {
  DatabaseModel,
  DatabaseRowModel,
  COLUMN_TYPES,
  type ColumnType,
} from './database.model';
import { HttpError } from '../../utils/HttpError';

const SELECT_COLORS = ['gray', 'blue', 'green', 'yellow', 'orange', 'red', 'purple', 'pink'];

const dbDTO = (d: any) => ({
  id: String(d._id),
  pageId: String(d.pageId),
  title: d.title,
  columns: (d.columns ?? []).map((c: any) => ({
    id: c.id,
    name: c.name,
    type: c.type as ColumnType,
    options: c.options ? c.options.map((o: any) => ({ id: o.id, name: o.name, color: o.color })) : undefined,
  })),
});

const rowDTO = (r: any) => ({
  id: String(r._id),
  cells: r.cells ?? {},
  order: r.order,
});

async function loadDb(workspaceId: string, id: string) {
  const db = await DatabaseModel.findOne({ _id: id, workspaceId });
  if (!db) throw new HttpError(404, 'DatabaseNotFound');
  return db;
}

export const databaseService = {
  /** Create a fresh database (with a Name column + a few empty rows). */
  async create(workspaceId: string, pageId: string, title?: string) {
    const db = await DatabaseModel.create({
      workspaceId: new Types.ObjectId(workspaceId),
      pageId: new Types.ObjectId(pageId),
      title: title ?? 'Untitled database',
      columns: [
        { id: randomUUID(), name: 'Name', type: 'text' },
        { id: randomUUID(), name: 'Tags', type: 'select', options: [] },
      ],
    });
    const rows = await DatabaseRowModel.insertMany(
      [0, 1, 2].map((i) => ({
        _id: randomUUID(),
        databaseId: db._id,
        workspaceId: new Types.ObjectId(workspaceId),
        cells: {},
        order: i,
      })),
    );
    return { database: dbDTO(db), rows: rows.map(rowDTO) };
  },

  async get(workspaceId: string, id: string) {
    const db = await loadDb(workspaceId, id);
    const rows = await DatabaseRowModel.find({ databaseId: db._id, workspaceId })
      .sort({ order: 1 })
      .lean();
    return { database: dbDTO(db), rows: rows.map(rowDTO) };
  },

  async rename(workspaceId: string, id: string, title: string) {
    const db = await loadDb(workspaceId, id);
    db.title = title;
    await db.save();
    return dbDTO(db);
  },

  async addColumn(workspaceId: string, id: string, name: string, type: ColumnType) {
    if (!COLUMN_TYPES.includes(type)) throw new HttpError(400, 'InvalidColumnType');
    const db = await loadDb(workspaceId, id);
    const col = {
      id: randomUUID(),
      name: name || 'Untitled',
      type,
      ...(type === 'select' ? { options: [] } : {}),
    };
    db.columns.push(col as any);
    await db.save();
    return dbDTO(db);
  },

  async updateColumn(
    workspaceId: string,
    id: string,
    colId: string,
    patch: { name?: string; type?: ColumnType },
  ) {
    const db = await loadDb(workspaceId, id);
    const col = db.columns.find((c: any) => c.id === colId);
    if (!col) throw new HttpError(404, 'ColumnNotFound');
    if (patch.name !== undefined) col.name = patch.name;
    if (patch.type !== undefined) {
      if (!COLUMN_TYPES.includes(patch.type)) throw new HttpError(400, 'InvalidColumnType');
      col.type = patch.type;
      if (patch.type === 'select' && !col.options) col.options = [] as any;
    }
    await db.save();
    return dbDTO(db);
  },

  async deleteColumn(workspaceId: string, id: string, colId: string) {
    const db = await loadDb(workspaceId, id);
    db.columns = db.columns.filter((c: any) => c.id !== colId) as any;
    await db.save();
    // Drop the cell from every row.
    await DatabaseRowModel.updateMany(
      { databaseId: db._id, workspaceId },
      { $unset: { [`cells.${colId}`]: '' } },
    );
    return dbDTO(db);
  },

  async addOption(workspaceId: string, id: string, colId: string, name: string, color?: string) {
    const db = await loadDb(workspaceId, id);
    const col = db.columns.find((c: any) => c.id === colId);
    if (!col) throw new HttpError(404, 'ColumnNotFound');
    if (col.type !== 'select') throw new HttpError(400, 'NotASelectColumn');
    if (!col.options) col.options = [] as any;
    const options = col.options!;
    const option = {
      id: randomUUID(),
      name: name || 'Option',
      color: color ?? SELECT_COLORS[options.length % SELECT_COLORS.length],
    };
    options.push(option as any);
    await db.save();
    return dbDTO(db);
  },

  async addRow(workspaceId: string, id: string) {
    const db = await loadDb(workspaceId, id);
    const last = await DatabaseRowModel.findOne({ databaseId: db._id, workspaceId })
      .sort({ order: -1 })
      .lean();
    const row = await DatabaseRowModel.create({
      _id: randomUUID(),
      databaseId: db._id,
      workspaceId: new Types.ObjectId(workspaceId),
      cells: {},
      order: (last?.order ?? -1) + 1,
    });
    return rowDTO(row);
  },

  async updateCells(
    workspaceId: string,
    id: string,
    rowId: string,
    cells: Record<string, unknown>,
  ) {
    const db = await loadDb(workspaceId, id);
    const row = await DatabaseRowModel.findOne({ _id: rowId, databaseId: db._id, workspaceId });
    if (!row) throw new HttpError(404, 'RowNotFound');
    row.cells = { ...(row.cells as Record<string, unknown>), ...cells };
    row.markModified('cells');
    await row.save();
    return rowDTO(row);
  },

  async deleteRow(workspaceId: string, id: string, rowId: string) {
    const db = await loadDb(workspaceId, id);
    await DatabaseRowModel.deleteOne({ _id: rowId, databaseId: db._id, workspaceId });
    return { ok: true as const };
  },
};
