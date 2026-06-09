import { useCallback, useRef, useState } from 'react';
import { useUploader } from '@/hooks/useUploader';
import { tokens } from '@/services/http';
import { useAuthStore } from '@/stores/auth.store';
import type { User } from '@/types/domain';
import { cn } from '@/lib/cn';
import { Avatar } from '@/components/Avatar';

/**
 * Avatar uploader with:
 *  - drag-and-drop
 *  - client-side type/size validation
 *  - client-side resize via OffscreenCanvas (≤ 512×512) to cut bandwidth
 *  - upload-progress UI
 *  - "Remove" affordance
 *
 * Cropping is deferred to a Phase 5 add-on — the resize step already gives us
 * a square thumbnail, which covers 90% of the "looks fine" use cases.
 */

const ACCEPT = ['image/png', 'image/jpeg', 'image/webp'] as const;
const MAX_BYTES = 2 * 1024 * 1024;

export function AvatarUploader(): JSX.Element {
  const user = useAuthStore((s) => s.user);
  const clearAvatar = useAuthStore((s) => s.clearAvatar);
  const setUser = useAuthStore((s) => s.patchUser);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const uploader = useUploader<User>({
    url: '/api/profile/avatar',
    fieldName: 'avatar',
    maxBytes: MAX_BYTES,
    accept: ACCEPT,
    getAuthHeader: () => (tokens.get() ? `Bearer ${tokens.get()}` : null),
  });

  const onFile = useCallback(
    async (file: File) => {
      setLocalError(null);
      try {
        const resized = await resizeImage(file, 512);
        const user = await uploader.upload(resized);
        setUser(user);
      } catch (e) {
        setLocalError((e as Error).message);
      }
    },
    [uploader, setUser],
  );

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const f = e.dataTransfer.files?.[0];
        if (f) void onFile(f);
      }}
      className={cn(
        'flex items-center gap-4 rounded-lg border-2 border-dashed p-4 transition',
        dragging ? 'border-accent bg-accent/5' : 'border-border',
      )}
    >
      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full bg-zinc-800">
        <Avatar user={user ?? null} size={20} className="h-full w-full" />
        {uploader.status === 'uploading' && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-zinc-700">
            <div className="h-full bg-accent transition-all" style={{ width: `${uploader.progress}%` }} />
          </div>
        )}
      </div>
      <div className="flex-1 space-y-1">
        <div className="text-sm">Profile photo</div>
        <div className="text-xs text-zinc-500">PNG, JPG, or WebP. Up to 2 MB. Dragged or clicked.</div>
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="rounded border border-border bg-canvas px-3 py-1 text-xs hover:bg-zinc-800"
          >
            Change
          </button>
          {user?.avatarUrl && (
            <button
              type="button"
              onClick={() => void clearAvatar()}
              className="rounded border border-border bg-canvas px-3 py-1 text-xs text-zinc-400 hover:bg-zinc-800"
            >
              Remove
            </button>
          )}
        </div>
        {(localError || uploader.error) && (
          <div className="text-xs text-red-400">{localError ?? uploader.error}</div>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT.join(',')}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onFile(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}

/**
 * Resize to a square thumbnail via Canvas. JPEG output (smaller than PNG) at
 * 90% quality. Falls back to the original file if anything goes wrong.
 */
async function resizeImage(file: File, max: number): Promise<File> {
  try {
    const bmp = await createImageBitmap(file);
    const size = Math.min(bmp.width, bmp.height);
    const sx = (bmp.width - size) / 2;
    const sy = (bmp.height - size) / 2;
    const out = Math.min(size, max);
    const canvas = document.createElement('canvas');
    canvas.width = out;
    canvas.height = out;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bmp, sx, sy, size, size, 0, 0, out, out);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.9));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
  } catch {
    return file;
  }
}
