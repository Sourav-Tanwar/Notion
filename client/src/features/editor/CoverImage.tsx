import { useEffect, useRef, useState } from 'react';
import { selectPage, usePagesStore } from '@/stores/pages.store';
import { resolveAssetUrl } from '@/lib/assetUrl';
import { UNSPLASH_COVERS } from './unsplashCovers';
import type { ID } from '@/types/domain';

interface Props { pageId: ID }

/**
 * Cover banner shown at the top of a page.
 *  - No cover → small "Add cover" button (revealed on hover of the title area).
 *  - Cover set → 30vh image with hover controls (Change / Remove).
 *
 * The actual upload bytes flow: client picks file → POST /pages/:id/cover (multipart)
 * → server runs sharp's `processCover` (resize 1500x500, strip metadata, WebP)
 * → stores under uploads/covers/ → returns the updated page DTO.
 *
 * Alternatively the "gallery" tab sets coverUrl directly to a curated Unsplash
 * photo URL — no upload, just a PATCH of the page's coverUrl.
 */
export function CoverImage({ pageId }: Props): JSX.Element | null {
  const page = usePagesStore(selectPage(pageId));
  const setCover = usePagesStore((s) => s.setCover);
  const setCoverUrl = usePagesStore((s) => s.setCoverUrl);
  const removeCover = usePagesStore((s) => s.removeCover);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  if (!page) return null;

  const pickFile = (): void => inputRef.current?.click();

  const handleFile = async (file: File): Promise<void> => {
    setError(null);
    setUploading(true);
    try {
      await setCover(pageId, file);
      setPickerOpen(false);
    } catch (e) {
      setError((e as Error).message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handlePickGallery = async (url: string): Promise<void> => {
    setError(null);
    setPickerOpen(false);
    try {
      await setCoverUrl(pageId, url);
    } catch (e) {
      setError((e as Error).message || 'Failed');
    }
  };

  const handleRemove = async (): Promise<void> => {
    setError(null);
    try {
      await removeCover(pageId);
    } catch (e) {
      setError((e as Error).message || 'Failed');
    }
  };

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      accept="image/png,image/jpeg,image/webp"
      className="hidden"
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) void handleFile(f);
        e.currentTarget.value = '';
      }}
    />
  );

  const picker = pickerOpen ? (
    <CoverPicker
      anchor="right"
      onUpload={pickFile}
      onPick={(url) => void handlePickGallery(url)}
      onClose={() => setPickerOpen(false)}
    />
  ) : null;

  if (!page.coverUrl) {
    return (
      <div className="relative mb-1">
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-400 transition hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
        >
          + Add cover
        </button>
        {pickerOpen && (
          <CoverPicker
            anchor="left"
            onUpload={pickFile}
            onPick={(url) => void handlePickGallery(url)}
            onClose={() => setPickerOpen(false)}
          />
        )}
        {fileInput}
      </div>
    );
  }

  return (
    <div className="group/cover relative -mx-6 mb-4">
      <div className="h-[200px] overflow-hidden">
        <img
          src={resolveAssetUrl(page.coverUrl) ?? page.coverUrl}
          alt=""
          className="h-full w-full object-cover"
        />
      </div>
      <div className="absolute right-3 top-3 flex gap-2 opacity-0 transition group-hover/cover:opacity-100">
        <button
          type="button"
          disabled={uploading}
          onClick={() => setPickerOpen((v) => !v)}
          className="rounded bg-black/60 px-2 py-1 text-xs text-zinc-100 backdrop-blur hover:bg-black/80 disabled:opacity-50"
        >
          {uploading ? 'Uploading…' : 'Change cover'}
        </button>
        <button
          type="button"
          onClick={handleRemove}
          className="rounded bg-black/60 px-2 py-1 text-xs text-zinc-100 backdrop-blur hover:bg-black/80"
        >
          Remove
        </button>
      </div>
      {picker}
      {fileInput}
      {error && (
        <div className="absolute left-3 top-3 rounded bg-red-900/80 px-2 py-1 text-xs text-red-100">
          {error}
        </div>
      )}
    </div>
  );
}

/** Dropdown with an upload button and a grid of curated Unsplash covers. */
function CoverPicker({
  anchor,
  onUpload,
  onPick,
  onClose,
}: {
  anchor: 'left' | 'right';
  onUpload: () => void;
  onPick: (url: string) => void;
  onClose: () => void;
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className={
        'absolute top-full z-[80] mt-1 w-72 rounded-md border border-zinc-200 bg-white p-2 shadow-xl dark:border-zinc-700 dark:bg-zinc-900 ' +
        (anchor === 'left' ? 'left-0' : 'right-3')
      }
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
          Gallery
        </span>
        <button
          type="button"
          onClick={onUpload}
          className="rounded bg-zinc-100 px-2 py-1 text-[11px] text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
        >
          ⬆ Upload
        </button>
      </div>
      <div className="grid max-h-56 grid-cols-3 gap-1.5 overflow-auto">
        {UNSPLASH_COVERS.map((c) => (
          <button
            key={c.full}
            type="button"
            onClick={() => onPick(c.full)}
            className="aspect-[4/3] overflow-hidden rounded ring-1 ring-transparent hover:ring-2 hover:ring-indigo-400"
          >
            <img src={c.thumb} alt="" loading="lazy" className="h-full w-full object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
}
