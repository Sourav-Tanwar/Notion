/**
 * Minimal ProseMirror schema for block inline content.
 *
 * Scope: one paragraph of inline text + a small mark set matching what the
 * legacy contentEditable surface supported (b/i/u/strike/code/link). Block
 * type (heading vs paragraph vs quote vs …) stays in the Zustand block
 * record — PM only owns inline text/marks within a single block.
 *
 * Why we don't model the whole page as one PM doc:
 *  - The existing block tree is the source of truth for ordering, nesting,
 *    block type, todo state, image src, code language, etc. Migrating all of
 *    that into a single PM schema is a multi-week rewrite.
 *  - Per-block PM views compose cleanly with the existing tree, give us CRDT
 *    text out-of-the-box (one Y.XmlFragment per block id), and keep the
 *    block-level DnD / outdent / indent code untouched.
 *
 * Trade-off: marks can't span across blocks (you can't bold across a
 * paragraph boundary). That matches Notion's UX and is acceptable.
 */

import { Schema } from 'prosemirror-model';

export const schema = new Schema({
  nodes: {
    doc: { content: 'paragraph+' },
    paragraph: {
      content: 'inline*',
      toDOM: () => ['p', { class: 'pm-p' }, 0],
      parseDOM: [{ tag: 'p' }],
    },
    text: { group: 'inline' },
    /**
     * Inline @-mention of another page. An atomic leaf node carrying the
     * target page id plus a snapshot of its title/icon (used for HTML
     * serialization, export and the read-only viewer). The live editor
     * renders it via a NodeView that resolves the *current* title from the
     * pages store, so renames reflect instantly without rewriting the doc.
     */
    pageMention: {
      group: 'inline',
      inline: true,
      atom: true,
      selectable: true,
      draggable: false,
      attrs: {
        pageId: {},
        label: { default: '' },
        icon: { default: '📄' },
      },
      // Contribute the label to plaintext extraction (search/snippets/copy).
      leafText: (node) => `${node.attrs.label}`,
      parseDOM: [
        {
          tag: 'a.pm-mention',
          getAttrs: (dom) => {
            const el = dom as HTMLElement;
            return {
              pageId: el.getAttribute('data-page-id') ?? '',
              label: el.getAttribute('data-label') ?? (el.textContent ?? '').trim(),
              icon: el.getAttribute('data-icon') ?? '📄',
            };
          },
        },
      ],
      toDOM: (node) => [
        'a',
        {
          class: 'pm-mention',
          href: `/p/${node.attrs.pageId}`,
          'data-page-id': node.attrs.pageId,
          'data-label': node.attrs.label,
          'data-icon': node.attrs.icon,
        },
        `${node.attrs.icon} ${node.attrs.label || 'Untitled'}`,
      ],
    },
  },
  marks: {
    strong: {
      parseDOM: [{ tag: 'strong' }, { tag: 'b' }],
      toDOM: () => ['strong', 0],
    },
    em: {
      parseDOM: [{ tag: 'em' }, { tag: 'i' }],
      toDOM: () => ['em', 0],
    },
    underline: {
      parseDOM: [{ tag: 'u' }],
      toDOM: () => ['u', 0],
    },
    strike: {
      parseDOM: [{ tag: 's' }, { tag: 'strike' }, { tag: 'del' }],
      toDOM: () => ['s', 0],
    },
    code: {
      parseDOM: [{ tag: 'code' }],
      toDOM: () => ['code', 0],
    },
    /** Inline text foreground color. Stores a concrete CSS color so it
     *  round-trips through stored HTML and the public viewer. */
    textColor: {
      attrs: { color: {} },
      parseDOM: [
        {
          tag: 'span[data-text-color]',
          getAttrs: (dom) => ({ color: (dom as HTMLElement).getAttribute('data-text-color') }),
        },
      ],
      toDOM: (mark) => [
        'span',
        { 'data-text-color': mark.attrs.color, style: `color:${mark.attrs.color}` },
        0,
      ],
    },
    /** Inline highlight (background) color. */
    highlight: {
      attrs: { color: {} },
      parseDOM: [
        {
          tag: 'span[data-highlight]',
          getAttrs: (dom) => ({ color: (dom as HTMLElement).getAttribute('data-highlight') }),
        },
      ],
      toDOM: (mark) => [
        'span',
        {
          'data-highlight': mark.attrs.color,
          style: `background-color:${mark.attrs.color};border-radius:3px;padding:0 1px`,
        },
        0,
      ],
    },
    link: {
      attrs: { href: { default: '' } },
      inclusive: false,
      parseDOM: [
        {
          tag: 'a[href]',
          getAttrs: (node) => ({
            href: (node as HTMLAnchorElement).getAttribute('href') ?? '',
          }),
        },
      ],
      toDOM: (mark) => [
        'a',
        { href: mark.attrs.href, target: '_blank', rel: 'noopener noreferrer' },
        0,
      ],
    },
    /**
     * Anchors a comment thread to a span of text. Carries the comment (thread
     * root) id; the editor renders it as a tinted, underlined span and clicking
     * it opens that thread. Non-inclusive so typing at the edges doesn't extend
     * the highlighted range.
     */
    comment: {
      attrs: { commentId: {} },
      inclusive: false,
      parseDOM: [
        {
          tag: 'span[data-comment-id]',
          getAttrs: (dom) => ({ commentId: (dom as HTMLElement).getAttribute('data-comment-id') }),
        },
      ],
      toDOM: (mark) => [
        'span',
        {
          'data-comment-id': mark.attrs.commentId,
          class: 'pm-comment',
        },
        0,
      ],
    },
  },
});
