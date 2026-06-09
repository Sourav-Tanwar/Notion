import { api, apiUpload } from './http';
import type { User } from '@/types/domain';

export interface AuthResponse {
  accessToken: string;
  user: User;
}

/**
 * Signup never returns tokens — anti-enumeration: the server replies with the
 * same shape regardless of whether the email is new. The user proves inbox
 * possession via the verification link, then signs in.
 */
export interface SignupResponse {
  ok: true;
  requiresVerification: true;
}

export interface SessionInfo {
  id: string;
  device: string;
  browser: string;
  os: string;
  ip: string;
  lastActiveAt: string;
  createdAt: string;
  current: boolean;
}

export interface ServerConfig {
  captcha: { provider: 'turnstile'; siteKey: string } | null;
  emailVerificationRequired: boolean;
}

export const authApi = {
  signup: (email: string, password: string, name?: string, captchaToken?: string) =>
    api<SignupResponse>('/auth/signup', {
      method: 'POST',
      json: { email, password, name, captchaToken },
      auth: false,
    }),
  login: (email: string, password: string, captchaToken?: string) =>
    api<AuthResponse>('/auth/login', {
      method: 'POST',
      json: { email, password, captchaToken },
      auth: false,
    }),
  logout: () => api<{ ok: true }>('/auth/logout', { method: 'POST', auth: false }),
  logoutAll: () => api<{ ok: true }>('/auth/logout-all', { method: 'POST' }),
  refresh: () => api<AuthResponse>('/auth/refresh', { method: 'POST', auth: false }),
  me: () => api<User>('/auth/me'),

  requestVerify: (email: string, captchaToken?: string) =>
    api<{ ok: true }>('/auth/request-verify', {
      method: 'POST',
      json: { email, captchaToken },
      auth: false,
    }),
  verifyEmail: (token: string) =>
    api<{ user: User }>('/auth/verify-email', { method: 'POST', json: { token }, auth: false }),

  forgotPassword: (email: string, captchaToken?: string) =>
    api<{ ok: true }>('/auth/forgot-password', {
      method: 'POST',
      json: { email, captchaToken },
      auth: false,
    }),
  resetPassword: (token: string, password: string) =>
    api<{ ok: true }>('/auth/reset-password', { method: 'POST', json: { token, password }, auth: false }),
  changePassword: (currentPassword: string, newPassword: string) =>
    api<{ ok: true }>('/auth/change-password', { method: 'POST', json: { currentPassword, newPassword } }),

  /** OAuth-only accounts request a one-time link to mint a password credential. */
  requestPasswordSetup: () =>
    api<{ ok: true }>('/auth/request-password-setup', { method: 'POST' }),
  /** Consume the link from `requestPasswordSetup`; sets the first password. */
  setPassword: (token: string, password: string) =>
    api<{ ok: true }>('/auth/set-password', { method: 'POST', json: { token, password }, auth: false }),

  oauthStartUrl: (provider: 'google', redirect = '/') =>
    `/api/auth/oauth/${provider}/start?redirect=${encodeURIComponent(redirect)}`,

  /* ---- Public server config (used by the SPA to decide whether to render Turnstile) ---- */
  config: () => api<ServerConfig>('/auth/config', { auth: false }),

  /* ---- Sessions / active devices ---- */
  listSessions: () => api<{ sessions: SessionInfo[] }>('/auth/sessions'),
  revokeSession: (id: string) =>
    api<{ ok: true }>(`/auth/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  revokeOtherSessions: () =>
    api<{ ok: true; revoked: number }>('/auth/sessions/others', { method: 'DELETE' }),

  /* ---- Account self-deletion ---- */
  deleteAccount: (input: { currentPassword?: string; reason?: string }) =>
    api<{ ok: true }>('/auth/me', {
      method: 'DELETE',
      json: { ...input, confirm: 'DELETE' },
    }),
};

export const profileApi = {
  update: (patch: Partial<Pick<User, 'name' | 'username' | 'bio' | 'themePref'>>) =>
    api<User>('/profile', { method: 'PATCH', json: patch }),
  uploadAvatar: (file: File) => {
    const fd = new FormData();
    fd.append('avatar', file);
    return apiUpload<User>('/profile/avatar', fd);
  },
  clearAvatar: () => api<User>('/profile/avatar', { method: 'DELETE' }),
};
