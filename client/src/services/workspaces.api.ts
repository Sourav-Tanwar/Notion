import { api } from './http';

export interface WorkspaceDTO {
  id: string;
  name: string;
  slug: string;
  kind: 'personal' | 'team';
  iconEmoji: string;
  createdBy: string;
  archivedAt: string | null;
  role: 'owner' | 'admin' | 'member' | 'guest';
  createdAt: string;
  updatedAt: string;
}

export interface MemberDTO {
  id: string;
  userId: string;
  role: 'owner' | 'admin' | 'member' | 'guest';
  joinedAt: string;
  user: { id: string; email: string; name: string; avatarUrl: string | null } | null;
}

export const workspacesApi = {
  list: () => api<WorkspaceDTO[]>('/workspaces'),
  create: (input: { name: string; iconEmoji?: string }) =>
    api<WorkspaceDTO>('/workspaces', { method: 'POST', json: input }),
  update: (id: string, input: { name?: string; iconEmoji?: string }) =>
    api<WorkspaceDTO>(`/workspaces/${id}`, { method: 'PATCH', json: input }),
  archive: (id: string) => api<{ ok: true }>(`/workspaces/${id}`, { method: 'DELETE' }),

  listMembers: (id: string) => api<MemberDTO[]>(`/workspaces/${id}/members`),
  updateMember: (id: string, userId: string, role: 'admin' | 'member' | 'guest') =>
    api<MemberDTO>(`/workspaces/${id}/members/${userId}`, { method: 'PATCH', json: { role } }),
  removeMember: (id: string, userId: string) =>
    api<{ ok: true }>(`/workspaces/${id}/members/${userId}`, { method: 'DELETE' }),
};
