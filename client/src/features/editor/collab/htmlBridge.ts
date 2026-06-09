/**
 * HTML ↔ ProseMirror doc bridge.
 *
 * The Zustand block store keeps `block.text` as an HTML string — that's what
 * gets POSTed to the server, snapshotted into the REST API, and rendered by
 * the read-only PublicShare viewer. Migrating that storage format is out of
 * scope, so the collab layer round-trips through HTML at two points:
 *
 *   1) Seeding: when a Y.XmlFragment for a block is empty (first writer in
 *      the room), we parse the stored HTML into a PM doc and apply it as the
 *      fragment's initial content. Everyone else converges via Yjs sync.
 *   2) Snapshotting: on every PM transaction we serialize the doc back to
 *      HTML and write it through to the store (debounced upstream).
 *
 * The serializer normalizes `<b>` → `<strong>`, `<i>` → `<em>`, etc. That
 * means the first edit of a legacy block rewrites its stored HTML to the
 * canonical mark tags. Visually identical; intentional.
 */

import {
  DOMParser as PMDOMParser,
  DOMSerializer,
  type Node as PMNode,
} from 'prosemirror-model';
import { schema } from './pmSchema';

const serializer = DOMSerializer.fromSchema(schema);
const parser = PMDOMParser.fromSchema(schema);

/** Parse an HTML string into a PM doc using our schema. Loose inline content
 *  (no wrapping `<p>`) is auto-wrapped so the doc always has a paragraph. */
export function htmlToDoc(html: string): PMNode {
  const container = document.createElement('div');
  const trimmed = (html ?? '').trim();
  if (!trimmed) {
    container.innerHTML = '<p></p>';
  } else if (!/^<p[\s>]/i.test(trimmed)) {
    // Legacy stored value might be raw text or inline-only. Wrap.
    container.innerHTML = `<p>${trimmed}</p>`;
  } else {
    container.innerHTML = trimmed;
  }
  return parser.parse(container);
}

/** Serialize a PM doc back to an HTML string for store/REST storage. */
export function docToHtml(doc: PMNode): string {
  const frag = serializer.serializeFragment(doc.content);
  const div = document.createElement('div');
  div.appendChild(frag);
  // Collapse to inline-only when there's a single paragraph — matches the
  // legacy storage shape (no <p> wrapper for single-line blocks).
  const onlyP = div.children.length === 1 && div.firstElementChild?.tagName === 'P';
  return onlyP ? (div.firstElementChild as HTMLElement).innerHTML : div.innerHTML;
}

/** Plain text view of a PM doc — used by markdown-shortcut detection. */
export function docToPlain(doc: PMNode): string {
  return doc.textBetween(0, doc.content.size, '\n', ' ');
}
