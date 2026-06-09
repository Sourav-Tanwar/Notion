import { create } from 'zustand';
import { authApi, profileApi } from '@/services/auth.api';
import { tokens, tryRefresh } from '@/services/http';
import { workspacesApi } from '@/services/workspaces.api';
import { getActiveWorkspaceId, setActiveWorkspaceId } from '@/services/activeWorkspace';
import { authChannel } from '@/lib/authChannel';
import { usePagesStore } from '@/stores/pages.store';
import { useBlocksStore } from '@/stores/blocks.store';
import { useSelectionStore } from '@/stores/selection.store';
import { useWorkspaceStore } from '@/stores/workspace.store';
import type { User } from '@/types/domain';

/** Wipe all workspace-scoped state so a new account doesn't see stale data. */
function resetWorkspaceStores(): void {
  usePagesStore.getState().reset();
  useBlocksStore.getState().reset();
  useSelectionStore.getState().clear();
  useWorkspaceStore.getState().reset();
}

/**
 * Resolve & install an active workspace for the authed user.
 *
 * Strategy:
 *  - If localStorage has an id AND it appears in the list → keep it.
 *  - Otherwise prefer the most recently used (top of the list — server sorts
 *    by `lastSeenAt`). The server always guarantees a personal workspace.
 *
 * Never throws: workspace bootstrap must not break sign-in. A null active
 * workspace simply causes subsequent page/block calls to 400 with a clear
 * error, surfaced to the user as a banner in Slice 7.6's switcher.
 */
async function bootstrapActiveWorkspace(): Promise<void> {
  try {
    const list = await workspacesApi.list();
    // Push into the workspace store so the Switcher renders immediately on
    // first paint, without waiting for its own useEffect to refetch.
    useWorkspaceStore.setState({ list, loaded: true, error: null });
    if (!list.length) return;
    const stored = getActiveWorkspaceId();
    const stillValid = stored && list.some((w) => w.id === stored);
    setActiveWorkspaceId(stillValid ? stored : list[0].id);
  } catch {
    /* swallow — user can still hit /workspaces from the UI to recover */
  }
}

type Status = 'idle' | 'hydrating' | 'authed' | 'guest';

interface AuthState {
  user: User | null;
  status: Status;
  error: string | null;
  /** Epoch ms when the user is allowed to request another verification email. */
  verifyResendAt: number | null;

  /* lifecycle */
  hydrate: () => Promise<void>;
  setSession: (accessToken: string, user: User) => void;

  /* email/password */
  login: (email: string, password: string, captchaToken?: string) => Promise<void>;
  /** Signup never auto-logs-in (anti-enumeration). Resolves once the email has
   *  been queued; the UI should route the user to a "check your email" page. */
  signup: (
    email: string,
    password: string,
    name?: string,
    captchaToken?: string,
  ) => Promise<{ email: string }>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;

  /* profile */
  patchUser: (patch: Partial<User>) => void;
  updateProfile: (patch: Partial<Pick<User, 'name' | 'username' | 'bio' | 'themePref'>>) => Promise<void>;
  uploadAvatar: (file: File) => Promise<void>;
  clearAvatar: () => Promise<void>;
  changePassword: (current: string, next: string) => Promise<void>;
  /** Permanent self-deletion. Server requires the password for non-OAuth-only
   *  accounts; pass `undefined` when the user has no password. */
  deleteAccount: (input: { currentPassword?: string; reason?: string }) => Promise<void>;

  /* email verification + password setup */
  resendVerification: () => Promise<void>;
  requestPasswordSetup: () => Promise<void>;
}

const RESEND_COOLDOWN_MS = 60_000;

/**
 * Suppresses re-broadcasts when applying a signal that came in from another
 * tab. Without this, two tabs would ping-pong forever.
 */
