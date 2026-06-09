/**
 * Track which ProseMirror EditorView currently has focus.
 *
 * The FloatingToolbar needs to dispatch transactions onto whichever block
 * the user is editing. Each block owns its own EditorView, so we keep a tiny
 * pub-sub of "the active view" that surfaces register themselves into on
 * focus and clear on blur.
 *
 * This is a singleton — only one block can have keyboard focus at a time.
 */

import type { EditorView } from 'prosemirror-view';

type Listener = (view: EditorView | null) => void;

let active: EditorView | null = null;
const listeners = new Set<Listener>();

export const focusedView = {
  get(): EditorView | null {
    return active;
  },
  set(view: EditorView | null): void {
    if (active === view) return;
    active = view;
    for (const l of listeners) l(view);
  },
  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};
