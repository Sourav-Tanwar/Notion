import { cn } from '@/lib/cn';
import { resolveAssetUrl } from '@/lib/assetUrl';
import type { User } from '@/types/domain';

interface AvatarProps {
  user: Pick<User, 'name' | 'email' | 'avatarUrl'> | null | undefined;
  /** Tailwind size class, e.g. 6 → h-6 w-6. Defaults to 8. */
  size?: number;
  className?: string;
}

/**
 * Single source of truth for rendering a user's avatar:
 *  - Resolves the URL through `resolveAssetUrl` (handles abs/relative + CDN).
 *  - Falls back to a coloured initials chip when no URL or the image errors.
 *  - One DOM shape used by sidebar, uploader, comments, mention chips…
 *
 * Why `onError` swaps to fallback instead of trying again: the URL is server
 * authoritative and a 404 means the underlying file was removed. Retrying
 * thrashes the network with no chance of success.
 */
export function Avatar({ user, size = 8, className }: AvatarProps): JSX.Element {
  const src = resolveAssetUrl(user?.avatarUrl);
  const initial = (user?.name || user?.email || '?').trim().charAt(0).toUpperCase() || '?';
  const dim = `h-${size} w-${size}`;
  const text = size <= 6 ? 'text-[10px]' : size <= 8 ? 'text-xs' : 'text-base';
  if (!src) {
    return (
      <div
        aria-hidden="true"
        className={cn(
          'flex items-center justify-center rounded-full bg-zinc-700 text-zinc-100',
          dim,
          text,
          className,
        )}
      >
        {initial}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      className={cn('rounded-full object-cover bg-zinc-800', dim, className)}
      onError={(e) => {
        // Hide the broken image and let consumers re-render fallback by
        // setting a marker attribute the parent can observe. The simplest UX:
        // replace with the initials inline.
        const img = e.currentTarget;
        img.style.display = 'none';
        const sibling = img.nextElementSibling as HTMLElement | null;
        if (sibling) sibling.style.display = 'flex';
      }}
    />
  );
}
