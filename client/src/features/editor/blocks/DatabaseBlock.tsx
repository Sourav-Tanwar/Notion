import { useEffect, useRef, useState } from 'react';
import { useBlocksStore } from '@/stores/blocks.store';
import { useDatabaseStore } from '@/stores/database.store';
import { databaseApi } from '@/services/database.api';
import type { RenderProps } from '../registry/blockRegistry';
import { DatabaseView } from './database/DatabaseView';

/**
 * Database block renderer.
 *
 * The block itself only stores `props.databaseId` as an anchor; all schema +
 * data live in the dedicated `/api/databases` entity. On first mount (no
 * databaseId yet) we lazily create the backing database and stamp its id onto
 * the block props. A ref guards against React StrictMode's double-invoke so we
 * never create two tables for one block.
 */
export function DatabaseRender({ block }: RenderProps): JSX.Element {
  const setProp = useBlocksStore((s) => s.setProp);
  const seed = useDatabaseStore((s) => s.seed);
  const databaseId = (block.props.databaseId as string) ?? '';
  const creatingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (databaseId || creatingRef.current) return;
    creatingRef.current = true;
    void (async () => {
      try {
        const { database, rows } = await databaseApi.create(block.pageId);
        seed(database, rows);
        setProp(block.id, 'databaseId', database.id);
      } catch (e) {
        setError((e as Error).message || 'Failed to create table');
        creatingRef.current = false;
      }
    })();
  }, [databaseId, block.id, block.pageId, seed, setProp]);

  if (error) {
    return (
      <div contentEditable={false} className="my-1 text-sm text-red-500">
        {error}
      </div>
    );
  }

  if (!databaseId) {
    return (
      <div contentEditable={false} className="my-1 text-sm text-neutral-400">
        Creating table…
      </div>
    );
  }

  return <DatabaseView block={block} databaseId={databaseId} />;
}
