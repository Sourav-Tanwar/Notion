/**
 * Render a historical Y.Doc snapshot into an HTML preview.
 *
 * The `DocHistoryModel` archive stores the raw Yjs state, which is the
 * source-of-truth for block CONTENT but says nothing about block ORDER,
 * hierarchy, or type — those live in `BlockModel`. A useful preview
 * therefore overlays historical content on the page's CURRENT structure:
 * we walk the live `BlockModel` tree in order and, for each block, look
 * up its fragment in the snapshot doc. Blocks present in the snapshot
 * but no longer in the tree are appended as a "removed" tail so the user
 * can still see deleted content. Blocks in the tree but absent from the
 * snapshot (created after this revision) are rendered as a marker.
 *
 * This is a pragmatic trade-off. A perfect "as-it-was" reconstruction
 * would require snapshotting the block tree alongside every Yjs save,
 * roughly doubling archive size and write cost. Restore (Phase 9.6) will
 * pay that cost when we actually need a faithful rewind; preview only
 * needs to be useful enough to decide *whether* to restore.
 */

import * as Y from 'yjs';
import { BlockModel } from '../modules/blocks/blocks.model';
import { fragmentToHtml } from './yjsToHtml';

const BLOCKS_MAP_KEY = 'blocks';

interface BlockRow {
  _id: string;
  parentId: string | null;
  order: number;
  type: string;
}

interface RenderedPreview {
  html: string;
  plainText: string;
  blockCount: number;
}

export async function renderSnapshotPreview(
  pageId: string,
  state: Uint8Array,
): Promise<RenderedPreview> {
  const doc = new Y.Doc();
  try {
    Y.applyUpdate(doc, state);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[history-preview] applyUpdate failed', {
      pageId,
      stateBytes: state.byteLength,
      err: err instanceof Error ? err.message : String(err),
    });
    // Corrupt history rows shouldn't kill the request — just return an
    // empty preview and let the client show a "couldn't render" message.
    doc.destroy();
    return { html: '', plainText: '', blockCount: 0 };
  }

  try {
    const fragments = doc.getMap<Y.XmlFragment>(BLOCKS_MAP_KEY);

    const tree = (await BlockModel.find({ pageId })
      .select('_id parentId order type')
      .sort({ parentId: 1, order: 1 })
      .lean()) as unknown as BlockRow[];

    const childrenOf = new Map<string | null, BlockRow[]>();
    for (const row of tree) {
      const key = row.parentId ?? null;
      const arr = childrenOf.get(key) ?? [];
      arr.push(row);
      childrenOf.set(key, arr);
    }

    const seen = new Set<string>();
    const parts: string[] = [];

    const walk = (parentId: string | null, depth: number): void => {
      const kids = childrenOf.get(parentId);
      if (!kids) return;
      for (const row of kids) {
        seen.add(row._id);
        const frag = fragments.get(row._id);
        const html = frag instanceof Y.XmlFragment ? fragmentToHtml(frag) : '';
        parts.push(renderBlock(row.type, html, depth, /* removed */ false));
        walk(row._id, depth + 1);
      }
    };
    walk(null, 0);

    // Tail: blocks in the snapshot but no longer in the live tree.
    const removed: string[] = [];
    fragments.forEach((frag, id) => {
      if (seen.has(id)) return;
      if (!(frag instanceof Y.XmlFragment)) return;
      removed.push(renderBlock('text', fragmentToHtml(frag), 0, /* removed */ true));
    });
    if (removed.length) {
      parts.push('<hr/><p><em>Blocks removed since this revision:</em></p>');
      parts.push(...removed);
    }

    const html = parts.join('\n');
    const plainText = stripHtml(html);
    return {
      html,
      plainText,
      blockCount: seen.size + removed.length,
    };
  } finally {
    doc.destroy();
  }
}

/** Minimal block-type → HTML wrapper. Mirrors the small subset the editor
 *  ships with; anything unknown falls back to a `<div>` so preview never
 *  silently drops content. */
function renderBlock(type: string, innerHtml: string, depth: number, removed: boolean): string {
  const indent = depth > 0 ? ` style="margin-left:${depth * 1.5}em"` : '';
  const cls = removed ? ' data-removed="true"' : '';
  switch (type) {
    case 'h1':
      return `<h1${indent}${cls}>${innerHtml}</h1>`;
    case 'h2':
      return `<h2${indent}${cls}>${innerHtml}</h2>`;
    case 'h3':
      return `<h3${indent}${cls}>${innerHtml}</h3>`;
    case 'quote':
      return `<blockquote${indent}${cls}>${innerHtml}</blockquote>`;
    case 'code':
      return `<pre${indent}${cls}><code>${innerHtml}</code></pre>`;
    case 'bullet':
      return `<ul${indent}${cls}><li>${innerHtml}</li></ul>`;
    case 'numbered':
      return `<ol${indent}${cls}><li>${innerHtml}</li></ol>`;
    case 'todo':
      return `<div${indent}${cls}>☐ ${innerHtml}</div>`;
    default:
      return `<p${indent}${cls}>${innerHtml}</p>`;
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
