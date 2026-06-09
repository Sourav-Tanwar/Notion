import { useRef, useState } from 'react';
import { blocksApi } from '@/services/blocks.api';
import { useBlocksStore } from '@/stores/blocks.store';
import { resolveAssetUrl } from '@/lib/assetUrl';
import type { RenderProps } from '../registry/blockRegistry';

/**
 * Video block.
 *
 * Two sources, both stored in props.url:
 *  - an uploaded file (served by our storage) → rendered with <video controls>
 *  - a YouTube / Vimeo link → rendered as a responsive iframe embed
 *
 * Empty state offers an upload button and a URL field.
 */

/** Convert a YouTube/Vimeo watch URL into an embeddable iframe src, else null. */
function toEmbedSrc(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') {
      const id = u.pathname.slice(1);
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      const id = u.searchParams.get('v');
      if (id) return `https://www.youtube.com/embed/${id}`;
      if (u.pathname.startsWith('/embed/')) return url;
      return null;
    }
    if (host === 'vimeo.com') {
      const id = u.pathname.split('/').filter(Boolean)[0];
      return id && /^\d+$/.test(id) ? `https://player.vimeo.com/video/${id}` : null;
    }
    if (host === 'player.vimeo.com') return url;
    return null;
  } catch {
    return null;
  }
}

export function VideoRender({ block }: RenderProps): JSX.Element {
  const setProp = useBlocksStore((s) => s.setProp);
  const url = (block.props.url as string) ?? '';
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [linkValue, setLinkValue] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File): Promise<void> => {
    setError(null);
    setUploading(true);
    try {
      const { url: newUrl } = await blocksApi.uploadFile(file);
      setProp(block.id, 'url', newUrl);
      setProp(block.id, 'embed', false);
    } catch (e) {
      setError((e as Error).message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const submitLink = (): void => {
    const v = linkValue.trim();
    if (!v) return;
    const embed = toEmbedSrc(v);
    setProp(block.id, 'url', embed ?? v);
    setProp(block.id, 'embed', embed !== null);
    setLinkValue('');
  };

  if (!url) {
    return (
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) void handleFile(f);
        }}
        className="my-1 flex flex-col items-center gap-2 rounded-md border border-dashed border-border bg-surface/40 px-4 py-6 text-zinc-400"
        contentEditable={false}
      >
        <span className="text-sm">{uploading ? 'Uploading…' : '🎬 Add a video'}</span>
        <div className="flex w-full max-w-md flex-col gap-2 sm:flex-row">
          <input
            value={linkValue}
            onChange={(e) => setLinkValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submitLink();
              }
            }}
            placeholder="Paste a YouTube / Vimeo / video link"
            className="min-w-0 flex-1 rounded border border-border bg-surface px-2 py-1 text-sm text-foreground outline-none"
          />
          <button
            type="button"
            onClick={submitLink}
            className="rounded bg-zinc-800 px-3 py-1 text-sm text-zinc-100 hover:bg-zinc-700"
          >
            Embed
          </button>
        </div>
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="text-xs text-zinc-500 underline hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          or upload a file
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
            e.currentTarget.value = '';
          }}
        />
        {error && <div className="text-xs text-red-400">{error}</div>}
      </div>
    );
  }

  const isEmbed = Boolean(block.props.embed);

  return (
    <div className="my-1" contentEditable={false}>
      {isEmbed ? (
        <div className="relative w-full overflow-hidden rounded-md" style={{ paddingTop: '56.25%' }}>
          <iframe
            src={url}
            title="Embedded video"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 h-full w-full border-0"
          />
        </div>
      ) : (
        <video
          src={resolveAssetUrl(url) ?? url}
          controls
          className="max-h-[600px] w-full rounded-md bg-black"
        />
      )}
      <button
        type="button"
        onClick={() => {
          setProp(block.id, 'url', '');
          setProp(block.id, 'embed', false);
        }}
        className="mt-1 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
      >
        Replace
      </button>
    </div>
  );
}
