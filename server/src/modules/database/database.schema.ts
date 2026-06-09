import { z } from 'zod';

const columnType = z.enum(['text', 'number', 'select', 'checkbox', 'date', 'url', 'email', 'phone']);

export const createDatabaseSchema = z.object({
  pageId: z.string(),
  title: z.string().max(200).optional(),
});

export const renameDatabaseSchema = z.object({
  title: z.string().max(200),
});

export const addColumnSchema = z.object({
  name: z.string().max(120).optional(),
  type: columnType,
});

export const updateColumnSchema = z.object({
  name: z.string().max(120).optional(),
  type: columnType.optional(),
});

export const addOptionSchema = z.object({
  name: z.string().max(120),
  color: z.string().max(20).optional(),
});

export const updateCellsSchema = z.object({
  cells: z.record(z.string(), z.unknown()),
});
