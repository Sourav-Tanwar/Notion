import { authChannel, type AuthSignal } from '@/lib/authChannel';

/**
 * The setup file installs a BroadcastChannel polyfill that wires multiple
 * channels in the same process together; this lets us verify cross-tab
 * delivery without spawning workers.
 */

describe('authChannel', () => {
  afterEach(() => authChannel._reset());

  const USER = {
    id: 'u1',
    email: 'a@b.co',
    emailVerified: true,
    name: 'A',
    username: null,
    bio: '',
    avatarUrl: null,
    role: 'user' as const,
    themePref: 'system' as const,
    hasPassword: false,
  };

  test('delivers messages from other tabs', async () => {
    const received: AuthSignal[] = [];
    authChannel.subscribe((s) => received.push(s));

    // Simulate a sibling tab by posting from a separate BroadcastChannel.
    const other = new BroadcastChannel('auth');
    other.postMessage({ tabId: 'other-tab', signal: { type: 'LOGOUT' } });
    await flush();
    other.close();

    expect(received).toEqual([{ type: 'LOGOUT' }]);
  });

  test('ignores its own posts (no echo loop)', async () => {
    const received: AuthSignal[] = [];
    authChannel.subscribe((s) => received.push(s));
    authChannel.post({ type: 'USER_UPDATED', user: USER });
    await flush();
    expect(received).toEqual([]);
  });
});

function flush(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}
