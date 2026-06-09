import { api, apiUpload } from './http';
import type { Block, ID } from '@/types/domain';

export const blocksApi = {
  listByPage: (pageId: ID) => api<Block[]>(`/blocks/page/${pageId}`),
  upsertMany: (blocks: Block[]) => api<{ ok: true }>('/blocks/bulk', { method: 'POST', json: { blocks } }),
  deleteMany: (ids: ID[]) => api<{ ok: true }>('/blocks/delete', { method: 'POST', json: { ids } }),
  reorder: (items: { id: ID; parentId: ID | null; order: number }[]) =>
    api<{ ok: true }>('/blocks/reorder', { method: 'PATCH', json: { items } }),
  /** Upload an image and get back the served URL to store in block props. */
  uploadImage: (file: File) => {
    const fd = new FormData();
    fd.append('image', file);
    return apiUpload<{ url: string; width: number; height: number }>('/blocks/image', fd);
  },
  /** Upload a generic attachment (video / file block). Stored verbatim. */
  uploadFile: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return apiUpload<{ url: string; name: string; size: number; mime: string }>('/blocks/file', fd);
  },
  /** Fetch Open Graph link-preview metadata for a bookmark block. */
  linkPreview: (url: string) =>
    api<{
      url: string;
      title: string;
      description: string;
      image: string | null;
      favicon: string | null;
      siteName: string | null;
    }>(`/blocks/bookmark?url=${encodeURIComponent(url)}`),
};
