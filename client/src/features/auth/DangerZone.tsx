import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth.store';
import { ApiError } from '@/services/http';

/**
 * "Delete account" danger zone, intended to mount at the bottom of the
 * account settings page.
 *
 * Threat model:
 *  - We require typing the literal word DELETE to defeat muscle-memory clicks.
 *  - For password-bearing users we ask for the current password as a re-auth.
 *    OAuth-only users prove possession via the fact that the session is fresh
 *    (the server enforces `requireFreshUser`).
 *  - Once submitted, the server scrubs PII server-side; this component just
 *    redirects to the login screen.
 */
export function DangerZone(): JSX.Element {
  const user = useAuthStore((s) => s.user);
  const deleteAccount = useAuthStore((s) => s.deleteAccount);
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [password, setPassword] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasPassword = !!user?.hasPassword;
  const canSubmit = confirm === 'DELETE' && (!hasPassword || password.length > 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAccount({
        currentPassword: hasPassword ? password : undefined,
        reason: reason.trim() || undefined,
      });
      navigate('/login', { replace: true });
    } catch (e) {
      const code = e instanceof ApiError ? e.message : (e as Error).message;
      setError(humanize(code));
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 rounded-lg border border-red-500/40 bg-red-500/5 p-4">
      <header>
        <h2 className="text-sm font-semibold text-red-500">Danger zone</h2>
        <p className="text-xs text-zinc-500">
          Permanently delete your account and all of your pages. This cannot be undone.
        </p>
      </header>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md border border-red-500/40 bg-canvas px-3 py-1.5 text-sm text-red-500 hover:bg-red-500/10"
        >
          Delete account…
        </button>
      ) : (
        <form onSubmit={submit} className="space-y-3" noValidate>
          {hasPassword && (
            <label className="block text-xs">
              <span className="text-zinc-500">Current password</span>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-canvas px-2 py-1.5 text-sm"
                required
              />
            </label>
          )}
          <label className="block text-xs">
            <span className="text-zinc-500">Reason (optional)</span>
            <input
              value={reason}
              maxLength={500}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-canvas px-2 py-1.5 text-sm"
            />
          </label>
          <label className="block text-xs">
            <span className="text-zinc-500">
              Type <span className="font-mono font-semibold text-foreground">DELETE</span> to confirm
            </span>
            <input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-canvas px-2 py-1.5 text-sm font-mono"
              autoComplete="off"
            />
          </label>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={!canSubmit || busy}
              className="rounded-md bg-red-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
            >
              {busy ? 'Deleting…' : 'Permanently delete account'}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={busy}
              className="rounded-md border border-border bg-canvas px-3 py-1.5 text-sm hover:bg-sidebar"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function humanize(code: string): string {
  switch (code) {
    case 'ReauthRequired': return 'Please re-enter your password.';
    case 'InvalidCredentials': return 'That password is not correct.';
    case 'StaleSession': return 'For your security, please log in again before deleting.';
    default: return code || 'Could not delete account.';
  }
}
