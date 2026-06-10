/**
 * FloatingToolbar — rewritten in 8.2b to operate on the currently-focused
 * ProseMirror EditorView rather than `document.execCommand`.
 *
 * Positioning still comes from the browser's selection rectangle, but every
 * format action dispatches a PM transaction via `marks.ts`. Mark state
 * (active / inactive) is derived from the PM selection so the button
 * highlights update without an external state mirror.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { toolbar, isMarkActive, activeColor, selectedText, getSelectionContext } from './collab/marks';
import { focusedView } from './collab/focusedView';
import { useCommentsUiStore } from '@/stores/comments.store';
import { TEXT_COLORS, HIGHLIGHT_COLORS, type Swatch } from './collab/textStyles';
import { useAiSettingsStore } from '@/stores/ai.store';
import { AskAiPopover } from './ai/AskAiPopover';

interface Pos {
  top: number;
  left: number;
}

interface AiSel {
  blockId: string;
  from: number;
  to: number;
  text: string;
}

export function FloatingToolbar(): JSX.Element | null {
  const [pos, setPos] = useState<Pos | null>(null);
  const [colorOpen, setColorOpen] = useState(false);
  const [aiSel, setAiSel] = useState<AiSel | null>(null);
  const aiEnabled = useAiSettingsStore((s) => s.enabled);
  const refreshAiStatus = useAiSettingsStore((s) => s.refreshStatus);
  const ref = useRef<HTMLDivElement>(null);
  // While the Ask-AI popover is open, the user's text selection can collapse
  // (clicking buttons, typing in the instruction field). Without this guard the
  // toolbar — and the popover with it — would unmount on `selectionchange`.
  const aiOpenRef = useRef(false);
  aiOpenRef.current = aiSel !== null;
  // `tick` is bumped on every selection / focused-view change so isMarkActive
  // re-reads at render time. Cheap and avoids mirroring PM state into React.
  const [, setTick] = useState(0);
  const bump = () => setTick((n) => n + 1);

  // Keep the toolbar fully on-screen: clamp its center so neither edge spills
  // past the viewport. Done post-render (we need the measured width) by writing
  // `left` directly on the node — avoids a state round-trip / layout loop.
  // Coordinates are viewport-relative (position: fixed).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !pos) return;
    const margin = 8;
    const half = el.offsetWidth / 2;
    const min = margin + half;
    const max = window.innerWidth - margin - half;
    const center = Math.max(min, Math.min(pos.left, Math.max(min, max)));
    el.style.left = `${center}px`;
  });

  useEffect(() => {
    void refreshAiStatus();
  }, [refreshAiStatus]);

  useEffect(() => {
    const handle = () => {
      if (aiOpenRef.current) return; // keep toolbar mounted while Ask-AI is open
      const view = focusedView.get();
      if (!view) {
        setPos(null);
        return;
      }
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setPos(null);
        return;
      }
      const range = sel.getRangeAt(0);
      // Only show the toolbar when the selection lives inside the active
      // PM view's DOM — otherwise we'd float over selections in unrelated
      // surfaces (the page title input, the sharing modal, etc.).
      if (!view.dom.contains(range.commonAncestorContainer)) {
        setPos(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        setPos(null);
        return;
      }
      setPos({
        top: rect.top - 44,
        left: rect.left + rect.width / 2,
      });
      setColorOpen(false);
      bump();
    };

    document.addEventListener('selectionchange', handle);
    // Reposition while the page/editor scrolls or the window resizes (capture
    // catches scrolling of inner containers too). Fixed positioning means we
    // must recompute from the live selection rect.
    window.addEventListener('scroll', handle, true);
    window.addEventListener('resize', handle);
    const unsub = focusedView.subscribe(() => {
      handle();
      bump();
    });
    return () => {
      document.removeEventListener('selectionchange', handle);
      window.removeEventListener('scroll', handle, true);
      window.removeEventListener('resize', handle);
      unsub();
    };
  }, []);

  if (!pos) return null;

  const onLink = () => {
    const view = focusedView.get();
    if (!view) return;
    if (isMarkActive('link')) {
      toolbar.unlink();
      bump();
      return;
    }
    const url = window.prompt('Link URL', 'https://');
    if (!url) return;
    toolbar.link(url);
    bump();
  };

  // Capture the block id + quoted text + PM range, then open the drawer to
  // compose a selection-anchored comment. The actual `comment` mark is stamped
  // on once the thread is created (the composer knows the new id).
  const onComment = () => {
    const view = focusedView.get();
    if (!view) return;
    const quote = selectedText().trim();
    if (!quote) return;
    const { from, to } = view.state.selection;
    const host = view.dom.closest<HTMLElement>('[data-block-id]');
    const blockId = host?.getAttribute('data-block-id');
    if (!blockId) return;
    useCommentsUiStore.getState().openForSelection(blockId, quote, from, to);
  };

  return (
    <div
      ref={ref}
      role="toolbar"
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        transform: 'translateX(-50%)',
        zIndex: 70,
      }}
      className="flex items-center gap-0.5 rounded-md border border-border bg-surface p-1 shadow-xl"
      // mousedown on the toolbar must not collapse the editor selection.
      onMouseDown={(e) => e.preventDefault()}
    >
      <Btn active={isMarkActive('strong')} onClick={() => { toolbar.bold(); bump(); }} title="Bold (Ctrl+B)"><b>B</b></Btn>
      <Btn active={isMarkActive('em')} onClick={() => { toolbar.italic(); bump(); }} title="Italic (Ctrl+I)"><i>I</i></Btn>
      <Btn active={isMarkActive('underline')} onClick={() => { toolbar.underline(); bump(); }} title="Underline (Ctrl+U)"><u>U</u></Btn>
      <Btn active={isMarkActive('strike')} onClick={() => { toolbar.strike(); bump(); }} title="Strikethrough"><s>S</s></Btn>
      <Btn active={isMarkActive('code')} onClick={() => { toolbar.code(); bump(); }} title="Inline code">{'<>'}</Btn>
      <span className="mx-1 h-4 w-px bg-border" />
      <div className="relative">
        <Btn
          active={isMarkActive('textColor') || isMarkActive('highlight')}
          onClick={() => setColorOpen((o) => !o)}
          title="Text color & highlight"
        >
          <span style={{ color: activeColor('textColor') ?? undefined }}>A</span>
        </Btn>
        {colorOpen && (
          <ColorMenu
            onPick={() => { setColorOpen(false); bump(); }}
            onClose={() => setColorOpen(false)}
          />
        )}
      </div>
      <span className="mx-1 h-4 w-px bg-border" />
      <Btn active={isMarkActive('link')} onClick={onLink} title="Add / remove link">🔗</Btn>
      <Btn active={false} onClick={onComment} title="Comment on selection">💬</Btn>
      {aiEnabled && (
        <>
          <span className="mx-1 h-4 w-px bg-border" />
          <Btn
            active={aiSel !== null}
            onClick={() => {
              const ctx = getSelectionContext();
              if (ctx) setAiSel(ctx);
            }}
            title="Ask AI"
          >
            <span className="text-xs font-medium">✨ AI</span>
          </Btn>
          {aiSel && <AskAiPopover selection={aiSel} onClose={() => setAiSel(null)} />}
        </>
      )}
    </div>
  );
}

function Btn({
  children,
  onClick,
  title,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  active?: boolean;
}): JSX.Element {
  return (
    <button
      title={title}
      onClick={onClick}
      className={
        'min-w-[28px] rounded px-2 py-1 text-sm hover:bg-zinc-700/60 ' +
        (active ? 'bg-zinc-700/80 text-white' : 'text-zinc-200')
      }
    >
      {children}
    </button>
  );
}

/**
 * Dropdown with two rows of swatches — text foreground colors and highlight
 * (background) colors. Picking a swatch applies the corresponding mark to the
 * live selection via the toolbar commands.
 */
