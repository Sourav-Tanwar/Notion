import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useShallow } from 'zustand/react/shallow';
import {
  selectIsPageLoaded,
  selectRootBlockIds,
  useBlocksStore,
} from '@/stores/blocks.store';
import { selectPage, usePagesStore } from '@/stores/pages.store';
import { useSelectionStore } from '@/stores/selection.store';
import { useRecentStore } from '@/stores/recent.store';
import type { ID } from '@/types/domain';
import { BlockList } from './BlockList';
import { Backlinks } from './Backlinks';
import { FloatingToolbar } from './FloatingToolbar';
import { useHotkey } from '@/hooks/useHotkey';
import { cn } from '@/lib/cn';
import { CoverImage } from './CoverImage';
import { Breadcrumbs } from './Breadcrumbs';
import { EmojiPicker } from '@/components/EmojiPicker';
import '@/features/editor/registry/builtins'; // side-effect: register all block specs
import { SharingModal } from './SharingModal';
import { HistoryPanel } from './HistoryPanel';
import { PageActionsMenu } from './PageActionsMenu';
import { CollabProvider } from './collab/CollabContext';
import { PresenceBar } from './collab/PresenceBar';
import { StatusPill } from './collab/StatusPill';
import { RemoteCarets } from './collab/RemoteCarets';
import { OfflineBanner } from './collab/OfflineBanner';
import { useLocalAwareness } from './collab/useLocalAwareness';
import { useBlocksLiveRefresh } from './collab/useBlocksLiveRefresh';
import { useCommentsLiveRefresh } from './collab/useCommentsLiveRefresh';
import { CommentsDrawer } from './comments/CommentsDrawer';
import { setMentionNavigate } from './collab/mentionNav';
import {
  selectPageOpenCount,
  useCommentsStore,
  useCommentsUiStore,
} from '@/stores/comments.store';

interface Props { pageId: ID }

const CLIPBOARD_MIME = 'application/x-notion-clone-blocks';

export function Editor({ pageId }: Props): JSX.Element {
  // CollabProvider owns the per-page Y.Doc + Hocuspocus connection. Mount it
  // here (not at app root) so navigating between pages tears down the
  // previous WebSocket and frees server resources promptly.
  return (
    <CollabProvider pageId={pageId}>
      <EditorInner pageId={pageId} />
    </CollabProvider>
  );
}

