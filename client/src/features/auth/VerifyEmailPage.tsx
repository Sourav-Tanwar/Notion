import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { authApi } from '@/services/auth.api';
import { ApiError } from '@/services/http';
import { useAuthStore } from '@/stores/auth.store';

type State = { kind: 'idle' } | { kind: 'verifying' } | { kind: 'success' } | { kind: 'error'; message: string };

export function VerifyEmailPage(): JSX.Element {
  const [params] = useSearchParams();
  const token = params.get('token');
  const user = useAuthStore((s) => s.user);
  const patchUser = useAuthStore((s) => s.patchUser);
  const [state, setState] = useState<State>({ kind: 'idle' });
  const ran = useRef(false);

  useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true;
    setState({ kind: 'verifying' });
    authApi
      .verifyEmail(token)
      .then((r) => {
        patchUser({ ...r.user, emailVerified: true });
        setState({ kind: 'success' });
      })
      .catch((e: unknown) =>
        setState({ kind: 'error', message: e instanceof ApiError ? e.message : 'Failed' }),
      );
  }, [token, patchUser]);

  if (!token) {
    return (
      <Centered title="Verify your email">
        <p className="text-sm text-zinc-400">
          We sent a verification link to {user?.email ?? 'your inbox'}. Open the email to continue.
        </p>
        <ResendBlock email={user?.email ?? ''} />
      </Centered>
    );
  }

  if (state.kind === 'verifying') return <Centered title="Verifying…" />;
  if (state.kind === 'success')
    return (
      <Centered title="Email verified ✓">
        <Link to="/" className="text-accent">Go to your workspace →</Link>
      </Centered>
    );
  if (state.kind === 'error')
    return (
      <Centered title="Verification failed">
        <p className="text-sm text-red-400">{state.message}</p>
        <ResendBlock email={user?.email ?? ''} />
      </Centered>
    );

  return <Centered title="Verify your email" />;
}

function ResendBlock({ email }: { email: string }): JSX.Element {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await authApi.requestVerify(email);
      setSent(true);
    } finally {
      setBusy(false);
    }
  };
  if (!email) return <p className="text-xs text-zinc-500">Log in to resend the verification email.</p>;
  return (
    <button
      onClick={submit}
      disabled={busy || sent}
      className="text-sm text-accent disabled:opacity-60"
    >
      {sent ? 'Sent — check your inbox.' : busy ? '…' : 'Resend verification email'}
    </button>
  );
}

function Centered({ title, children }: { title: string; children?: React.ReactNode }): JSX.Element {
  return (
    <div className="flex h-full items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-3 rounded-lg border border-border bg-surface p-6 text-center">
        <h1 className="text-xl font-semibold">{title}</h1>
        {children}
      </div>
    </div>
  );
}
