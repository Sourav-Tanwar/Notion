import { memo, useCallback, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useShallow } from 'zustand/react/shallow';
import {
  selectBlock,
  selectChildBlockIds,
  useBlocksStore,
} from '@/stores/blocks.store';
import { selectIsSelected, useSelectionStore } from '@/stores/selection.store';
import { requestFocus, useFocusOn } from '@/hooks/useFocusBlock';
import { getBlockSpec } from './registry/blockRegistry';
import type { BlockType, ID, Page } from '@/types/domain';
import { SlashMenu } from './SlashMenu';
import { MentionMenu } from './MentionMenu';
import { getMentionContext, insertMention } from './collab/mentions';
import { BlockList } from './BlockList';
import { ContextMenu, type ContextMenuPos } from './ContextMenu';
import { cn } from '@/lib/cn';
import { tryMarkdown } from './markdown';
import { deleteLeadingChars } from './collab/marks';
import { CommentBubble } from './comments/CommentBubble';

interface Props {
  id: ID;
  index: number;
}

function BlockNodeImpl({ id, index }: Props): JSX.Element | null {
  const block = useBlocksStore(selectBlock(id));
  const childIds = useBlocksStore(useShallow(selectChildBlockIds(id)));
  const isSelected = useSelectionStore(selectIsSelected(id));

  const setText = useBlocksStore((s) => s.setText);
  const setType = useBlocksStore((s) => s.setType);
  const insertAfter = useBlocksStore((s) => s.insertAfter);
  const removeBlock = useBlocksStore((s) => s.removeBlock);
  const indent = useBlocksStore((s) => s.indent);
  const outdent = useBlocksStore((s) => s.outdent);

  const editableRef = useRef<HTMLElement | null>(null);
  useFocusOn(id, editableRef as React.RefObject<HTMLElement>);

  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [ctxMenu, setCtxMenu] = useState<ContextMenuPos | null>(null);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    data: { parentId: block?.parentId ?? null, pageId: block?.pageId },
  });
  const style = useMemo(
    () => ({ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }),
    [transform, transition, isDragging],
  );

  const spec = block ? getBlockSpec(block.type) : undefined;

  const registerEditable = useCallback((el: HTMLElement | null) => {
    editableRef.current = el;
  }, []);

  const openSlashIfTriggered = useCallback((plain: string) => {
    if (plain === '/') {
      setSlashOpen(true);
      setSlashQuery('');
    } else if (plain.startsWith('/')) {
      setSlashQuery(plain.slice(1));
    } else {
      setSlashOpen(false);
    }
  }, []);

  const tryMarkdownTransform = useCallback(
    (pendingSpace: boolean): boolean => {
      if (!block) return false;
      const el = editableRef.current;
      if (!el) return false;
      const docPlain = el.innerText;
      // On the space key the space isn't in the doc yet, so append it to the
      // candidate we test against (e.g. typing "#" then Space yields "# ").
      const candidate = pendingSpace ? `${docPlain} ` : docPlain;
      const hit = tryMarkdown(candidate);
      if (!hit) return false;
      setType(id, hit.newType);
      for (const [k, v] of Object.entries(hit.props)) {
        useBlocksStore.getState().setProp(id, k, v);
      }
      // Strip the trigger prefix from the ProseMirror doc (the CRDT source of
      // truth). The pending space is prevented below, so it's not in the doc.
      const stripCount = Math.max(0, docPlain.length - hit.newText.length);
      if (!deleteLeadingChars(stripCount)) {
        // No focused PM view (headless render) — fall back to the store text.
        setText(id, hit.newText);
      }
      queueMicrotask(() => requestFocus({ id, placeCaret: 'end' }));
      return true;
    },
    [block, id, setType, setText],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLElement>) => {
      if (!block) return;
      if (slashOpen || mentionOpen) return;

      if (e.key === ' ' || e.key === 'Enter') {
        if (tryMarkdownTransform(e.key === ' ')) {
          e.preventDefault();
          return;
        }
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (spec?.continueOnEnter && !block.text) {
          // Empty list-like block → break out to plain text instead of continuing.
          setType(id, 'text');
          return;
        }
        const nextType: BlockType = spec?.continueOnEnter ? block.type : 'text';
        const props: Record<string, unknown> = spec?.continueOnEnter
          ? block.type === 'todo'
            ? { checked: false }
            : block.type === 'toggle'
            ? { open: true }
            : {}
          : {};
        const newId = insertAfter(id, nextType, props);
        queueMicrotask(() => requestFocus({ id: newId, placeCaret: 'start' }));
        return;
      }

      if (e.key === 'Backspace') {
        const text = (e.currentTarget as HTMLElement).innerText;
        if (text === '') {
          e.preventDefault();
          const focusTarget = removeBlock(id);
          if (focusTarget) queueMicrotask(() => requestFocus({ id: focusTarget, placeCaret: 'end' }));
        }
        return;
      }

      if (e.key === 'Tab') {
        e.preventDefault();
        const ok = e.shiftKey ? outdent(id) : indent(id);
        if (ok) queueMicrotask(() => requestFocus({ id, placeCaret: 'end' }));
        return;
      }

      // Inline marks via execCommand (only for blocks that opt in to inline marks).
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
        const k = e.key.toLowerCase();
        if ((k === 'b' || k === 'i' || k === 'u') && spec?.inlineMarks) {
          e.preventDefault();
          document.execCommand(k === 'b' ? 'bold' : k === 'i' ? 'italic' : 'underline');
          const el = editableRef.current;
          if (el && 'innerHTML' in el) setText(id, (el as HTMLElement).innerHTML);
        }
      }
    },
    [block, spec, slashOpen, tryMarkdownTransform, insertAfter, removeBlock, indent, outdent, id, setType, setText],
  );

  // Sniff current DOM text on input to drive the slash menu.
  const handleInputSniff = useCallback(() => {
    const el = editableRef.current;
    if (!el) return;
    openSlashIfTriggered(el.innerText);
    // Caret-aware @mention detection (independent of the slash menu).
    const ctx = el.innerText.startsWith('/') ? null : getMentionContext();
    if (ctx) {
      setMentionOpen(true);
      setMentionQuery(ctx.query);
    } else {
      setMentionOpen(false);
    }
  }, [openSlashIfTriggered]);

  const handleSlashSelect = useCallback(
    (type: BlockType) => {
      setType(id, type);
      setText(id, '');
      // Seed a columns container with two columns exactly once, here at creation
      // time, instead of self-healing on every render (which multiplied columns).
      if (type === 'columns') {
        const st = useBlocksStore.getState();
        const existing = st.childrenOf[id]?.length ?? 0;
        for (let i = existing; i < 2; i += 1) st.insertChild(id, 'column');
      }
      setSlashOpen(false);
      queueMicrotask(() => requestFocus({ id, placeCaret: 'end' }));
    },
    [id, setType, setText],
  );

  const handleMentionSelect = useCallback((page: Page) => {
    insertMention({ id: page.id, title: page.title, icon: page.icon });
    setMentionOpen(false);
  }, []);

  const handleClickHandle = useCallback(
    (e: React.MouseEvent) => {
      if (e.shiftKey) {
        useSelectionStore.getState().toggle(id);
        e.stopPropagation();
        e.preventDefault();
      }
    },
    [id],
  );

  if (!block || !spec) return null;
  const Render = spec.Render;
  const childrenVisible =
    spec.hasChildren !== false &&
    childIds.length > 0 &&
    (block.type !== 'toggle' || block.props.open !== false);

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-block-id={id}
      onContextMenu={(e) => {
        e.preventDefault();
        setCtxMenu({ x: e.clientX, y: e.clientY });
      }}
      onInput={handleInputSniff}
      className={cn(
        'group relative rounded-sm',
        isDragging && 'z-10',
        isSelected && 'bg-accent/10 ring-1 ring-accent/40',
      )}
    >
      <div className="flex items-start gap-1">
        <div className="mt-1 flex items-center opacity-0 group-hover:opacity-100">
          <button
            type="button"
            onClick={() => {
              const newId = insertAfter(id, 'text', {});
              queueMicrotask(() => requestFocus({ id: newId, placeCaret: 'start' }));
            }}
            aria-label="insert block below"
            className="rounded px-1 text-zinc-400 hover:bg-black/5 hover:text-zinc-700 dark:text-zinc-500 dark:hover:bg-white/10 dark:hover:text-zinc-200"
          >
            +
          </button>
          <button
            {...attributes}
            {...listeners}
            onClick={handleClickHandle}
            aria-label="drag or shift-click to select"
            className="rounded px-0.5 text-zinc-400 hover:bg-black/5 hover:text-zinc-700 dark:text-zinc-500 dark:hover:bg-white/10 dark:hover:text-zinc-200 cursor-grab"
          >
            ⋮⋮
          </button>
        </div>
        <CommentBubble pageId={block.pageId} blockId={id} />
        <div className="relative flex-1">
          <Render
            key={`${block.type}:${block.id}`}
            block={{ ...block, props: { ...block.props, index } }}
            onKeyDown={handleKeyDown}
            registerEditable={registerEditable}
          />
          {slashOpen && (
            <SlashMenu query={slashQuery} onSelect={handleSlashSelect} onClose={() => setSlashOpen(false)} />
          )}
          {mentionOpen && (
            <MentionMenu
              query={mentionQuery}
              onSelect={handleMentionSelect}
              onClose={() => setMentionOpen(false)}
            />
          )}
        </div>
      </div>

      {childrenVisible && (
        <div className="ml-6 border-l border-border pl-3">
          <BlockList parentId={id} ids={childIds} pageId={block.pageId} />
        </div>
      )}

      {ctxMenu && <ContextMenu blockId={id} pos={ctxMenu} onClose={() => setCtxMenu(null)} />}
    </div>
  );
}

export const BlockNode = memo(BlockNodeImpl);