function ColorMenu({
  onPick,
  onClose,
}: {
  onPick: () => void;
  onClose: () => void;
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Element)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const curText = activeColor('textColor');
  const curHi = activeColor('highlight');

  return (
    <div
      ref={ref}
      onMouseDown={(e) => e.preventDefault()}
      className="absolute right-0 top-full z-[80] mt-1 w-56 rounded-md border border-border bg-surface p-2 shadow-2xl"
    >
      <div className="mb-1 px-1 text-[11px] font-medium uppercase tracking-wide text-zinc-400">Text</div>
      <div className="mb-2 grid grid-cols-5 gap-1">
        {TEXT_COLORS.map((s) => (
          <Swatchlet
            key={`t-${s.name}`}
            swatch={s}
            kind="text"
            active={(s.value ?? null) === (curText ?? null)}
            onClick={() => { toolbar.textColor(s.value); onPick(); }}
          />
        ))}
      </div>
      <div className="mb-1 px-1 text-[11px] font-medium uppercase tracking-wide text-zinc-400">Highlight</div>
      <div className="grid grid-cols-5 gap-1">
        {HIGHLIGHT_COLORS.map((s) => (
          <Swatchlet
            key={`h-${s.name}`}
            swatch={s}
            kind="highlight"
            active={(s.value ?? null) === (curHi ?? null)}
            onClick={() => { toolbar.highlight(s.value); onPick(); }}
          />
        ))}
      </div>
    </div>
  );
}

function Swatchlet({
  swatch,
  kind,
  active,
  onClick,
}: {
  swatch: Swatch;
  kind: 'text' | 'highlight';
  active?: boolean;
  onClick: () => void;
}): JSX.Element {
  const isNone = swatch.value === null;
  const style: React.CSSProperties =
    kind === 'text'
      ? { color: swatch.value ?? '#e4e4e7' }
      : { backgroundColor: swatch.value ?? 'transparent' };
  return (
    <button
      title={swatch.name}
      onClick={onClick}
      style={style}
      className={
        'flex h-7 items-center justify-center rounded border text-sm font-semibold ' +
        (active ? 'border-blue-400 ring-1 ring-blue-400 ' : 'border-white/15 ') +
        (kind === 'highlight' ? 'text-zinc-200 ' : '')
      }
    >
      {isNone ? <span className="text-xs text-zinc-400">⦸</span> : 'A'}
    </button>
  );
}
