import { useEffect } from 'react';

/**
 * Imperatively manage caret focus on a contentEditable element using a global registry.
 * Used after Enter/Backspace to move the caret to a different block.
 */
type FocusRequest = { id: string; placeCaret?: 'start' | 'end' };

const listeners = new Set<(req: FocusRequest) => void>();

export function requestFocus(req: FocusRequest): void {
  listeners.forEach((fn) => fn(req));
}

export function useFocusOn(id: string, ref: React.RefObject<HTMLElement>): void {
  useEffect(() => {
    const handler = (req: FocusRequest) => {
      if (req.id !== id) return;
      const el = ref.current;
      if (!el) return;
      // If the block surface is a ProseMirror RichTextSurface (8.2b), it
      // exposes a `__focusPM` imperative method on the host. Prefer that
      // because PM owns the selection state and arbitrary Range mutations
      // would be overwritten by PM's own selection sync on next dispatch.
      const pm = (el as HTMLElement & { __focusPM?: (where: 'start' | 'end') => void }).__focusPM;
      if (pm) {
        pm(req.placeCaret === 'start' ? 'start' : 'end');
        return;
      }
      el.focus();
      const range = document.createRange();
      const sel = window.getSelection();
      if (!sel) return;
      range.selectNodeContents(el);
      range.collapse(req.placeCaret !== 'start');
      sel.removeAllRanges();
      sel.addRange(range);
    };
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, [id, ref]);
}
