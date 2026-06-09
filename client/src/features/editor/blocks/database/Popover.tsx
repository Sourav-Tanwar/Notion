import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * A lightweight popover that renders into `document.body` (so it is never
 * clipped by the table's horizontal-scroll container) and positions itself
 * relative to its anchor using fixed coordinates. Flips above the anchor when
 * there isn't enough room below, and caps its height to the viewport with
 * internal scrolling. Closes on outside-click, Escape, or scroll/resize.
 */
const MARGIN = 8;

export function Popover({
  anchor,
  onClose,
  children,
  width = 224,
  align = 'left',
}: {
  anchor: HTMLElement | null;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  align?: 'left' | 'right';
}): JSX.Element | null {
  const ref = useRef<HTMLDivElement | null>(null);
  const [style, setStyle] = useState<{ top: number; left: number; maxHeight: number } | null>(null);

  useLayoutEffect(() => {
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const needed = ref.current?.scrollHeight ?? 0;
    const spaceBelow = window.innerHeight - r.bottom - MARGIN;
    const spaceAbove = r.top - MARGIN;

    // Prefer below; flip above only when below can't fit and above has more room.
    const placeAbove = needed > spaceBelow && spaceAbove > spaceBelow;
    const avail = placeAbove ? spaceAbove : spaceBelow;
    const maxHeight = Math.max(120, Math.min(needed || avail, avail));

    const top = placeAbove ? Math.max(MARGIN, r.top - maxHeight - 4) : r.bottom + 4;
    const rawLeft = align === 'right' ? r.right - width : r.left;
    const left = Math.max(MARGIN, Math.min(rawLeft, window.innerWidth - width - MARGIN));

    setStyle({ top, left, maxHeight });
  }, [anchor, width, align, children]);

  useEffect(() => {
    const onDoc = (e: MouseEvent): void => {
      if (
        ref.current &&
        !ref.current.contains(e.target as Node) &&
        anchor &&
        !anchor.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onClose, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onClose, true);
      window.removeEventListener('resize', onClose);
    };
  }, [anchor, onClose]);

  return createPortal(
    <div
      ref={ref}
      style={{
        position: 'fixed',
        top: style?.top ?? -9999,
        left: style?.left ?? -9999,
        width,
        maxHeight: style?.maxHeight,
        visibility: style ? 'visible' : 'hidden',
      }}
      className="z-50 overflow-y-auto rounded-lg border border-black/10 bg-white p-1 shadow-xl dark:border-white/10 dark:bg-neutral-800"
    >
      {children}
    </div>,
    document.body,
  );
}
