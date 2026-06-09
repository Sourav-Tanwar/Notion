/**
 * Y.XmlFragment → HTML serializer (server-side, DOM-free).
 *
 * The client encodes each block's inline content as a `Y.XmlFragment` shaped
 * to match the PM schema in [client/src/features/editor/collab/pmSchema.ts]:
 *
 *     paragraph → <p>
 *     text + marks → <strong> | <em> | <u> | <s> | <code> | <a href>
 *
 * Server-side reconciliation needs to mirror that mapping so that
 * `Block.text` (the HTML stored for REST consumers) stays in sync with the
 * CRDT. Doing this without `prosemirror-model` or `jsdom` keeps the realtime
 * adapter free of UI dependencies.
 *
 * Approach: walk the Y.XmlFragment children directly. For Y.XmlText we
 * consume the Delta (Quill-style) and group adjacent runs that share the
 * same mark set so we emit balanced tags. The mark application order is
 * deterministic (alphabetical by name) so concurrent edits converge to
 * byte-identical HTML.
 */

import * as Y from 'yjs';

const MARK_ORDER = ['strong', 'em', 'underline', 'strike', 'code', 'link'] as const;
type MarkName = (typeof MARK_ORDER)[number];

const TAG_FOR_MARK: Record<MarkName, string> = {
  strong: 'strong',
  em: 'em',
  underline: 'u',
  strike: 's',
  code: 'code',
  link: 'a',
};

const NODE_TO_TAG: Record<string, string> = {
  paragraph: 'p',
};

/**
 * Serialize the fragment to an HTML string compatible with the legacy
 * Editable storage format: a single-paragraph block returns inline content
 * without the wrapping `<p>` (matches `docToHtml` in htmlBridge.ts).
 */
export function fragmentToHtml(frag: Y.XmlFragment): string {
  const children = frag.toArray();
  if (children.length === 0) return '';

  // Special-case the single-paragraph block to drop the wrapper.
  if (
    children.length === 1 &&
    children[0] instanceof Y.XmlElement &&
    children[0].nodeName === 'paragraph'
  ) {
    return childrenToHtml((children[0] as Y.XmlElement).toArray());
  }

  let out = '';
  for (const child of children) out += nodeToHtml(child);
  return out;
}

function nodeToHtml(node: Y.XmlElement | Y.XmlText | Y.XmlHook | Y.XmlFragment): string {
  if (node instanceof Y.XmlText) return textToHtml(node);
  if (node instanceof Y.XmlElement) {
    const tag = NODE_TO_TAG[node.nodeName] ?? null;
    const inner = childrenToHtml(node.toArray());
    return tag ? `<${tag}>${inner}</${tag}>` : inner;
  }
  // XmlHook / nested fragments aren't produced by the client schema; ignore.
  return '';
}

function childrenToHtml(children: (Y.XmlElement | Y.XmlText | Y.XmlHook | Y.XmlFragment)[]): string {
  let out = '';
  for (const child of children) out += nodeToHtml(child);
  return out;
}

interface DeltaOp {
  insert?: string;
  attributes?: Record<string, unknown>;
}

/**
 * Serialize a Y.XmlText to HTML, grouping consecutive runs that share the
 * same mark set so we emit balanced tags. y-prosemirror stores marks as
 * keys in the delta op's `attributes` (e.g. `{strong: true, link: {href}}`).
 */
function textToHtml(text: Y.XmlText): string {
  const delta = (text.toDelta() as DeltaOp[]) ?? [];
  let out = '';
  for (const op of delta) {
    if (typeof op.insert !== 'string') continue;
    const escaped = escapeHtml(op.insert);
    out += wrapMarks(escaped, op.attributes ?? {});
  }
  return out;
}

function wrapMarks(content: string, attrs: Record<string, unknown>): string {
  // Apply marks in a deterministic order so output is stable across peers.
  let html = content;
  for (let i = MARK_ORDER.length - 1; i >= 0; i--) {
    const name = MARK_ORDER[i];
    const value = attrs[name];
    if (!value) continue;
    const tag = TAG_FOR_MARK[name];
    if (name === 'link') {
      const href = (value as { href?: string }).href ?? '';
      html = `<a href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">${html}</a>`;
    } else {
      html = `<${tag}>${html}</${tag}>`;
    }
  }
  return html;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
