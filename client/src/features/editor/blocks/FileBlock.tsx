import { useRef, useState } from 'react';
import { blocksApi } from '@/services/blocks.api';
import { useBlocksStore } from '@/stores/blocks.store';
import { resolveAssetUrl } from '@/lib/assetUrl';
import type { RenderProps } from '../registry/blockRegistry';

/**
 * File / attachment block. Uploads any file and renders a download card with
 * the original name, size and a type-based icon. Metadata lives in props:
 * { url, name, size, mime }.
 */

function formatSize(bytes: number): string {
  if (!bytes) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

function iconFor(mime: string, name: string): string {
  if (mime.startsWith('image/')) return '🖼';
  if (mime.startsWith('video/')) return '🎬';
  if (mime.startsWith('audio/')) return '🎵';
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return '📕';
  if (/zip|rar|7z|tar|gz/.test(mime) || /\.(zip|rar|7z|tar|gz)$/i.test(name)) return '🗜';
  if (/sheet|excel|csv/.test(mime) || /\.(xlsx?|csv)$/i.test(name)) return '📊';
  if (/word|document/.test(mime) || /\.docx?$/i.test(name)) return '📝';
  return '📎';
}

export function FileRender({ block }: RenderProps): JSX.Element {
  const setProp = useBlocksStore((s) => s.setProp);
  const url = (block.props.url as string) ?? '';
  const name = (block.props.name as string) ?? 'file';
  const size = (block.props.size as number) ?? 0;
  const mime = (block.props.mime as string) ?? '';
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File): Promise<void> => {
    setError(null);
    setUploading(true);
    try {
      const meta = await blocksApi.uploadFile(file);
      setProp(block.id, 'url', meta.url);
      setProp(block.id, 'name', meta.name);
      setProp(block.id, 'size', meta.size);
      setProp(block.id, 'mime', meta.mime);
    } catch (e) {
      setError((e as Error).message || 'Upload failed');
    } finally {
      setUploading(false);
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
        className="my-1 flex items-center justify-center gap-2 rounded-md border border-dashed border-border bg-surface/40 px-4 py-4 text-sm text-zinc-400"
        contentEditable={false}
      >
        <span>{uploading ? 'Uploading…' : '📎 Drop a file, or'}</span>
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

  const href = resolveAssetUrl(url) ?? url;

  return (
    <div className="my-1" contentEditable={false}>
      <a
        href={href}
        download={name}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex items-center gap-3 rounded-md border border-border bg-surface px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800/60"
      >
        <span className="text-2xl leading-none">{iconFor(mime, name)}</span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">{name}</span>
          <span className="text-xs text-zinc-400">{formatSize(size)}</span>
        </span>
        <span className="ml-auto text-xs text-zinc-400 opacity-0 transition group-hover:opacity-100">
          Download ↓
        </span>
      </a>
    </div>
  );
}
