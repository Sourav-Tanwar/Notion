/**
 * Verifies that wiping the access token (e.g. because a /refresh failed inside
 * the http client) flips the auth store from 'authed' to 'guest' without any
 * caller having to coordinate. Uses the REAL `tokens` singleton (so we can
 * exercise the subscriber) but stubs the network so no fetch goes out.
 */
import { act } from 'react';

jest.mock('@/services/auth.api', () => ({
  authApi: {
    login: jest.fn(async () => ({ accessToken: 'access-1', user: USER })),
    signup: jest.fn(),
    logout: jest.fn(async () => ({ ok: true })),
    logoutAll: jest.fn(),
    me: jest.fn(),
    changePassword: jest.fn(),
    requestVerify: jest.fn(async () => ({ ok: true })),
    requestPasswordSetup: jest.fn(),
  },
  profileApi: { update: jest.fn(), uploadAvatar: jest.fn(), clearAvatar: jest.fn() },
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
import { tokens } from '@/services/http';

afterEach(() => {
  useAuthStore.setState({ user: null, status: 'idle', error: null, verifyResendAt: null });
  tokens.set(null);
});

test('clearing the access token while authed flips state to guest', async () => {
  await act(async () => { await useAuthStore.getState().login('a@b.co', 'pw'); });
  expect(useAuthStore.getState().status).toBe('authed');
  act(() => { tokens.set(null); });
  expect(useAuthStore.getState().status).toBe('guest');
  expect(useAuthStore.getState().user).toBeNull();
});

test('resendVerification sets a cooldown and rolls it back on failure', async () => {
  const { authApi } = jest.requireMock('@/services/auth.api') as {
    authApi: { requestVerify: jest.Mock };
  };
  await act(async () => { await useAuthStore.getState().login('a@b.co', 'pw'); });

  await act(async () => { await useAuthStore.getState().resendVerification(); });
  expect(useAuthStore.getState().verifyResendAt).toBeGreaterThan(Date.now());

  // Second call while in cooldown is a no-op (no extra requestVerify).
  authApi.requestVerify.mockClear();
  await act(async () => { await useAuthStore.getState().resendVerification(); });
  expect(authApi.requestVerify).not.toHaveBeenCalled();

  // Failure path rolls cooldown back so the user can retry.
  useAuthStore.setState({ verifyResendAt: null });
  authApi.requestVerify.mockRejectedValueOnce(new Error('boom'));
  await expect(useAuthStore.getState().resendVerification()).rejects.toThrow('boom');
  expect(useAuthStore.getState().verifyResendAt).toBeNull();
});
