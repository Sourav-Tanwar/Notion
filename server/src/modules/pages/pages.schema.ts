import { z } from 'zod';

export const createPageSchema = z.object({
  title: z.string().max(200).optional(),
  parentId: z.string().nullable().optional(),
  icon: z.string().max(8).optional(),
});

export const updatePageSchema = z.object({
  title: z.string().max(200).optional(),
  icon: z.string().max(8).optional(),
  parentId: z.string().nullable().optional(),
  order: z.number().optional(),
  favorite: z.boolean().optional(),
  coverUrl: z.string().url().nullable().optional(),
  fullWidth: z.boolean().optional(),
  smallText: z.boolean().optional(),
  locked: z.boolean().optional(),
});

export const reorderPagesSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      parentId: z.string().nullable(),
      order: z.number(),
    }),
  ),
});

export const createFromTemplateSchema = z.object({
  parentId: z.string().nullable().optional(),
});

export const importMarkdownSchema = z.object({
  // ~2 MB of text is far more than any sane single page; guards against abuse.
  markdown: z.string().min(1).max(2_000_000),
  parentId: z.string().nullable().optional(),
});
