/**
 * Toolbar commands that dispatch transactions on the currently-focused
 * EditorView. Replaces the old `document.execCommand` path.
 *
 * Each command is a thin wrapper around prosemirror-commands' `toggleMark`
 * (or a custom transaction for link). They return `false` if there's no
 * focused view so callers can disable buttons accordingly.
 */

import { toggleMark } from 'prosemirror-commands';
import type { MarkType } from 'prosemirror-model';
import { schema } from './pmSchema';
import { focusedView } from './focusedView';
import { blockViews } from './blockViews';

function applyToggle(markType: MarkType, attrs?: Record<string, unknown>): boolean {
  const view = focusedView.get();
  if (!view) return false;
  toggleMark(markType, attrs)(view.state, view.dispatch);
  view.focus();
  return true;
}

/**
 * Set (or clear) an attribute-bearing mark like color/highlight across the
 * selection. Unlike `toggleMark`, this always *replaces* any existing instance
 * so switching from red → blue doesn't leave both marks stacked. A null color
 * just removes the mark.
 */
function applyColor(markType: MarkType, color: string | null): boolean {
  const view = focusedView.get();
  if (!view) return false;
  const { state } = view;
  const { from, to, empty } = state.selection;
  let tr = state.tr;
  if (empty) {
    tr = color ? tr.addStoredMark(markType.create({ color })) : tr.removeStoredMark(markType);
  } else {
    tr = tr.removeMark(from, to, markType);
    if (color) tr = tr.addMark(from, to, markType.create({ color }));
  }
  view.dispatch(tr);
  view.focus();
  return true;
}

export const toolbar = {
  bold: () => applyToggle(schema.marks.strong),
  italic: () => applyToggle(schema.marks.em),
  underline: () => applyToggle(schema.marks.underline),
  strike: () => applyToggle(schema.marks.strike),
  code: () => applyToggle(schema.marks.code),
  textColor: (color: string | null) => applyColor(schema.marks.textColor, color),
  highlight: (color: string | null) => applyColor(schema.marks.highlight, color),
  link: (href: string) => applyToggle(schema.marks.link, { href }),
  unlink: () => {
    const view = focusedView.get();
    if (!view) return false;
    const { from, to } = view.state.selection;
    view.dispatch(view.state.tr.removeMark(from, to, schema.marks.link));
    view.focus();
    return true;
  },
};

/** The plain text currently selected in the focused view (empty if none). */
export function selectedText(): string {
  const view = focusedView.get();
  if (!view) return '';
  const { from, to, empty } = view.state.selection;
  if (empty) return '';
  return view.state.doc.textBetween(from, to, ' ');
}

/**
 * Delete the first `count` characters from the focused block's text. Used by
 * block-level markdown shortcuts (`# `, `- `, `> ` …) to strip the trigger
 * prefix from the *ProseMirror doc* — the CRDT source of truth. Updating only
 * the Zustand store would be overwritten by PM's next flush, leaving the
 * literal prefix visible. Returns false when there's no focused view.
 */
export function deleteLeadingChars(count: number): boolean {
  const view = focusedView.get();
  if (!view) return false;
  if (count <= 0) return true;
  const to = Math.min(1 + count, view.state.doc.content.size - 1);
  if (to <= 1) return true;
  view.dispatch(view.state.tr.delete(1, to));
  view.focus();
  return true;
}

/**
 * Wrap the current selection in a `comment` mark carrying `commentId`. Used by
 * the floating toolbar's “Comment” button once the thread root has been created
 * server-side. No-op (returns false) if there's no ranged selection.
 */
export function applyCommentMark(commentId: string): boolean {
  const view = focusedView.get();
  if (!view) return false;
  const { from, to, empty } = view.state.selection;
  if (empty) return false;
  view.dispatch(view.state.tr.addMark(from, to, schema.marks.comment.create({ commentId })));
  view.focus();
  return true;
}

/** Remove any `comment` mark for `commentId` across the whole focused block. */
export function removeCommentMark(commentId: string): boolean {
  const view = focusedView.get();
  if (!view) return false;
  const { doc } = view.state;
  let tr = view.state.tr;
  let changed = false;
  doc.descendants((node, pos) => {
    if (!node.isText) return;
    const mark = node.marks.find(
      (m) => m.type === schema.marks.comment && m.attrs.commentId === commentId,
    );
    if (mark) {
      tr = tr.removeMark(pos, pos + node.nodeSize, mark);
      changed = true;
    }
  });
  if (changed) view.dispatch(tr);
  return changed;
}

/**
 * Apply a `comment` mark covering `from..to` of a specific block's view. Used
 * after a selection-anchored thread is created — by then focus has moved to the
 * drawer, so we target the block's view directly (by id) rather than the
 * focused one. Positions are clamped to the current doc size in case the block
 * was edited between selecting and posting.
 */
export function applyCommentMarkTo(
  blockId: string,
  from: number,
  to: number,
  commentId: string,
): boolean {
  const view = blockViews.get(blockId);
  if (!view) return false;
  const size = view.state.doc.content.size;
  const a = Math.max(0, Math.min(from, size));
  const b = Math.max(0, Math.min(to, size));
  if (b <= a) return false;
  view.dispatch(view.state.tr.addMark(a, b, schema.marks.comment.create({ commentId })));
  return true;
}

/** True if `mark` is active across the current selection. */
export function isMarkActive(markName: keyof typeof schema.marks): boolean {
  const view = focusedView.get();
  if (!view) return false;
  const { from, $from, to, empty } = view.state.selection;
  const type = schema.marks[markName];
  if (empty) return !!type.isInSet(view.state.storedMarks || $from.marks());
  return view.state.doc.rangeHasMark(from, to, type);
}

/** The `color` attr of an active color/highlight mark at the selection, or null. */
export function activeColor(markName: 'textColor' | 'highlight'): string | null {
  const view = focusedView.get();
  if (!view) return null;
  const type = schema.marks[markName];
  const { $from, empty } = view.state.selection;
  const marks = empty ? view.state.storedMarks || $from.marks() : $from.marksAcross(view.state.selection.$to) ?? $from.marks();
  const found = marks.find((m) => m.type === type);
  return found ? (found.attrs.color as string) : null;
}
