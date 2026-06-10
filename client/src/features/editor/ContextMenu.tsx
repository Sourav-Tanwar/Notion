import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { allBlockSpecs } from './registry/blockRegistry';
import { useBlocksStore } from '@/stores/blocks.store';
import { useSelectionStore } from '@/stores/selection.store';
import type { BlockType, ID } from '@/types/domain';

export interface ContextMenuPos {
  x: number;
  y: number;
}

interface Props {
  blockId: ID;
  pos: ContextMenuPos;
  onClose: () => void;
}

export function ContextMenu({ blockId, pos, onClose }: Props): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const setType = useBlocksStore((s) => s.setType);
  const duplicate = useBlocksStore((s) => s.duplicate);
  const removeBlock = useBlocksStore((s) => s.removeBlock);
  const removeMany = useBlocksStore((s) => s.removeMany);
  const specs = allBlockSpecs().filter((s) => !s.hidden);
  const [layout, setLayout] = useState<{ top: number; left: number; maxHeight: number } | null>(
    null,
  );

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // Measure the real menu and keep it fully on-screen: flip up when the bottom
  // would overflow, and cap height with internal scrolling when neither side
  // can fit the whole list.
  useLayoutEffect(() => {
    const MARGIN = 8;
    const needed = ref.current?.scrollHeight ?? 0;
    const spaceBelow = window.innerHeight - pos.y - MARGIN;
    const spaceAbove = pos.y - MARGIN;
    const placeAbove = needed > spaceBelow && spaceAbove > spaceBelow;
    const avail = placeAbove ? spaceAbove : spaceBelow;
    const maxHeight = Math.max(160, Math.min(needed || avail, avail));
    const top = placeAbove ? Math.max(MARGIN, pos.y - maxHeight) : pos.y;
    const left = Math.max(MARGIN, Math.min(pos.x, window.innerWidth - 240 - MARGIN));
    setLayout({ top, left, maxHeight });
  }, [pos.x, pos.y, specs.length]);

  const style: React.CSSProperties = {
    position: 'fixed',
    top: layout?.top ?? -9999,
    left: layout?.left ?? -9999,
    maxHeight: layout?.maxHeight,
    visibility: layout ? 'visible' : 'hidden',
    zIndex: 60,
  };

  return (
    <div
      ref={ref}
      style={style}
      className="w-60 overflow-y-auto rounded-md border border-border bg-surface py-1 text-sm shadow-2xl"
    >
      <Item onClick={() => { duplicate(blockId); onClose(); }}>Duplicate</Item>
      <Item
        danger
        onClick={() => {
          // If this block is part of a multi-selection, delete the whole set.
          const selected = useSelectionStore.getState().selected;
          if (selected.size > 1 && selected.has(blockId)) {
            removeMany([...selected]);
            useSelectionStore.getState().clear();
          } else {
            removeBlock(blockId);
          }
          onClose();
        }}
      >
        {(() => {
          const selected = useSelectionStore.getState().selected;
          return selected.size > 1 && selected.has(blockId)
            ? `Delete ${selected.size} blocks`
            : 'Delete';
        })()}
      </Item>
      <Separator />
      <div className="px-3 py-1 text-xs uppercase tracking-wider text-zinc-500">Turn into</div>
      {specs.map((s) => (
        <Item
          key={s.type as string}
          onClick={() => {
            setType(blockId, s.type as BlockType);
            if (s.type === 'columns') {
              const st = useBlocksStore.getState();
              const existing = st.childrenOf[blockId]?.length ?? 0;
              for (let i = existing; i < 2; i += 1) st.insertChild(blockId, 'column');
            }
            onClose();
          }}
        >
          <span className="mr-2 inline-block w-6 text-center text-xs text-zinc-500">{s.icon ?? '·'}</span>
          {s.label}
        </Item>
      ))}
    </div>
  );
}

function Item({
  children,
  onClick,
  danger = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={
        'block w-full px-3 py-1.5 text-left hover:bg-zinc-800 ' +
        (danger ? 'text-red-400' : 'text-zinc-200')
      }
    >
      {children}
    </button>
  );
}

function Separator(): JSX.Element {
  return <div className="my-1 h-px bg-border" />;
}
