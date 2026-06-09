import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { invitationsApi, type InvitationPreviewDTO } from '@/services/invitations.api';
import { useAuthStore } from '@/stores/auth.store';
import { useWorkspaceStore } from '@/stores/workspace.store';

/**
 * Accept invitation page (route: /invitations/:token).
 *
 * Three states the UI must handle cleanly:
 *  1. Unauthenticated: show preview + a "log in to accept" button that
 *     redirects through /login?next=/invitations/:token. We DON'T auto-accept
 *     after login because the email on the invite must match the logged-in
 *     user's email — enforced server-side, but the UI flow stays the same.
 *  2. Authenticated, email mismatch: surface a clear "this invite was for
 *     foo@bar.com — log in with that account" message.
 *  3. Authenticated, email match: single click to accept. On success the
 *     workspace list is refetched and the new workspace becomes active.
 *
 * The preview endpoint is intentionally public; we never reveal more than
 * (workspace name, inviter display name, role). No member list, no page
 * count.
 */
export function AcceptInvitationPage(): JSX.Element {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const status = useAuthStore((s) => s.status);
  const fetchWorkspaces = useWorkspaceStore((s) => s.fetch);
  const setActive = useWorkspaceStore((s) => s.setActive);

  const [preview, setPreview] = useState<InvitationPreviewDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        setPreview(await invitationsApi.preview(token));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Invitation not found');
      }
    })();
  }, [token]);

  const handleAccept = async () => {
    if (!token) return;
    setAccepting(true);
    setError(null);
    try {
      const { workspaceId } = await invitationsApi.accept(token);
      await fetchWorkspaces();
      await setActive(workspaceId);
      navigate('/', { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to accept');
    } finally {
      setAccepting(false);
    }
  };

  if (status === 'hydrating' || status === 'idle') {
    return <Centered>Loading…</Centered>;
  }

  if (error) {
    return (
      <Centered>
        <h1 className="mb-2 text-lg font-semibold">Invitation unavailable</h1>
        <p className="text-sm text-zinc-500">{error}</p>
        <Link to="/" className="mt-4 inline-block text-sm text-blue-600 hover:underline">
          Go home
        </Link>
      </Centered>
    );
  }

  if (!preview) return <Centered>Loading invitation…</Centered>;

  const emailMismatch = user && user.email.toLowerCase() !== preview.email.toLowerCase();
  const isGuest = status === 'guest';

  return (
    <Centered>
      <div className="text-4xl">{preview.workspace?.iconEmoji ?? '✉️'}</div>
      <h1 className="mt-3 text-xl font-semibold">
        Join {preview.workspace?.name ?? 'this workspace'}
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        {preview.inviterName ?? 'Someone'} invited <strong>{preview.email}</strong> as{' '}
        <strong>{preview.role}</strong>.
      </p>
      <p className="mt-1 text-xs text-zinc-400">
        Expires {new Date(preview.expiresAt).toLocaleString()}
      </p>

      <div className="mt-6">
        {isGuest && (
          <Link
            to={`/login?next=${encodeURIComponent(`/invitations/${token}`)}`}
            className="inline-block rounded bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            Log in to accept
          </Link>
        )}
        {!isGuest && emailMismatch && (
          <div className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
            You're signed in as <strong>{user?.email}</strong>. This invitation is for{' '}
            <strong>{preview.email}</strong> — log in with that account to accept.
          </div>
        )}
        {!isGuest && !emailMismatch && (
          <button
            onClick={handleAccept}
            disabled={accepting}
            className="rounded bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {accepting ? 'Joining…' : 'Accept invitation'}
          </button>
        )}
      </div>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-6 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        {children}
      </div>
    </div>
  );
}
