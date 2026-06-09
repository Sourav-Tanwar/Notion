import { api } from './http';

export interface ShareLinkDTO {
  id: string;
  pageId: string;
  workspaceId: string;
  hasPassword: boolean;
  expiresAt: string | null;
  includeSubpages: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  revokedAt: string | null;
  lastAccessedAt: string | null;
}

/** The create / regenerate response — extends `ShareLinkDTO` with the raw
 *  token (only emitted once). The UI is responsible for displaying or
 *  copying it before navigating away. */
export interface CreatedShareLinkDTO extends ShareLinkDTO {
  token: string;
}

export interface PublicLinkInfoDTO {
  hasPassword: boolean;
  expiresAt: string | null;
  includeSubpages: boolean;
}

export interface PublicPageNode {
  id: string;
  parentId: string | null;
  title: string;
  icon: string;
  coverUrl: string | null;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface PublicBlockDTO {
  id: string;
  pageId: string;
  parentId: string | null;
  type: string;
  text: string;
  order: number;
  props: Record<string, unknown>;
}

/** ---- Admin (authenticated, workspace-scoped) ---- */

export const shareLinksApi = {
  list: (pageId: string) => api<ShareLinkDTO[]>(`/pages/${pageId}/share-links`),

  create: (
    pageId: string,
    input: { password?: string; expiresAt?: string | null; includeSubpages?: boolean } = {},
  ) =>
    api<CreatedShareLinkDTO>(`/pages/${pageId}/share-links`, {
      method: 'POST',
      json: input,
    }),

  update: (
    pageId: string,
    linkId: string,
    input: {
      password?: string | null;
      expiresAt?: string | null;
      includeSubpages?: boolean;
    },
  ) =>
    api<ShareLinkDTO>(`/pages/${pageId}/share-links/${linkId}`, {
      method: 'PATCH',
      json: input,
    }),

  revoke: (pageId: string, linkId: string) =>
    api<{ ok: true }>(`/pages/${pageId}/share-links/${linkId}`, { method: 'DELETE' }),
};

/** ---- Public (anonymous, token-bearer) ---- */

/**
 * Public viewer client. All requests are unauthenticated; the password
 * (when present) is sent via the `x-share-password` header per call rather
 * than via cookie — matches the stateless server-side check.
 */
export const publicShareApi = {
  info: (token: string) =>
    api<PublicLinkInfoDTO>(`/public/links/${token}`, { auth: false }),

  unlock: (token: string, password: string) =>
    api<{ ok: true }>(`/public/links/${token}/unlock`, {
      method: 'POST',
      auth: false,
      json: { password },
    }),

  tree: (token: string, password?: string) =>
    api<PublicPageNode[]>(`/public/links/${token}/tree`, {
      auth: false,
      headers: passwordHeader(password),
    }),

  blocks: (token: string, pageId: string, password?: string) =>
    api<PublicBlockDTO[]>(`/public/links/${token}/pages/${pageId}/blocks`, {
      auth: false,
      headers: passwordHeader(password),
    }),
};

function passwordHeader(password?: string): Record<string, string> {
  return password ? { 'x-share-password': password } : {};
}
