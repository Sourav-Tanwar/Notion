import { authApi } from '@/services/auth.api';

/** Reusable OAuth provider buttons. Adding a provider = one extra entry here. */
const PROVIDERS: { id: 'google'; label: string; icon: string }[] = [
  { id: 'google', label: 'Continue with Google', icon: 'G' },
];

interface Props {
  redirect?: string;
}

export function OAuthButtons({ redirect = '/' }: Props): JSX.Element {
  return (
    <div className="space-y-2">
      {PROVIDERS.map((p) => (
        <a
          key={p.id}
          href={authApi.oauthStartUrl(p.id, redirect)}
          className="flex w-full items-center justify-center gap-2 rounded border border-border bg-canvas px-3 py-2 text-sm hover:bg-zinc-800"
        >
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-xs font-bold text-black">
            {p.icon}
          </span>
          {p.label}
        </a>
      ))}
    </div>
  );
}
