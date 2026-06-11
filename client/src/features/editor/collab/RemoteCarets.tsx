/**
 * RemoteCarets — render colored carets and selection highlights for each
 * collaborator, positioned over their currently-focused block.
 *
 * Approach
 * --------
 * Awareness gives us `{blockId, anchor, head}` from each peer. We:
 *   1) Find the DOM host with `[data-block-id="<blockId>"]`.
 *   2) Walk its text nodes to convert the character offset back into a
 *      (node, offset) pair, then build a Range.
 *   3) Use `range.getClientRects()` to draw the selection band (one absolute
 *      div per rect) and a caret bar at the `head` rect.
 *
 * Why this lives in an overlay (not inside the editable surface):
 *   - The contentEditable surface is owned by the browser; injecting DOM
 *     into it would confuse caret math and IME.
 *   - The overlay is a position:absolute layer covering the editor wrapper,
 *     repositioned on scroll/resize. It re-measures every awareness change.
 *
 * Throttling: awareness already throttles to ~30 Hz upstream. The render
 * itself is cheap (DOM rects, small N).
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAwarenessStates } from './useAwarenessStates';

interface CaretBox {
  clientId: number;
  color: string;
  name: string;
  rects: DOMRect[];
  caret: DOMRect | null;
}

interface Props {
  containerRef: React.RefObject<HTMLElement>;
}

export function RemoteCarets({ containerRef }: Props): JSX.Element | null {
  const remote = useAwarenessStates();
  const [boxes, setBoxes] = useState<CaretBox[]>([]);
  const rafRef = useRef<number | null>(null);

  // Recompute whenever awareness changes OR layout shifts. We coalesce with
  // requestAnimationFrame so a burst of awareness messages produces at most
  // one measurement pass per frame.
  const measure = (): void => {
    const container = containerRef.current;
    if (!container) {
      setBoxes([]);
      return;
    }
    const containerRect = container.getBoundingClientRect();
    const next: CaretBox[] = [];
    for (const { clientId, state } of remote) {
      if (!state.caret) continue;
      const host =
        container.querySelector<HTMLElement>(`[data-caret-id="${cssEscape(state.caret.blockId)}"]`) ??
        container.querySelector<HTMLElement>(`[data-block-id="${cssEscape(state.caret.blockId)}"]`);
      if (!host) continue;
      const range = rangeFromOffsets(host, state.caret.anchor, state.caret.head);
      if (!range) continue;
      const clientRects = Array.from(range.getClientRects());
      const caretRange = document.createRange();
      const headPos = resolveOffset(host, state.caret.head);
      if (headPos) {
        caretRange.setStart(headPos.node, headPos.offset);
        caretRange.setEnd(headPos.node, headPos.offset);
      }
      const caretRects = caretRange.getClientRects();
      let caretRect: DOMRect | null = caretRects.length > 0 ? caretRects[0] : null;
      if (!caretRect) {
        const b = caretRange.getBoundingClientRect();
        if (b.width > 0 || b.height > 0) caretRect = b;
      }
      if (!caretRect) {
        // Last-resort fallback for edge positions (e.g., trailing empty lines)
        // where collapsed ranges may report no client rect.
        const h = host.getBoundingClientRect();
        caretRect = new DOMRect(h.left, h.top, 2, Math.max(16, h.height || 16));
      }

      next.push({
        clientId,
        color: state.user.color,
        name: state.user.name,
        rects: clientRects.map((r) =>
          new DOMRect(r.left - containerRect.left, r.top - containerRect.top, r.width, r.height),
        ),
        caret: caretRect
          ? new DOMRect(
              caretRect.left - containerRect.left,
              caretRect.top - containerRect.top,
              caretRect.width || 2,
              caretRect.height || 18,
            )
          : null,
      });
    }
    setBoxes(next);
  };

  const schedule = (): void => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      measure();
    });
  };

  useLayoutEffect(() => {
    schedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remote]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(schedule);
    ro.observe(container);
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    return () => {
      ro.disconnect();
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef]);

  if (boxes.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-[5]">
      {boxes.map((box) => (
        <div key={box.clientId}>
          {box.rects.map((r, i) => (
            <div
              key={i}
              className="absolute rounded-sm"
              style={{
                left: r.left,
                top: r.top,
                width: r.width,
                height: r.height,
                background: box.color,
                opacity: 0.18,
              }}
            />
          ))}
          {box.caret && (
            <div
              className="absolute"
              style={{ left: box.caret.left, top: box.caret.top, height: box.caret.height }}
            >
              <div
                className="h-full w-[2px]"
                style={{ background: box.color, boxShadow: `0 0 0 0.5px ${box.color}` }}
              />
              <div
                className="absolute -top-4 left-0 whitespace-nowrap rounded-sm px-1 py-px text-[10px] font-medium text-white"
                style={{ background: box.color }}
              >
                {box.name}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** Build a Range covering anchor..head within `host`. */
function rangeFromOffsets(host: HTMLElement, anchor: number, head: number): Range | null {
  const from = Math.min(anchor, head);
  const to = Math.max(anchor, head);
  const start = resolveOffset(host, from);
  const end = resolveOffset(host, to);
  if (!start || !end) return null;
  const r = document.createRange();
  try {
    r.setStart(start.node, start.offset);
    r.setEnd(end.node, end.offset);
  } catch {
    return null;
  }
  return r;
}

/** Inverse of `offsetWithin` (useLocalAwareness): given a linear char offset,
 *  return the (textNode, localOffset) pair. */
function resolveOffset(
  host: HTMLElement,
  offset: number,
): { node: Node; offset: number } | null {
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
  let acc = 0;
  let cur: Node | null = walker.nextNode();
  let last: Node | null = null;
  while (cur) {
    const len = (cur.nodeValue ?? '').length;
    if (acc + len >= offset) {
      return { node: cur, offset: Math.max(0, Math.min(len, offset - acc)) };
    }
    acc += len;
    last = cur;
    cur = walker.nextNode();
  }
  // Past end: clamp to the last text node tail.
  if (last) return { node: last, offset: (last.nodeValue ?? '').length };
  // Empty block — anchor on the host itself.
  return { node: host, offset: 0 };
}

/** Minimal CSS.escape polyfill — we only need to defend against unusual
 *  characters in block ids (they're objectids, but be defensive). */
function cssEscape(s: string): string {
  if (typeof (window as { CSS?: { escape?: (s: string) => string } }).CSS?.escape === 'function') {
    return (window as unknown as { CSS: { escape: (s: string) => string } }).CSS.escape(s);
  }
  return s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);
}
