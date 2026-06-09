import { useEffect, useRef, useState } from 'react';
import type { Column, CellValue, SelectOption } from '@/services/database.api';
import { cn } from '@/lib/cn';
import { Popover } from './Popover';

/**
 * Per-type cell editors for the table view.
 *
 * Each editor keeps its own local "draft" while focused and only commits the
 * value upward (`onCommit`) on blur / Enter / change — so we don't fire a
 * network write on every keystroke. The committed value is owned by the store.
 */
interface CellProps {
  column: Column;
  value: CellValue;
  onCommit: (value: CellValue) => void;
  onAddOption?: (name: string) => Promise<SelectOption | undefined>;
}

function TextCell({ value, onCommit }: CellProps): JSX.Element {
  const [draft, setDraft] = useState((value as string) ?? '');
  useEffect(() => setDraft((value as string) ?? ''), [value]);
  return (
    <input
      className="w-full bg-transparent px-2 py-1 text-sm outline-none"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== (value ?? '') && onCommit(draft)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

function NumberCell({ value, onCommit }: CellProps): JSX.Element {
  const [draft, setDraft] = useState(value === null || value === undefined ? '' : String(value));
  useEffect(() => setDraft(value === null || value === undefined ? '' : String(value)), [value]);
  const commit = (): void => {
    const trimmed = draft.trim();
    const next = trimmed === '' ? null : Number(trimmed);
    if (next !== null && Number.isNaN(next)) return;
    if (next !== value) onCommit(next);
  };
  return (
    <input
      inputMode="decimal"
      className="w-full bg-transparent px-2 py-1 text-right text-sm tabular-nums outline-none"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

function CheckboxCell({ value, onCommit }: CellProps): JSX.Element {
  return (
    <div className="flex items-center justify-center px-2 py-1">
      <input
        type="checkbox"
        className="h-4 w-4 cursor-pointer accent-indigo-500"
        checked={Boolean(value)}
        onChange={(e) => onCommit(e.target.checked)}
      />
    </div>
  );
}

function DateCell({ value, onCommit }: CellProps): JSX.Element {
  return (
    <input
      type="date"
      className="w-full bg-transparent px-2 py-1 text-sm outline-none"
      value={(value as string) ?? ''}
      onChange={(e) => onCommit(e.target.value || null)}
    />
  );
}

/** Build a clickable href for url / email / phone values. */
function hrefFor(kind: 'url' | 'email' | 'phone', raw: string): string {
  const v = raw.trim();
  if (kind === 'email') return `mailto:${v}`;
  if (kind === 'phone') return `tel:${v.replace(/[^\d+]/g, '')}`;
  return /^[a-z][\w+.-]*:\/\//i.test(v) ? v : `https://${v}`;
}

/**
 * Text-like cell for url / email / phone. Shows a clickable link when not being
 * edited (with a small ↗ to open), and swaps to a plain input on click so the
 * value stays editable. Light validation only — these are display conveniences.
 */
function LinkCell({ column, value, onCommit }: CellProps): JSX.Element {
  const kind = column.type as 'url' | 'email' | 'phone';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState((value as string) ?? '');
  useEffect(() => setDraft((value as string) ?? ''), [value]);

  const str = (value as string) ?? '';

  if (!editing && str) {
    return (
      <div className="flex w-full items-center gap-1 px-2 py-1">
        <button
          type="button"
          className="min-w-0 flex-1 truncate text-left text-sm text-indigo-500 hover:underline"
          onClick={() => setEditing(true)}
          title="Click to edit"
        >
          {str}
        </button>
        <a
          href={hrefFor(kind, str)}
          target={kind === 'url' ? '_blank' : undefined}
          rel="noopener noreferrer"
          className="shrink-0 text-xs text-neutral-400 hover:text-indigo-500"
          title="Open"
          onClick={(e) => e.stopPropagation()}
        >
          ↗
        </a>
      </div>
    );
  }

  return (
    <input
      autoFocus={editing}
      type={kind === 'email' ? 'email' : kind === 'phone' ? 'tel' : 'url'}
      inputMode={kind === 'phone' ? 'tel' : kind === 'email' ? 'email' : 'url'}
      placeholder={kind === 'email' ? 'name@example.com' : kind === 'phone' ? '+1 555 0100' : 'https://…'}
      className="w-full bg-transparent px-2 py-1 text-sm outline-none placeholder:text-neutral-400"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setEditing(false);
        if (draft.trim() !== (value ?? '')) onCommit(draft.trim() || null);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        }
        if (e.key === 'Escape') {
          setDraft(str);
          setEditing(false);
        }
      }}
    />
  );
}

const OPTION_COLORS: Record<string, string> = {
  gray: 'bg-neutral-500/15 text-neutral-600 dark:text-neutral-300',
  blue: 'bg-blue-500/15 text-blue-600 dark:text-blue-300',
  green: 'bg-green-500/15 text-green-600 dark:text-green-300',
  yellow: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-300',
  orange: 'bg-orange-500/15 text-orange-600 dark:text-orange-300',
  red: 'bg-red-500/15 text-red-600 dark:text-red-300',
  purple: 'bg-purple-500/15 text-purple-600 dark:text-purple-300',
  pink: 'bg-pink-500/15 text-pink-600 dark:text-pink-300',
};

export function optionChipClass(color: string): string {
  return OPTION_COLORS[color] ?? OPTION_COLORS.gray;
}

function SelectCell({ column, value, onCommit, onAddOption }: CellProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const options = column.options ?? [];
  const selected = options.find((o) => o.id === value) ?? null;

  const filtered = options.filter((o) => o.name.toLowerCase().includes(query.trim().toLowerCase()));
  const canCreate = query.trim() && !options.some((o) => o.name.toLowerCase() === query.trim().toLowerCase());

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="flex min-h-[2rem] w-full items-center px-2 py-1 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        {selected ? (
          <span className={cn('rounded px-1.5 py-0.5 text-xs', optionChipClass(selected.color))}>
            {selected.name}
          </span>
        ) : (
          <span className="text-xs text-neutral-400">Empty</span>
        )}
      </button>
      {open && (
        <Popover anchor={btnRef.current} onClose={() => setOpen(false)} width={208}>
          <input
            autoFocus
            className="mb-1 w-full rounded bg-black/5 px-2 py-1.5 text-sm outline-none dark:bg-white/10"
            placeholder="Search or create…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="max-h-52 overflow-auto">
            {value && (
              <button
                type="button"
                className="block w-full rounded px-2 py-1 text-left text-xs text-neutral-400 hover:bg-black/5 dark:hover:bg-white/5"
                onClick={() => {
                  onCommit(null);
                  setOpen(false);
                }}
              >
                Clear
              </button>
            )}
            {filtered.map((o) => (
              <button
                key={o.id}
                type="button"
                className="block w-full rounded px-2 py-1 text-left hover:bg-black/5 dark:hover:bg-white/5"
                onClick={() => {
                  onCommit(o.id);
                  setOpen(false);
                }}
              >
                <span className={cn('rounded px-1.5 py-0.5 text-xs', optionChipClass(o.color))}>
                  {o.name}
                </span>
              </button>
            ))}
            {canCreate && onAddOption && (
              <button
                type="button"
                className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5"
                onClick={async () => {
                  const created = await onAddOption(query.trim());
                  if (created) onCommit(created.id);
                  setOpen(false);
                  setQuery('');
                }}
              >
                Create <span className="font-medium">“{query.trim()}”</span>
              </button>
            )}
          </div>
        </Popover>
      )}
    </>
  );
}

export function CellEditor(props: CellProps): JSX.Element {
  switch (props.column.type) {
    case 'number':
      return <NumberCell {...props} />;
    case 'checkbox':
      return <CheckboxCell {...props} />;
    case 'date':
      return <DateCell {...props} />;
    case 'select':
      return <SelectCell {...props} />;
    case 'url':
    case 'email':
    case 'phone':
      return <LinkCell {...props} />;
    default:
      return <TextCell {...props} />;
  }
}
