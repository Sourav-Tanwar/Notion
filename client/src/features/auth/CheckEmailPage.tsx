import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import { authApi } from '@/services/auth.api';
import { ApiError } from '@/services/http';

/**
 * "Check your email" page shown after signup.
 *
 * Anti-enumeration: the server never tells us whether the email was new or
 * existing — both paths land here. We display the same copy in both cases.
 * The user receives either a verification mail (new account) or an
 * "already-registered" mail (existing account) in the same inbox; only the
 * legitimate inbox owner can distinguish.
 *
 * Resend is rate-limited server-side (`/auth/request-verify`). A short client
 * cooldown stops accidental double-clicks from hitting the limiter.
 */
const RESEND_COOLDOWN_MS = 60_000;

export function CheckEmailPage(): JSX.Element {
  const [params] = useSearchParams();
  const email = params.get('email') ?? '';
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [resentAt, setResentAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function resend() {
    if (!email) return;
    const now = Date.now();
    if (resentAt && now - resentAt < RESEND_COOLDOWN_MS) return;
    setBusy(true);
    setError(null);
    try {
      await authApi.requestVerify(email);
      setResentAt(now);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not resend');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full items-center justify-center px-4">
      <div className="w-full max-w-md space-y-4 rounded-lg border border-border bg-surface p-6">
        <h1 className="text-xl font-semibold">Check your email</h1>
        <p className="text-sm text-zinc-500">
          We sent a message to{' '}
          <span className="font-medium text-foreground">{email || 'your email address'}</span>. Click
          the link inside to finish signing up.
        </p>
        <p className="text-xs text-zinc-500">
          Don&apos;t see it? Check your spam folder, or resend the link below. If an account already
          existed for this address, you&apos;ll instead receive instructions to sign in.
        </p>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={resend}
            disabled={busy || !email}
            className="rounded-md border border-border bg-canvas px-3 py-1.5 text-sm hover:bg-sidebar disabled:opacity-50"
          >
            {busy ? 'Sending…' : resentAt ? 'Resent' : 'Resend email'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="text-sm text-accent hover:underline"
          >
            Back to login
          </button>
        </div>
        <p className="border-t border-border pt-3 text-xs text-zinc-500">
          Wrong email? <Link to="/signup" className="text-accent hover:underline">Try again</Link>
        </p>
      </div>
    </div>
  );
}
