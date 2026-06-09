import { api } from './http';

export type PageLevel = 'none' | 'view' | 'comment' | 'edit' | 'full';
export type GrantableLevel = Exclude<PageLevel, 'none'>;

export interface PagePermissionDTO {
  id: string;
  pageId: string;
  userId: string;
  level: GrantableLevel;
  grantedBy: string;
  createdAt: string;
  updatedAt: string;
  user: { id: string; email: string; name: string; avatarUrl: string | null } | null;
}

export interface PageAccessDTO {
  level: PageLevel;
  role: 'owner' | 'admin' | 'member' | 'guest';
}

export interface CandidateDTO {
  userId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: 'owner' | 'admin' | 'member' | 'guest';
}

export const pagePermissionsApi = {
  /** Effective access for the current viewer on a page. Used by the editor
   *  to decide read-only mode and whether to show the Share button. */
  access: (pageId: string) => api<PageAccessDTO>(`/pages/${pageId}/access`),

  list: (pageId: string) => api<PagePermissionDTO[]>(`/pages/${pageId}/permissions`),

  upsert: (pageId: string, input: { userId: string; level: GrantableLevel }) =>
    api<PagePermissionDTO>(`/pages/${pageId}/permissions`, {
      method: 'PUT',
      json: input,
    }),

  remove: (pageId: string, userId: string) =>
    api<{ ok: true }>(`/pages/${pageId}/permissions/${userId}`, { method: 'DELETE' }),

  findCandidate: (pageId: string, email: string) =>
    api<CandidateDTO | null>(
      `/pages/${pageId}/permissions/candidate?email=${encodeURIComponent(email)}`,
    ),
};
