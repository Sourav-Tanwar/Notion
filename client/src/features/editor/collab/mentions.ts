/**
 * Helpers for the @-mention picker: detecting the `@query` token before the
 * caret and inserting a `pageMention` node in its place.
 *
 * These operate on the currently-focused EditorView (`focusedView`), mirroring
 * how the toolbar mark commands work.
 */

import { TextSelection } from 'prosemirror-state';
import { schema } from './pmSchema';
import { focusedView } from './focusedView';

export interface MentionContext {
  /** The text typed after `@` (may be empty). */
  query: string;
  /** Doc position of the `@` character. */
  from: number;
  /** Doc position of the caret (end of the query). */
  to: number;
}

/**
 * Inspect the text immediately before the caret in the focused view. Returns
 * the active `@mention` token, or null if the caret isn't in one.
 *
 * A token starts at `@` that is at the start of the block or preceded by
 * whitespace, and runs up to the caret with no whitespace or second `@`.
 */
export function getMentionContext(): MentionContext | null {
  const view = focusedView.get();
  if (!view) return null;
  const { selection } = view.state;
  if (!selection.empty) return null;
  const { $from } = selection;
  const pos = $from.pos;
  const start = $from.start();
  if (pos < start) return null;
  const before = view.state.doc.textBetween(start, pos, '\n', '\n');
  const m = before.match(/(^|\s)@([^\s@]*)$/);
  if (!m) return null;
  const query = m[2];
  const from = pos - query.length - 1; // position of '@'
  return { query, from, to: pos };
}

/**
 * Replace the active `@query` token with a mention chip for `page`, then drop
 * the caret just after it (with a trailing space for natural typing).
 */
export function insertMention(page: { id: string; title: string; icon: string }): boolean {
  const view = focusedView.get();
  if (!view) return false;
  const ctx = getMentionContext();
  if (!ctx) return false;

  const node = schema.nodes.pageMention.create({
    pageId: page.id,
    label: page.title || 'Untitled',
    icon: page.icon || '📄',
  });

  let tr = view.state.tr.replaceWith(ctx.from, ctx.to, node);
  const after = ctx.from + node.nodeSize;
  tr = tr.insertText(' ', after);
  tr = tr.setSelection(TextSelection.create(tr.doc, after + 1));
  view.dispatch(tr);
  view.focus();
  return true;
}