let applyingRemote = false;

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  status: 'idle',
  error: null,
  verifyResendAt: null,

  async hydrate() {
    set({ status: 'hydrating' });
    try {
      const ok = await tryRefresh();
      if (!ok) {
        set({ status: 'guest', user: null });
        return;
      }
      const user = await authApi.me();
      set({ user, status: 'authed' });
      await bootstrapActiveWorkspace();
    } catch {
      tokens.set(null);
      set({ status: 'guest', user: null });
    }
  },

  setSession(accessToken, user) {
    // Always wipe any prior account's in-memory workspace state before
    // installing the new session — otherwise the sidebar/editor briefly show
    // the previous user's pages/blocks until the next manual refresh.
    resetWorkspaceStores();
    setActiveWorkspaceId(null); // force re-resolve under the new identity
    tokens.set(accessToken);
    set({ user, status: 'authed', error: null });
    if (!applyingRemote) authChannel.post({ type: 'LOGIN', user });
    void bootstrapActiveWorkspace();
  },

  async login(email, password, captchaToken) {
    set({ error: null });
    const r = await authApi.login(email, password, captchaToken);
    get().setSession(r.accessToken, r.user);
  },

  async signup(email, password, name, captchaToken) {
    set({ error: null });
    // Server response is the same for new + existing emails. We never set a
    // session here — the UI navigates to /check-email and waits for the
    // verification link click.
    await authApi.signup(email, password, name, captchaToken);
    return { email };
  },

  async logout() {
    await authApi.logout().catch(() => undefined);
    tokens.set(null);
    setActiveWorkspaceId(null);
    resetWorkspaceStores();
    set({ user: null, status: 'guest' });
    if (!applyingRemote) authChannel.post({ type: 'LOGOUT' });
  },

  async logoutAll() {
    await authApi.logoutAll().catch(() => undefined);
    tokens.set(null);
    setActiveWorkspaceId(null);
    resetWorkspaceStores();
    set({ user: null, status: 'guest' });
    if (!applyingRemote) authChannel.post({ type: 'LOGOUT' });
  },

  patchUser(patch) {
    const current = get().user;
    if (!current) return;
    const next = { ...current, ...patch };
    set({ user: next });
    if (!applyingRemote) authChannel.post({ type: 'USER_UPDATED', user: next });
  },

  async updateProfile(patch) {
    const before = get().user;
    if (!before) return;
    set({ user: { ...before, ...patch } as User });
    try {
      const fresh = await profileApi.update(patch);
      set({ user: fresh });
      authChannel.post({ type: 'USER_UPDATED', user: fresh });
    } catch (e) {
      set({ user: before });
      throw e;
    }
  },

  async uploadAvatar(file) {
    const user = await profileApi.uploadAvatar(file);
    set({ user });
    authChannel.post({ type: 'USER_UPDATED', user });
  },

  async clearAvatar() {
    const user = await profileApi.clearAvatar();
    set({ user });
    authChannel.post({ type: 'USER_UPDATED', user });
  },

  async changePassword(current, next) {
    await authApi.changePassword(current, next);
    tokens.set(null);
    resetWorkspaceStores();
    set({ user: null, status: 'guest' });
    authChannel.post({ type: 'LOGOUT' });
  },

  async deleteAccount(input) {
    await authApi.deleteAccount(input);
    tokens.set(null);
    resetWorkspaceStores();
    set({ user: null, status: 'guest' });
    // Other tabs should drop the session as well.
    authChannel.post({ type: 'LOGOUT' });
  },

  async resendVerification() {
    const user = get().user;
    if (!user) return;
    const now = Date.now();
    const at = get().verifyResendAt;
    if (at && at > now) return; // client-side cooldown; server also rate-limits
    set({ verifyResendAt: now + RESEND_COOLDOWN_MS });
    try {
      await authApi.requestVerify(user.email);
    } catch (e) {
      set({ verifyResendAt: null });
      throw e;
    }
  },

  async requestPasswordSetup() {
    await authApi.requestPasswordSetup();
  },
}));

/* ---------- Selectors ---------- */
export const selectUser = (s: AuthState) => s.user;
export const selectIsAuthed = (s: AuthState) => s.status === 'authed';
export const selectAuthStatus = (s: AuthState) => s.status;
export const selectVerifyResendAt = (s: AuthState) => s.verifyResendAt;

/* ---------------------------------------------------------------------------
 * Reactive invalidation
 *
 * If anything causes the access token to be wiped (manual logout, the http
 * client failing to refresh after a 401, a tampered token), the auth store
 * must flip to 'guest' immediately so PrivateShell can <Navigate to="/login">.
 * Subscribing here keeps the state machine and the token singleton honest.
 * ------------------------------------------------------------------------- */
tokens.subscribe((t) => {
  if (t !== null) return;
  const s = useAuthStore.getState();
  if (s.status === 'authed') {
    useAuthStore.setState({ user: null, status: 'guest' });
    if (!applyingRemote) authChannel.post({ type: 'LOGOUT' });
  }
});

/* ---------------------------------------------------------------------------
 * Cross-tab application
 *
 * When another tab logs in or out, mirror the change here. We don't trust the
 * payload to carry an access token — we always reach back to /refresh to mint
 * one for this tab, which honours the httpOnly cookie and reuse detection.
 * ------------------------------------------------------------------------- */
authChannel.subscribe((sig) => {
  applyingRemote = true;
  try {
    if (sig.type === 'LOGOUT') {
      tokens.set(null);
      resetWorkspaceStores();
      useAuthStore.setState({ user: null, status: 'guest' });
      return;
    }
    if (sig.type === 'USER_UPDATED') {
      const cur = useAuthStore.getState().user;
      if (cur && cur.id === sig.user.id) {
        useAuthStore.setState({ user: sig.user });
      }
      return;
    }
    if (sig.type === 'LOGIN') {
      void (async () => {
        const ok = await tryRefresh();
        if (!ok) return;
        applyingRemote = true;
        try {
          resetWorkspaceStores();
          useAuthStore.setState({ user: sig.user, status: 'authed' });
        } finally {
          applyingRemote = false;
        }
      })();
    }
  } finally {
    applyingRemote = false;
  }
});
