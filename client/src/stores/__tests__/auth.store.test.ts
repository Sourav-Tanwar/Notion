/**
 * Auth store integration: stubs the http layer and verifies the state machine.
 */
import { act } from 'react';

jest.mock('@/services/http', () => {
  const tokens = {
    _t: null as string | null,
    get() { return this._t; },
    set(t: string | null) { this._t = t; },
    subscribe() { return () => undefined; },
  };
  return {
    tokens,
    tryRefresh: jest.fn(async () => false),
    ApiError: class extends Error {},
  };
});
jest.mock('@/services/auth.api', () => ({
  authApi: {
    login: jest.fn(async () => ({ accessToken: 'access-1', user: USER })),
    signup: jest.fn(async () => ({ accessToken: 'access-2', user: USER })),
    logout: jest.fn(async () => ({ ok: true })),
    logoutAll: jest.fn(async () => ({ ok: true })),
    me: jest.fn(async () => USER),
    changePassword: jest.fn(async () => ({ ok: true })),
  },
  profileApi: {
    update: jest.fn(async (p: object) => ({ ...USER, ...p })),
    uploadAvatar: jest.fn(),
    clearAvatar: jest.fn(),
  },
}));

const USER = {
  id: 'u1',
  email: 'a@b.co',
  emailVerified: false,
  name: 'A',
  username: null,
  bio: '',
  avatarUrl: null,
  role: 'user' as const,
  themePref: 'system' as const,
  hasPassword: true,
};

import { useAuthStore } from '@/stores/auth.store';
import { tokens, tryRefresh } from '@/services/http';

beforeEach(() => {
  useAuthStore.setState({ user: null, status: 'idle', error: null });
  (tokens as { set(t: string | null): void }).set(null);
  (tryRefresh as jest.Mock).mockReset();
});

test('login sets access token and user', async () => {
  await act(async () => { await useAuthStore.getState().login('a@b.co', 'pw'); });
  expect(useAuthStore.getState().status).toBe('authed');
  expect(useAuthStore.getState().user?.email).toBe('a@b.co');
  expect(tokens.get()).toBe('access-1');
});

test('logout clears state and access token', async () => {
  await act(async () => { await useAuthStore.getState().login('a@b.co', 'pw'); });
  await act(async () => { await useAuthStore.getState().logout(); });
  expect(useAuthStore.getState().status).toBe('guest');
  expect(useAuthStore.getState().user).toBeNull();
  expect(tokens.get()).toBeNull();
});

test('hydrate: no refresh cookie → guest', async () => {
  (tryRefresh as jest.Mock).mockResolvedValueOnce(false);
  await act(async () => { await useAuthStore.getState().hydrate(); });
  expect(useAuthStore.getState().status).toBe('guest');
});

test('hydrate: refresh succeeds → authed', async () => {
  (tryRefresh as jest.Mock).mockImplementationOnce(async () => {
    (tokens as { set(t: string | null): void }).set('refreshed');
    return true;
  });
  await act(async () => { await useAuthStore.getState().hydrate(); });
  expect(useAuthStore.getState().status).toBe('authed');
  expect(useAuthStore.getState().user?.email).toBe('a@b.co');
});

test('optimistic profile update reverts on server error', async () => {
  const { profileApi } = jest.requireMock('@/services/auth.api') as {
    profileApi: { update: jest.Mock };
  };
  await act(async () => { await useAuthStore.getState().login('a@b.co', 'pw'); });
  profileApi.update.mockRejectedValueOnce(new Error('UsernameTaken'));
  await expect(useAuthStore.getState().updateProfile({ username: 'taken' })).rejects.toThrow();
  // Reverted back to original user.
  expect(useAuthStore.getState().user?.username).toBeNull();
});
