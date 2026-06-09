import { useEffect, useRef, useState } from 'react';

/**
 * Cloudflare Turnstile widget wrapper.
 *
 * Why we ship our own component:
 *  - Lazy-load the upstream script exactly once, even across mode switches.
 *  - Re-render-safe: tearing down and remounting the widget when the parent
 *    component re-renders (e.g. form field changes) would invalidate the
 *    captured token. We pin the widget instance to the DOM ref.
 *  - Type-safe `onVerify`. The component reports `null` on expiry so callers
 *    can disable their submit button.
 *
 * The component renders nothing if no site key is supplied — convenient for
 * dev environments where Turnstile is intentionally disabled.
 */

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          callback: (token: string) => void;
          'expired-callback'?: () => void;
          'error-callback'?: () => void;
          theme?: 'light' | 'dark' | 'auto';
          size?: 'normal' | 'compact';
        },
      ) => string;
      remove: (widgetId: string) => void;
      reset: (widgetId?: string) => void;
    };
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Turnstile script failed')));
      return;
    }
    const s = document.createElement('script');
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Turnstile script failed'));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

interface TurnstileProps {
  siteKey: string | null | undefined;
  onVerify: (token: string | null) => void;
  theme?: 'light' | 'dark' | 'auto';
}

export function Turnstile({ siteKey, onVerify, theme = 'auto' }: TurnstileProps): JSX.Element | null {
  const ref = useRef<HTMLDivElement | null>(null);
  const widgetRef = useRef<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!siteKey || !ref.current) return;
    let mounted = true;
    let renderedEl: HTMLElement | null = null;
    loadScript()
      .then(() => {
        if (!mounted || !ref.current || !window.turnstile) return;
        renderedEl = ref.current;
        widgetRef.current = window.turnstile.render(ref.current, {
          sitekey: siteKey,
          theme,
          callback: (token) => onVerify(token),
          'expired-callback': () => onVerify(null),
          'error-callback': () => onVerify(null),
        });
      })
      .catch(() => mounted && setFailed(true));
    return () => {
      mounted = false;
      if (widgetRef.current && window.turnstile && renderedEl?.isConnected) {
        try {
          window.turnstile.remove(widgetRef.current);
        } catch {
          /* widget already gone */
        }
      }
      widgetRef.current = null;
    };
    // siteKey is the only meaningful change; onVerify is allowed to change identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey, theme]);

  if (!siteKey) return null;
  if (failed) {
    return <p className="text-xs text-red-500">CAPTCHA failed to load. Refresh the page.</p>;
  }
  return <div ref={ref} className="my-2" />;
}
