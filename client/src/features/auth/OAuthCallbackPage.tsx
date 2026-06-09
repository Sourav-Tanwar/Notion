import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { tokens } from '@/services/http';
import { authApi } from '@/services/auth.api';
import { useAuthStore } from '@/stores/auth.store';

/**
 * The server redirects here with `?next=...#access=<jwt>`. We drop the
 * fragment immediately (so it never reaches history or analytics), stash the
 * access token in memory, fetch the user, and route the user onward.
 */
export function OAuthCallbackPage(): JSX.Element {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const next = params.get('next') ?? '/';
    const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
    const accessToken = new URLSearchParams(hash).get('access');
    // Scrub fragment from URL.
    history.replaceState(null, '', window.location.pathname + window.location.search);

    if (!accessToken) {
      navigate('/login?error=oauth', { replace: true });
      return;
    }
    tokens.set(accessToken);
    authApi
      .me()
      .then((user) => {
        setSession(accessToken, user);
        navigate(next, { replace: true });
      })
      .catch(() => navigate('/login?error=oauth', { replace: true }));
  }, [params, navigate, setSession]);

  return <div className="flex h-full items-center justify-center text-zinc-500">Signing you in…</div>;
}