function EditorInner({ pageId }: Props): JSX.Element {
  // Broadcast our caret position to peers. The hook is a no-op until the
  // user has a non-collapsed selection inside a block surface.
  useLocalAwareness(pageId);
  // Refetch the block list when a peer creates / deletes / reorders. Inline
  // text already syncs via Y.Doc; this closes the structural-change gap.
  useBlocksLiveRefresh(pageId);
  // Refetch comments when a peer adds / edits / resolves one.
  useCommentsLiveRefresh(pageId);
  const containerRef = useRef<HTMLDivElement>(null);
  const page = usePagesStore(selectPage(pageId));
  const loaded = useBlocksStore(selectIsPageLoaded(pageId));
  const rootIds = useBlocksStore(useShallow(selectRootBlockIds(pageId)));
  const navigate = useNavigate();

  // Let ProseMirror mention NodeViews trigger client-side navigation.
  useEffect(() => {
    setMentionNavigate((id) => navigate(`/p/${id}`));
    return () => setMentionNavigate(null);
  }, [navigate]);

  const fetchPage = useBlocksStore((s) => s.fetchPage);
  const reorder = useBlocksStore((s) => s.reorder);
  const flushNow = useBlocksStore((s) => s.flushNow);
  const removeMany = useBlocksStore((s) => s.removeMany);
  const serializeTree = useBlocksStore((s) => s.serializeTree);
  const pasteTree = useBlocksStore((s) => s.pasteTree);
  const undo = useBlocksStore((s) => s.undo);
  const redo = useBlocksStore((s) => s.redo);
  const renamePage = usePagesStore((s) => s.renamePage);
  const setIcon = usePagesStore((s) => s.setIcon);

  const iconBtnRef = useRef<HTMLButtonElement | null>(null);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const fetchComments = useCommentsStore((s) => s.fetchPage);
  const openComments = useCommentsUiStore((s) => s.openAll);
  const commentsOpen = useCommentsUiStore((s) => s.open);
  const composeBlockId = useCommentsUiStore((s) => s.composeBlockId);
  const closeComments = useCommentsUiStore((s) => s.close);
  const openCommentCount = useCommentsStore(selectPageOpenCount(pageId));

  useEffect(() => {
    if (!loaded) fetchPage(pageId);
  }, [pageId, loaded, fetchPage]);

  // Load comments once per page mount; live refresh keeps them current after.
  useEffect(() => {
    void fetchComments(pageId);
    return () => useCommentsUiStore.getState().close();
  }, [pageId, fetchComments]);

  // Clear selection when navigating between pages.
  useEffect(() => useSelectionStore.getState().clear, [pageId]);

  // Record this page as recently visited (sidebar "Recent" section).
  useEffect(() => {
    useRecentStore.getState().visit(pageId);
  }, [pageId]);

  /* ---------- Global keyboard ---------- */
  useHotkey('mod+s', () => void flushNow());
  useHotkey('mod+z', () => undo(), { preventDefault: true });
  useHotkey('mod+shift+z', () => redo(), { preventDefault: true });
  useHotkey('mod+y', () => redo(), { preventDefault: true });

  // Delete batch selection with Backspace/Delete when focus is NOT inside a text field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const selected = useSelectionStore.getState().selected;
      if (!selected.size) return;
      const target = e.target as HTMLElement;
      const isEditable =
        target?.isContentEditable ||
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA';
      if (isEditable) return;
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        removeMany([...selected]);
        useSelectionStore.getState().clear();
      } else if (e.key === 'Escape') {
        useSelectionStore.getState().clear();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [removeMany]);

  /* ---------- Copy / Cut / Paste of block selection ---------- */
  useEffect(() => {
    const onCopy = (e: ClipboardEvent) => {
      const selected = useSelectionStore.getState().selected;
      if (!selected.size) return;
      const tree = serializeTree([...selected]);
      e.clipboardData?.setData(CLIPBOARD_MIME, JSON.stringify(tree));
      e.clipboardData?.setData('text/plain', flattenForPlain(tree));
      e.preventDefault();
    };
    const onCut = (e: ClipboardEvent) => {
      const selected = useSelectionStore.getState().selected;
      if (!selected.size) return;
      const tree = serializeTree([...selected]);
      e.clipboardData?.setData(CLIPBOARD_MIME, JSON.stringify(tree));
      e.clipboardData?.setData('text/plain', flattenForPlain(tree));
      removeMany([...selected]);
      useSelectionStore.getState().clear();
      e.preventDefault();
    };
    const onPaste = (e: ClipboardEvent) => {
      const data = e.clipboardData?.getData(CLIPBOARD_MIME);
      if (!data) return; // let browser handle plain-text paste into contentEditable
      const tree = JSON.parse(data);
      // Anchor: last selected block, or last root block on page.
      const selected = [...useSelectionStore.getState().selected];
      const lastRoot = useBlocksStore.getState().rootByPage[pageId] ?? [];
      const anchor = selected[selected.length - 1] ?? lastRoot[lastRoot.length - 1];
      if (anchor) {
        pasteTree(anchor, tree);
        e.preventDefault();
      }
    };
    window.addEventListener('copy', onCopy);
    window.addEventListener('cut', onCut);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('copy', onCopy);
      window.removeEventListener('cut', onCut);
      window.removeEventListener('paste', onPaste);
    };
  }, [pageId, serializeTree, pasteTree, removeMany]);

  /* ---------- DnD ---------- */
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const overData = over.data.current as { parentId?: ID | null; pageId?: ID } | undefined;
      const newParentId = overData?.parentId ?? null;
      const siblings =
        newParentId === null
          ? useBlocksStore.getState().rootByPage[pageId] ?? []
          : useBlocksStore.getState().childrenOf[newParentId] ?? [];
      const newIndex = siblings.indexOf(String(over.id));
      if (newIndex < 0) return;
      reorder(String(active.id), newParentId, newIndex, pageId);
    },
    [pageId, reorder],
  );

  if (!page) return <div className="p-8 text-zinc-500">Page not found</div>;

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative mx-auto px-6 pb-12 pt-6',
        page.fullWidth ? 'max-w-full' : 'max-w-3xl',
        page.smallText && 'text-[0.9rem]',
      )}
      onClick={(e) => {
        // Click outside any block clears multi-selection.
        if (!(e.target as HTMLElement).closest('[data-block-id]')) {
          useSelectionStore.getState().clear();
        }
      }}
    >
      <RemoteCarets containerRef={containerRef} />
      <OfflineBanner />
      <CoverImage pageId={pageId} />
      <Breadcrumbs pageId={pageId} />

      <header className="relative mb-6 flex items-center gap-3">
        <button
          ref={iconBtnRef}
          type="button"
          onClick={() => setIconPickerOpen((v) => !v)}
          aria-label="Change icon"
          className="rounded p-1 text-3xl leading-none hover:bg-zinc-200 dark:hover:bg-zinc-800"
        >
          {page.icon}
        </button>
        {iconPickerOpen && (
          <div className="absolute left-0 top-12 z-[80]">
            <EmojiPicker
              current={page.icon}
              anchorRef={iconBtnRef as React.RefObject<HTMLElement>}
              onSelect={(emoji) => {
                void setIcon(pageId, emoji);
                setIconPickerOpen(false);
              }}
              onClose={() => setIconPickerOpen(false)}
            />
          </div>
        )}
        <input
          value={page.title}
          onChange={(e) => renamePage(pageId, e.target.value)}
          placeholder="Untitled"
          readOnly={!!page.locked}
          className="flex-1 bg-transparent text-3xl font-bold focus:outline-none"
        />
        <PresenceBar />
        <StatusPill />
        <button
          type="button"
          onClick={openComments}
          className="relative shrink-0 rounded border border-zinc-300 px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Comments
          {openCommentCount > 0 && (
            <span className="ml-1 rounded-full bg-amber-500 px-1.5 text-[10px] font-semibold text-white">
              {openCommentCount}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setHistoryOpen(true)}
          className="shrink-0 rounded border border-zinc-300 px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          History
        </button>
        <button
          type="button"
          onClick={() => setShareOpen(true)}
          className="shrink-0 rounded border border-zinc-300 px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Share
        </button>
        <PageActionsMenu pageId={pageId} />
      </header>
      {shareOpen && <SharingModal pageId={pageId} onClose={() => setShareOpen(false)} />}
      {historyOpen && <HistoryPanel pageId={pageId} onClose={() => setHistoryOpen(false)} />}
      {commentsOpen && (
        <CommentsDrawer
          pageId={pageId}
          composeBlockId={composeBlockId}
          onClose={closeComments}
        />
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        {!loaded ? (
          <div className="text-zinc-500">Loading…</div>
        ) : (
          <BlockList ids={rootIds} parentId={null} pageId={pageId} />
        )}
      </DndContext>

      <Backlinks pageId={pageId} />

      <FloatingToolbar />
    </div>
  );
}

function flattenForPlain(tree: ReturnType<typeof Object> ): string {
  // Best-effort plain text representation for pasting into other apps.
  const lines: string[] = [];
  const walk = (nodes: { text: string; children: unknown[] }[], depth: number) => {
    for (const n of nodes) {
      lines.push('  '.repeat(depth) + stripHtml(n.text));
      walk((n.children as { text: string; children: unknown[] }[]) ?? [], depth + 1);
    }
  };
  walk((tree.nodes ?? []) as { text: string; children: unknown[] }[], 0);
  return lines.join('\n');
}

function stripHtml(html: string): string {
  const d = document.createElement('div');
  d.innerHTML = html;
  return d.innerText;
}
