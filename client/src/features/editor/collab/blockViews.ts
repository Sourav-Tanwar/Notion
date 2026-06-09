/**
 * Registry mapping a block id → its mounted ProseMirror EditorView.
 *
 * `focusedView` only tracks the *active* view, but selection-anchored comments
 * need to stamp a `comment` mark onto a specific block's view *after* focus has
 * moved to the comment composer. Each RichTextSurface registers itself here on
 * mount and removes itself on unmount.
 */

import type { EditorView } from 'prosemirror-view';

const views = new Map<string, EditorView>();

export const blockViews = {
  register(blockId: string, view: EditorView): void {
    views.set(blockId, view);
  },
  unregister(blockId: string): void {
    views.delete(blockId);
  },
  get(blockId: string): EditorView | null {
    return views.get(blockId) ?? null;
  },
};
