import { forwardRef, useRef, useState } from 'react';
import type { Column, ColumnType } from '@/services/database.api';
import { cn } from '@/lib/cn';
import { Popover } from './Popover';
import {
  type ViewConfig,
  type FilterRule,
  type SortRule,
  type FilterOp,
  OP_LABEL,
  opsForType,
  opNeedsValue,
} from './viewConfig';

const TYPE_ICON: Record<ColumnType, string> = {
  text: 'A',
  number: '#',
  select: '◉',
  checkbox: '☑',
  date: '📅',
  url: '🔗',
  email: '✉',
  phone: '☎',
};

// Opaque theme background so the native <option> popup renders dark (a
// translucent bg-white/10 leaves the dropdown list system-white in Chrome).
const FIELD_CLS =
  'rounded border border-border bg-surface px-1.5 py-1 text-xs text-foreground outline-none';
const FIELD_CLS_FLEX = `min-w-0 flex-1 ${FIELD_CLS}`;
const OPTION_CLS = 'bg-surface text-foreground';

/**
 * Header toolbar for an inline database: title, table/board switch, and the
 * group / filter / sort controls. Stateless — all config edits flow up through
 * `onChange`, which the parent persists into the block's props.
 */
export function ViewToolbar({
  title,
  columns,
  config,
  onChange,
  onRename,
}: {
  title: string;
  columns: Column[];
  config: ViewConfig;
  onChange: (next: ViewConfig) => void;
  onRename: (title: string) => void;
}): JSX.Element {
  const [open, setOpen] = useState<'group' | 'filter' | 'sort' | null>(null);
  const groupRef = useRef<HTMLButtonElement>(null);
  const filterRef = useRef<HTMLButtonElement>(null);
  const sortRef = useRef<HTMLButtonElement>(null);

  const selectCols = columns.filter((c) => c.type === 'select');
  const dateCols = columns.filter((c) => c.type === 'date');
  const groupCol = columns.find((c) => c.id === config.groupColId) ?? null;
  const calendarCol = columns.find((c) => c.id === config.calendarDateColId) ?? null;
  const metaCol = columns.find((c) => c.id === config.galleryMetaColId) ?? null;

  return (
    <div className="mb-1.5">
      <input
        className="w-full bg-transparent text-lg font-semibold outline-none placeholder:text-neutral-400"
        value={title}
        placeholder="Untitled database"
        onChange={(e) => onRename(e.target.value)}
      />

      <div className="mt-1 flex flex-wrap items-center gap-1 text-sm">
        <div className="flex items-center rounded-md bg-black/[0.04] p-0.5 dark:bg-white/[0.06]">
          <SwitchBtn active={config.mode === 'table'} onClick={() => onChange({ ...config, mode: 'table' })}>
            ☰ Table
          </SwitchBtn>
          <SwitchBtn active={config.mode === 'board'} onClick={() => onChange({ ...config, mode: 'board' })}>
            ▦ Board
          </SwitchBtn>
          <SwitchBtn active={config.mode === 'gallery'} onClick={() => onChange({ ...config, mode: 'gallery' })}>
            ▣ Gallery
          </SwitchBtn>
          <SwitchBtn active={config.mode === 'calendar'} onClick={() => onChange({ ...config, mode: 'calendar' })}>
            📅 Calendar
          </SwitchBtn>
        </div>

        <span className="mx-0.5 h-4 w-px bg-black/10 dark:bg-white/10" />

        {config.mode === 'board' && (
          <ToolBtn
            ref={groupRef}
            active={open === 'group' || !!groupCol}
            onClick={() => setOpen((o) => (o === 'group' ? null : 'group'))}
          >
            Group{groupCol ? `: ${groupCol.name}` : ''}
          </ToolBtn>
        )}

        {config.mode === 'gallery' && (
          <ToolBtn
            ref={groupRef}
            active={open === 'group' || !!metaCol}
            onClick={() => setOpen((o) => (o === 'group' ? null : 'group'))}
          >
            Subtitle{metaCol ? `: ${metaCol.name}` : ''}
          </ToolBtn>
        )}

        {config.mode === 'calendar' && (
          <ToolBtn
            ref={groupRef}
            active={open === 'group' || !!calendarCol}
            onClick={() => setOpen((o) => (o === 'group' ? null : 'group'))}
          >
            Date{calendarCol ? `: ${calendarCol.name}` : ''}
          </ToolBtn>
        )}

        <ToolBtn
          ref={filterRef}
          active={open === 'filter' || config.filters.length > 0}
          onClick={() => setOpen((o) => (o === 'filter' ? null : 'filter'))}
        >
          Filter{config.filters.length ? ` (${config.filters.length})` : ''}
        </ToolBtn>

        <ToolBtn
          ref={sortRef}
          active={open === 'sort' || config.sorts.length > 0}
          onClick={() => setOpen((o) => (o === 'sort' ? null : 'sort'))}
        >
          Sort{config.sorts.length ? ` (${config.sorts.length})` : ''}
        </ToolBtn>
      </div>

      {open === 'group' && config.mode === 'board' && (
        <Popover anchor={groupRef.current} onClose={() => setOpen(null)} width={220}>
          <div className="px-2 pb-1 pt-0.5 text-[11px] font-medium uppercase tracking-wide text-neutral-400">
            Group by
          </div>
          {selectCols.length === 0 && (
            <div className="px-2 py-1.5 text-xs text-neutral-400">Add a Select property first.</div>
          )}
          {selectCols.map((c) => (
            <button
              key={c.id}
              type="button"
              className={cn(
                'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5',
                c.id === config.groupColId && 'text-indigo-500',
              )}
              onClick={() => onChange({ ...config, groupColId: c.id })}
            >
              <span className="w-4 text-center text-xs text-neutral-400">◉</span>
              {c.name || 'Untitled'}
              {c.id === config.groupColId && <span className="ml-auto text-xs">✓</span>}
            </button>
          ))}
        </Popover>
      )}

      {open === 'group' && config.mode === 'gallery' && (
        <Popover anchor={groupRef.current} onClose={() => setOpen(null)} width={220}>
          <div className="px-2 pb-1 pt-0.5 text-[11px] font-medium uppercase tracking-wide text-neutral-400">
            Card subtitle
          </div>
          <button
            type="button"
            className={cn(
              'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5',
              !config.galleryMetaColId && 'text-indigo-500',
            )}
            onClick={() => onChange({ ...config, galleryMetaColId: null })}
          >
            <span className="w-4 text-center text-xs text-neutral-400">∅</span>
            None
            {!config.galleryMetaColId && <span className="ml-auto text-xs">✓</span>}
          </button>
          {columns.map((c) => (
            <button
              key={c.id}
              type="button"
              className={cn(
                'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5',
                c.id === config.galleryMetaColId && 'text-indigo-500',
              )}
              onClick={() => onChange({ ...config, galleryMetaColId: c.id })}
            >
              <span className="w-4 text-center text-xs text-neutral-400">{TYPE_ICON[c.type]}</span>
              {c.name || 'Untitled'}
              {c.id === config.galleryMetaColId && <span className="ml-auto text-xs">✓</span>}
            </button>
          ))}
        </Popover>
      )}

      {open === 'group' && config.mode === 'calendar' && (
        <Popover anchor={groupRef.current} onClose={() => setOpen(null)} width={220}>
          <div className="px-2 pb-1 pt-0.5 text-[11px] font-medium uppercase tracking-wide text-neutral-400">
            Calendar date
          </div>
          {dateCols.length === 0 && (
            <div className="px-2 py-1.5 text-xs text-neutral-400">Add a Date property first.</div>
          )}
          {dateCols.map((c) => (
            <button
              key={c.id}
              type="button"
              className={cn(
                'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5',
                c.id === config.calendarDateColId && 'text-indigo-500',
              )}
              onClick={() => onChange({ ...config, calendarDateColId: c.id })}
            >
              <span className="w-4 text-center text-xs text-neutral-400">📅</span>
              {c.name || 'Untitled'}
              {c.id === config.calendarDateColId && <span className="ml-auto text-xs">✓</span>}
            </button>
          ))}
        </Popover>
      )}

      {open === 'filter' && (
        <Popover anchor={filterRef.current} onClose={() => setOpen(null)} width={320}>
          <FilterEditor columns={columns} config={config} onChange={onChange} />
        </Popover>
      )}

      {open === 'sort' && (
        <Popover anchor={sortRef.current} onClose={() => setOpen(null)} width={300}>
          <SortEditor columns={columns} config={config} onChange={onChange} />
        </Popover>
      )}
    </div>
  );
}

function SwitchBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded px-2 py-1 text-xs font-medium transition',
        active
          ? 'bg-surface text-neutral-800 shadow-sm dark:text-neutral-100'
          : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300',
      )}
    >
      {children}
    </button>
  );
}

const ToolBtn = forwardRef<
  HTMLButtonElement,
  { active: boolean; onClick: () => void; children: React.ReactNode }
>(({ active, onClick, children }, ref) => (
  <button
    ref={ref}
    type="button"
    onClick={onClick}
    className={cn(
      'rounded-md px-2 py-1 text-xs font-medium transition',
      active
        ? 'bg-indigo-500/10 text-indigo-500'
        : 'text-neutral-500 hover:bg-black/5 hover:text-neutral-700 dark:hover:bg-white/5 dark:hover:text-neutral-300',
    )}
  >
    {children}
  </button>
));
ToolBtn.displayName = 'ToolBtn';

/** Build + edit the list of filter rules. */
function FilterEditor({
  columns,
  config,
  onChange,
}: {
  columns: Column[];
  config: ViewConfig;
  onChange: (next: ViewConfig) => void;
}): JSX.Element {
  const setFilters = (filters: FilterRule[]) => onChange({ ...config, filters });

  const addFilter = () => {
    const col = columns[0];
    if (!col) return;
    const op = opsForType(col.type)[0];
    setFilters([...config.filters, { colId: col.id, op, value: '' }]);
  };

  const patch = (i: number, p: Partial<FilterRule>) =>
    setFilters(config.filters.map((f, idx) => (idx === i ? { ...f, ...p } : f)));

  const remove = (i: number) => setFilters(config.filters.filter((_, idx) => idx !== i));

  return (
    <div className="flex flex-col gap-2">
      <div className="px-1 text-[11px] font-medium uppercase tracking-wide text-neutral-400">Filters</div>
      {config.filters.length === 0 && (
        <div className="px-1 text-xs text-neutral-400">No filters yet.</div>
      )}
      {config.filters.map((f, i) => {
        const col = columns.find((c) => c.id === f.colId) ?? columns[0];
        const ops = opsForType(col.type);
        const selectOpts = col.type === 'select' ? col.options ?? [] : [];
        return (
          <div key={i} className="flex flex-wrap items-center gap-1">
            <select
              className={FIELD_CLS_FLEX}
              value={f.colId}
              onChange={(e) => {
                const nc = columns.find((c) => c.id === e.target.value)!;
                patch(i, { colId: nc.id, op: opsForType(nc.type)[0], value: '' });
              }}
            >
              {columns.map((c) => (
                <option key={c.id} value={c.id} className={OPTION_CLS}>
                  {TYPE_ICON[c.type]} {c.name || 'Untitled'}
                </option>
              ))}
            </select>
            <select
              className={FIELD_CLS}
              value={f.op}
              onChange={(e) => patch(i, { op: e.target.value as FilterOp, value: '' })}
            >
              {ops.map((op) => (
                <option key={op} value={op} className={OPTION_CLS}>
                  {OP_LABEL[op]}
                </option>
              ))}
            </select>
            {opNeedsValue(f.op) &&
              (col.type === 'select' ? (
                <select
                  className={FIELD_CLS_FLEX}
                  value={String(f.value ?? '')}
                  onChange={(e) => patch(i, { value: e.target.value })}
                >
                  <option value="" className={OPTION_CLS}>Select…</option>
                  {selectOpts.map((o) => (
                    <option key={o.id} value={o.id} className={OPTION_CLS}>
                      {o.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className={FIELD_CLS_FLEX}
                  value={String(f.value ?? '')}
                  placeholder="Value"
                  onChange={(e) => patch(i, { value: e.target.value })}
                />
              ))}
            <button
              type="button"
              className="rounded px-1.5 py-1 text-xs text-neutral-400 hover:text-red-500"
              onClick={() => remove(i)}
              title="Remove filter"
            >
              ×
            </button>
          </div>
        );
      })}
      <button
        type="button"
        className="self-start rounded px-1.5 py-1 text-xs text-indigo-500 hover:bg-indigo-500/10"
        onClick={addFilter}
      >
        + Add filter
      </button>
    </div>
  );
}

/** Build + edit the list of sort rules. */
function SortEditor({
  columns,
  config,
  onChange,
}: {
  columns: Column[];
  config: ViewConfig;
  onChange: (next: ViewConfig) => void;
}): JSX.Element {
  const setSorts = (sorts: SortRule[]) => onChange({ ...config, sorts });

  const addSort = () => {
    const used = new Set(config.sorts.map((s) => s.colId));
    const col = columns.find((c) => !used.has(c.id)) ?? columns[0];
    if (!col) return;
    setSorts([...config.sorts, { colId: col.id, dir: 'asc' }]);
  };

  const patch = (i: number, p: Partial<SortRule>) =>
    setSorts(config.sorts.map((s, idx) => (idx === i ? { ...s, ...p } : s)));

  const remove = (i: number) => setSorts(config.sorts.filter((_, idx) => idx !== i));

  return (
    <div className="flex flex-col gap-2">
      <div className="px-1 text-[11px] font-medium uppercase tracking-wide text-neutral-400">Sort</div>
      {config.sorts.length === 0 && <div className="px-1 text-xs text-neutral-400">No sorts yet.</div>}
      {config.sorts.map((s, i) => (
        <div key={i} className="flex items-center gap-1">
          <select
            className={FIELD_CLS_FLEX}
            value={s.colId}
            onChange={(e) => patch(i, { colId: e.target.value })}
          >
            {columns.map((c) => (
              <option key={c.id} value={c.id} className={OPTION_CLS}>
                {TYPE_ICON[c.type]} {c.name || 'Untitled'}
              </option>
            ))}
          </select>
          <select
            className={FIELD_CLS}
            value={s.dir}
            onChange={(e) => patch(i, { dir: e.target.value as SortRule['dir'] })}
          >
            <option value="asc" className={OPTION_CLS}>Asc</option>
            <option value="desc" className={OPTION_CLS}>Desc</option>
          </select>
          <button
            type="button"
            className="rounded px-1.5 py-1 text-xs text-neutral-400 hover:text-red-500"
            onClick={() => remove(i)}
            title="Remove sort"
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        className="self-start rounded px-1.5 py-1 text-xs text-indigo-500 hover:bg-indigo-500/10"
        onClick={addSort}
      >
        + Add sort
      </button>
    </div>
  );
}
