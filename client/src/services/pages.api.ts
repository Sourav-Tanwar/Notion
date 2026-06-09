import { api, apiUpload } from './http';
import type { Page, ID } from '@/types/domain';

export interface HistoryRevision {
  id: string;
  revision: number;
  sizeBytes: number;
  createdAt: string;
  /** Why the row exists. `restore` rows are auto-archived "before" snapshots. */
  cause: 'autosave' | 'restore' | 'manual';
  /** Acting user for `restore`/`manual`; null for `autosave`. */
  createdBy: string | null;
}

export interface HistoryPreview extends HistoryRevision {
  html: string;
  plainText: string;
  blockCount: number;
}

export interface RestoreResult {
  ok: true;
  blocksUpdated: number;
  /** Whether the live room was mutated (true) or only the cold snapshot. */
  live: boolean;
  /** Original revision number that was restored. */
  revision: number;
  /**
   * Auto-archived "before" snapshot id, captured immediately prior to
   * the restore. Powers the Undo affordance — calling
   * `restoreFromHistory(pageId, beforeRevisionId)` rolls the page back
   * to its pre-restore state. `null` only if the archive write failed.
   */
  beforeRevisionId: string | null;
}

/** A page that links to another via an inline @-mention. */
export interface Backlink {
  id: ID;
  title: string;
  icon: string;
  snippet: string;
}

export const pagesApi = {
  list: () => api<Page[]>('/pages'),
  listTrash: () => api<Page[]>('/pages/trash'),
  create: (input: Partial<Pick<Page, 'title' | 'parentId' | 'icon'>>) =>
    api<Page>('/pages', { method: 'POST', json: input }),
  update: (id: ID, patch: Partial<Page>) =>
    api<Page>(`/pages/${id}`, { method: 'PATCH', json: patch }),
  /** Soft-delete (move to trash). */
  remove: (id: ID) => api<{ ok: true; archived: ID[] }>(`/pages/${id}`, { method: 'DELETE' }),
  restore: (id: ID) => api<{ ok: true; restored: ID[] }>(`/pages/${id}/restore`, { method: 'POST' }),
  /** Deep-copy a page (and its subtree) into a new independent page. */
  duplicate: (id: ID) => api<Page>(`/pages/${id}/duplicate`, { method: 'POST' }),
  /** Reusable templates in this workspace. */
  listTemplates: () => api<Page[]>('/pages/templates'),
  /** Snapshot a page (and its subtree) into a reusable template. */
  saveAsTemplate: (id: ID) => api<Page>(`/pages/${id}/template`, { method: 'POST' }),
  /** Instantiate a new page from a template. */
  createFromTemplate: (templateId: ID, parentId: ID | null = null) =>
    api<Page>(`/pages/templates/${templateId}/new`, { method: 'POST', json: { parentId } }),
  /** Create a page from a Markdown document (uploaded or pasted). */
  importMarkdown: (markdown: string, parentId: ID | null = null) =>
    api<Page>('/pages/import', { method: 'POST', json: { markdown, parentId } }),
  /** Pages that @-mention this page ("linked references"). */
  backlinks: (id: ID) => api<Backlink[]>(`/pages/${id}/backlinks`),
  removePermanent: (id: ID) =>
    api<{ ok: true; deleted: ID[] }>(`/pages/${id}/permanent`, { method: 'DELETE' }),
  reorder: (items: { id: ID; parentId: ID | null; order: number }[]) =>
    api<{ ok: true }>('/pages/reorder', { method: 'PATCH', json: { items } }),
  uploadCover: (id: ID, file: File) => {
    const fd = new FormData();
    fd.append('cover', file);
    return apiUpload<Page>(`/pages/${id}/cover`, fd);
  },
  removeCover: (id: ID) => api<Page>(`/pages/${id}/cover`, { method: 'DELETE' }),
  /** List archived snapshot revisions for this page, newest-first. */
  listHistory: (id: ID) => api<HistoryRevision[]>(`/pages/${id}/history`),
  /** Decoded HTML preview of a single revision. Heavy — call lazily. */
  getHistoryPreview: (id: ID, revisionId: string) =>
    api<HistoryPreview>(`/pages/${id}/history/${revisionId}/preview`),
  /**
   * Replace this page's inline content with the chosen revision.
   * Destructive. Requires `edit` permission. Live editors will receive
   * the rollback as Yjs updates and rerender in place.
   */
  restoreFromHistory: (id: ID, revisionId: string) =>
    api<RestoreResult>(`/pages/${id}/history/${revisionId}/restore`, { method: 'POST' }),
};
