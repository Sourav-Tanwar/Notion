import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { blocksApi } from '@/services/blocks.api';
import { useBlocksStore } from '@/stores/blocks.store';
import { resolveAssetUrl } from '@/lib/assetUrl';
import { requestFocus } from '@/hooks/useFocusBlock';
import type { RenderProps } from '../registry/blockRegistry';

/**
 * Image block renderer.
 *
 * State machine encoded in props:
 *  - props.url absent → empty drop zone with an Upload button.
 *  - props.url set    → renders the image with caption + resize handle.
 *
 * Resize: dragging the right-edge handle updates `props.width` (CSS px).
 * Caption Enter: inserts a fresh text block after the image and focuses it.
 */
const MIN_WIDTH = 80;

export function ImageRender({ block }: RenderProps): JSX.Element {
  const setProp = useBlocksStore((s) => s.setProp);
  const insertAfter = useBlocksStore((s) => s.insertAfter);
  const url = (block.props.url as string) ?? '';
  const caption = (block.props.caption as string) ?? '';
  const width = block.props.width as number | undefined;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragWidth, setDragWidth] = useState<number | null>(null);

  const handleFile = async (file: File): Promise<void> => {
    setError(null);
    setUploading(true);
    try {
      const { url: newUrl, width: w, height } = await blocksApi.uploadImage(file);
      setProp(block.id, 'url', newUrl);
      setProp(block.id, 'width', w);
      setProp(block.id, 'height', height);
    } catch (e) {
      setError((e as Error).message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const onResizePointerDown = (e: PointerEvent<HTMLDivElement>): void => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = imgRef.current?.getBoundingClientRect().width ?? 0;
    const maxW = wrapRef.current?.getBoundingClientRect().width ?? Number.POSITIVE_INFINITY;

    const onMove = (ev: globalThis.PointerEvent): void => {
      const next = Math.max(MIN_WIDTH, Math.min(maxW, startW + (ev.clientX - startX)));
      setDragWidth(next);
    };
    const onUp = (ev: globalThis.PointerEvent): void => {
      const next = Math.max(MIN_WIDTH, Math.min(maxW, startW + (ev.clientX - startX)));
      setProp(block.id, 'width', Math.round(next));
      setDragWidth(null);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const onCaptionKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      const newId = insertAfter(block.id, 'text');
      queueMicrotask(() => requestFocus({ id: newId, placeCaret: 'start' }));
    }
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
        className="my-1 flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-surface/40 px-4 py-8 text-zinc-400"
      >
        <span>{uploading ? 'Uploading…' : 'Drop an image, or'}</span>
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="rounded bg-zinc-800 px-3 py-1 text-sm text-zinc-100 hover:bg-zinc-700 disabled:opacity-50"
        >
          Choose file
        </button>
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
        {error && <div className="text-xs text-red-400">{error}</div>}
      </div>
    );
  }

  const renderedWidth = dragWidth ?? width;

  return (
    <div ref={wrapRef} className="my-1">
      <div className="group/image relative inline-block max-w-full">
        <img
          ref={imgRef}
          src={resolveAssetUrl(url) ?? url}
          alt={caption || 'image'}
          style={renderedWidth ? { width: `${renderedWidth}px` } : undefined}
          draggable={false}
          className="block max-h-[600px] max-w-full rounded-md bg-zinc-100 dark:bg-zinc-900"
        />
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize image"
          onPointerDown={onResizePointerDown}
          className="absolute right-1 top-1/2 -translate-y-1/2 h-12 w-1.5 cursor-ew-resize rounded-full bg-zinc-400/70 opacity-0 transition group-hover/image:opacity-100 hover:bg-zinc-500 dark:bg-zinc-500/70 dark:hover:bg-zinc-300"
        />
      </div>
      <input
        value={caption}
        onChange={(e) => setProp(block.id, 'caption', e.target.value)}
        onKeyDown={onCaptionKeyDown}
        placeholder="Add a caption"
        className="mt-1 w-full bg-transparent text-sm text-zinc-500 placeholder:text-zinc-400 focus:outline-none dark:text-zinc-400 dark:placeholder:text-zinc-500"
      />
    </div>
  );
}
