import { create } from 'zustand';
import { authApi, type SessionInfo } from '@/services/auth.api';

/**
 * Sessions store — UI state for the "active devices" page.
 *
 * Why a dedicated store (vs. local component state):
 *  - Two places mutate sessions (revoke one, revoke others) and both want to
 *    reflect the result immediately without a round-trip if the network is
 *    slow. A store gives us cheap optimistic updates with a clean rollback.
 *  - The settings page may be reached, navigated away from, and reopened
 *    quickly. Keeping the last snapshot in a store skips a flicker on revisit.
 */
interface SessionsState {
  sessions: SessionInfo[];
  loading: boolean;
  error: string | null;
  fetch: () => Promise<void>;
  revoke: (id: string) => Promise<void>;
  revokeOthers: () => Promise<void>;
}

export const useSessionsStore = create<SessionsState>((set, get) => ({
  sessions: [],
  loading: false,
  error: null,

  async fetch() {
    set({ loading: true, error: null });
    try {
      const { sessions } = await authApi.listSessions();
      set({ sessions, loading: false });
    } catch (e) {
      set({ loading: false, error: (e as Error).message });
    }
  },

  async revoke(id) {
    const before = get().sessions;
    set({ sessions: before.filter((s) => s.id !== id) });
    try {
      await authApi.revokeSession(id);
    } catch (e) {
      // Restore on failure so the UI doesn't lie about state.
      set({ sessions: before, error: (e as Error).message });
      throw e;
    }
  },

  async revokeOthers() {
    const before = get().sessions;
    set({ sessions: before.filter((s) => s.current) });
    try {
      await authApi.revokeOtherSessions();
    } catch (e) {
      set({ sessions: before, error: (e as Error).message });
      throw e;
    }
  },
}));
