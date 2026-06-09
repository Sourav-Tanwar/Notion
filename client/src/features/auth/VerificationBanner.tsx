import { useEffect, useState } from 'react';
import { selectUser, useAuthStore } from '@/stores/auth.store';
import { ApiError } from '@/services/http';

const DISMISS_KEY = 'verify.banner.dismissed.until';
// Snooze for the session; we surface the same affordance from settings.
const SNOOZE_MS = 24 * 60 * 60_000;

function isSnoozed(): boolean {
  try {
    const v = window.localStorage.getItem(DISMISS_KEY);
    return !!v && Number(v) > Date.now();
  } catch {
    return false;
  }
}

function snooze(): void {
  try {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now() + SNOOZE_MS));
  } catch {
    /* ignore */
  }
}

/**
 * Persistent banner shown to authenticated users whose email is not yet
 * verified. Provides a one-click resend with a 60s cooldown (mirrored in the
 * store so all surfaces respect the same throttle).
 *
 * Rendered above the main shell so it is visible from every authed route
 * without each page having to opt in. Dismissed state is per-browser and
 * expires automatically so we don't lose users permanently.
 */
export function VerificationBanner(): JSX.Element | null {
  const user = useAuthStore(selectUser);
  const resend = useAuthStore((s) => s.resendVerification);
  const resendAt = useAuthStore((s) => s.verifyResendAt);
  const [dismissed, setDismissed] = useState<boolean>(() => isSnoozed());
  const [now, setNow] = useState<number>(() => Date.now());
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!resendAt || resendAt <= now) return;
    const id = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, [resendAt, now]);

  if (!user || user.emailVerified || dismissed) return null;

  const remaining = resendAt ? Math.max(0, Math.ceil((resendAt - now) / 1000)) : 0;
  const onCooldown = remaining > 0;

  async function onClick() {
    setStatus('sending');
    setError(null);
    try {
      await resend();
      setStatus('sent');
    } catch (e) {
      setStatus('error');
      setError(e instanceof ApiError ? e.message : (e as Error).message);
    }
  }

  function onDismiss() {
    snooze();
    setDismissed(true);
  }

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-200"
    >
      <span>
        Please verify your email <span className="font-medium">({user.email})</span> to secure your account.
        {status === 'sent' && <span className="ml-2 text-amber-100">Sent — check your inbox.</span>}
        {status === 'error' && <span className="ml-2 text-red-300">{error}</span>}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void onClick()}
          disabled={onCooldown || status === 'sending'}
          className="rounded border border-amber-500/40 px-2 py-1 text-xs hover:bg-amber-500/10 disabled:opacity-50"
        >
          {onCooldown ? `Resend in ${remaining}s` : status === 'sending' ? 'Sending…' : 'Resend email'}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="rounded px-2 py-1 text-xs text-amber-300/80 hover:text-amber-100"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
