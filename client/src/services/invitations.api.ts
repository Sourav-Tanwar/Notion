import { api } from './http';

export interface InvitationDTO {
  id: string;
  workspaceId: string;
  email: string;
  role: 'admin' | 'member' | 'guest';
  invitedBy: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface InvitationPreviewDTO {
  workspace: { name: string; iconEmoji: string } | null;
  inviterName: string | null;
  role: 'admin' | 'member' | 'guest';
  email: string;
  expiresAt: string;
}

export const invitationsApi = {
  /* --- Admin (workspace-scoped) --- */
  list: (workspaceId: string) =>
    api<InvitationDTO[]>(`/workspaces/${workspaceId}/invitations`),

  create: (workspaceId: string, input: { email: string; role: 'admin' | 'member' | 'guest' }) =>
    api<InvitationDTO>(`/workspaces/${workspaceId}/invitations`, {
      method: 'POST',
      json: input,
    }),

  resend: (workspaceId: string, invitationId: string) =>
    api<InvitationDTO>(`/workspaces/${workspaceId}/invitations/${invitationId}/resend`, {
      method: 'POST',
    }),

  revoke: (workspaceId: string, invitationId: string) =>
    api<InvitationDTO>(`/workspaces/${workspaceId}/invitations/${invitationId}`, {
      method: 'DELETE',
    }),

  /* --- Invitee --- */
  // Preview is unauthenticated — the invitee may not yet have an account.
  preview: (token: string) =>
    api<InvitationPreviewDTO>(`/invitations/${encodeURIComponent(token)}`, { auth: false }),

  accept: (token: string) =>
    api<{ workspaceId: string; role: 'owner' | 'admin' | 'member' | 'guest' }>(
      `/invitations/${encodeURIComponent(token)}/accept`,
      { method: 'POST' },
    ),
};
