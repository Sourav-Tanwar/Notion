import { z } from 'zod';
import { BLOCK_TYPES } from './blocks.model';

const blockBase = z.object({
  id: z.string().min(1),
  pageId: z.string().min(1),
  parentId: z.string().nullable().default(null),
  type: z.enum(BLOCK_TYPES),
  text: z.string().default(''),
  order: z.number().default(0),
  props: z.record(z.unknown()).default({}),
});

export const upsertBlocksSchema = z.object({
  blocks: z.array(blockBase),
});

export const deleteBlocksSchema = z.object({
  ids: z.array(z.string().min(1)),
});

export const reorderBlocksSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      parentId: z.string().nullable(),
      order: z.number(),
    }),
  ),
});

export type UpsertBlock = z.infer<typeof blockBase>;
