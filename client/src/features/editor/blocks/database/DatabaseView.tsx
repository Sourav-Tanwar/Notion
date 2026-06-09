import { useEffect } from 'react';
import { useBlocksStore } from '@/stores/blocks.store';
import { useDatabaseStore } from '@/stores/database.store';
import type { Block } from '@/types/domain';
import { TableView } from './TableView';
import { BoardView } from './BoardView';
import { GalleryView } from './GalleryView';
import { CalendarView } from './CalendarView';
import { ViewToolbar } from './ViewToolbar';
import { applyView, normalizeView, type ViewConfig } from './viewConfig';

/**
 * Owns an inline database's *view*: it loads the data, reads the per-block view
 * config from block props, applies filters/sorts, and renders either the table
 * or the board. Config edits are persisted back into the block's props so the
 * chosen view, grouping, filters and sorts survive reloads.
 */
export function DatabaseView({ block, databaseId }: { block: Block; databaseId: string }): JSX.Element {
  const entry = useDatabaseStore((s) => s.byId[databaseId]);
  const load = useDatabaseStore((s) => s.load);
  const rename = useDatabaseStore((s) => s.rename);
  const setProp = useBlocksStore((s) => s.setProp);

  const config = normalizeView(block.props.view);

  useEffect(() => {
    if (!entry) void load(databaseId);
  }, [databaseId, entry, load]);

  if (!entry || (entry.loading && entry.database.columns.length === 0)) {
    return <div className="px-1 py-2 text-sm text-neutral-400">Loading database…</div>;
  }

  const { database, rows } = entry;
  const onChange = (next: ViewConfig) => setProp(block.id, 'view', next);
  const display = applyView(rows, database.columns, config);
  const groupCol = database.columns.find((c) => c.id === config.groupColId) ?? null;
  const metaCol = database.columns.find((c) => c.id === config.galleryMetaColId) ?? null;
  const dateCol = database.columns.find((c) => c.id === config.calendarDateColId) ?? null;

  return (
    <div className="my-2 select-text" contentEditable={false}>
      <ViewToolbar
        title={database.title}
        columns={database.columns}
        config={config}
        onChange={onChange}
        onRename={(t) => rename(databaseId, t)}
      />
      {config.mode === 'board' && (
        <BoardView databaseId={databaseId} rows={display} groupCol={groupCol} />
      )}
      {config.mode === 'gallery' && (
        <GalleryView databaseId={databaseId} rows={display} metaCol={metaCol} />
      )}
      {config.mode === 'calendar' && (
        <CalendarView databaseId={databaseId} rows={display} dateCol={dateCol} />
      )}
      {config.mode === 'table' && <TableView databaseId={databaseId} rows={display} />}
    </div>
  );
}
