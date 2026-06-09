/**
 * Phase-4 store tests:
 *  - Signup must NOT issue a session (anti-enumeration: identical response for
 *    new + existing emails travels through the inbox, not the HTTP response).
 *  - Account deletion must clear local state and drop the access token.
 *  - Sessions store must apply optimistic mutations and roll back on failure.
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

const sessionsList: Array<{ id: string; current: boolean }> = [];
jest.mock('@/services/auth.api', () => ({
  authApi: {
    login: jest.fn(),
    signup: jest.fn(async () => ({ ok: true, requiresVerification: true })),
    logout: jest.fn(async () => ({ ok: true })),
    deleteAccount: jest.fn(async () => ({ ok: true })),
    me: jest.fn(),
    changePassword: jest.fn(),
    requestPasswordSetup: jest.fn(),
    requestVerify: jest.fn(async () => ({ ok: true })),
    listSessions: jest.fn(async () => ({ sessions: sessionsList.slice() })),
    revokeSession: jest.fn(async () => ({ ok: true })),
    revokeOtherSessions: jest.fn(async () => ({ ok: true, revoked: 0 })),
  },
  profileApi: { update: jest.fn(), uploadAvatar: jest.fn(), clearAvatar: jest.fn() },
}));

import { useAuthStore } from '@/stores/auth.store';
import { useSessionsStore } from '@/stores/sessions.store';
import { tokens } from '@/services/http';
import { authApi } from '@/services/auth.api';

beforeEach(() => {
  useAuthStore.setState({ user: null, status: 'guest', error: null });
  useSessionsStore.setState({ sessions: [], loading: false, error: null });
  (tokens as { set(t: string | null): void }).set(null);
  jest.clearAllMocks();
  sessionsList.length = 0;
});

test('signup does NOT auto-login (anti-enumeration)', async () => {
  const ret = await act(async () =>
    useAuthStore.getState().signup('new@example.com', 'Aa1aaaaa', 'New'),
  );
  expect(authApi.signup).toHaveBeenCalledWith('new@example.com', 'Aa1aaaaa', 'New', undefined);
  expect(useAuthStore.getState().status).toBe('guest');
  expect(useAuthStore.getState().user).toBeNull();
  expect(tokens.get()).toBeNull();
  expect(ret.email).toBe('new@example.com');
});

test('deleteAccount clears local state and the access token', async () => {
  // Pretend the user is signed in.
  (tokens as { set(t: string | null): void }).set('access-1');
  useAuthStore.setState({
    user: { id: 'u', email: 'a@b.co', hasPassword: true } as never,
    status: 'authed',
  });
  await act(async () => {
    await useAuthStore.getState().deleteAccount({ currentPassword: 'pw' });
  });
  expect(authApi.deleteAccount).toHaveBeenCalledWith({ currentPassword: 'pw' });
  expect(useAuthStore.getState().status).toBe('guest');
  expect(useAuthStore.getState().user).toBeNull();
  expect(tokens.get()).toBeNull();
});

test('sessions.revoke optimistically removes the row', async () => {
  sessionsList.push({ id: 's-current', current: true }, { id: 's-old', current: false });
  await act(async () => { await useSessionsStore.getState().fetch(); });
  expect(useSessionsStore.getState().sessions).toHaveLength(2);

  await act(async () => { await useSessionsStore.getState().revoke('s-old'); });
  expect(authApi.revokeSession).toHaveBeenCalledWith('s-old');
  expect(useSessionsStore.getState().sessions.map((s) => s.id)).toEqual(['s-current']);
});

test('sessions.revoke rolls back when the server rejects', async () => {
  sessionsList.push({ id: 's-current', current: true }, { id: 's-old', current: false });
  await act(async () => { await useSessionsStore.getState().fetch(); });
  (authApi.revokeSession as jest.Mock).mockRejectedValueOnce(new Error('boom'));
  await expect(useSessionsStore.getState().revoke('s-old')).rejects.toThrow('boom');
  expect(useSessionsStore.getState().sessions.map((s) => s.id)).toEqual(['s-current', 's-old']);
});

test('sessions.revokeOthers keeps only the current row, rolls back on error', async () => {
  sessionsList.push(
    { id: 'a', current: true },
    { id: 'b', current: false },
    { id: 'c', current: false },
  );
  await act(async () => { await useSessionsStore.getState().fetch(); });
  await act(async () => { await useSessionsStore.getState().revokeOthers(); });
  expect(useSessionsStore.getState().sessions.map((s) => s.id)).toEqual(['a']);

  // Rollback case
  sessionsList.length = 0;
  sessionsList.push({ id: 'a', current: true }, { id: 'b', current: false });
  await act(async () => { await useSessionsStore.getState().fetch(); });
  (authApi.revokeOtherSessions as jest.Mock).mockRejectedValueOnce(new Error('nope'));
  await expect(useSessionsStore.getState().revokeOthers()).rejects.toThrow('nope');
  expect(useSessionsStore.getState().sessions).toHaveLength(2);
});
