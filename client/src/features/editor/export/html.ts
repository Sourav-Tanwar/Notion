import type { Block, ID } from '@/types/domain';
import { useBlocksStore } from '@/stores/blocks.store';
import { usePagesStore } from '@/stores/pages.store';
import { resolveAssetUrl } from '@/lib/assetUrl';

/**
 * Build a clean, self-contained HTML document for a page — used for "Export to
 * PDF" by opening it in a new window and invoking the browser's print dialog
 * (Save as PDF). Rendering into a fresh document avoids fighting the app's
 * layout / print styles.
 *
 * Each text-like block already stores its inline content as HTML, so we embed
 * it directly inside the appropriate semantic wrapper.
 */
export function pageToPrintableHtml(pageId: ID): string {
  const pages = usePagesStore.getState();
  const blocks = useBlocksStore.getState();
  const page = pages.byId[pageId];
  const rootIds = blocks.rootByPage[pageId] ?? [];

  const title = page ? `${page.icon ? `${page.icon} ` : ''}${page.title || 'Untitled'}` : 'Untitled';
  const body = renderNodes(rootIds, blocks.byId, blocks.childrenOf);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(page?.title || 'Untitled')}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #1f2328; margin: 0; padding: 48px; max-width: 820px; margin-inline: auto;
  }
  h1.doc-title { font-size: 2.2em; margin: 0 0 0.6em; }
  h1, h2, h3 { line-height: 1.25; margin: 1.2em 0 0.4em; }
  p { margin: 0.4em 0; }
  ul, ol { margin: 0.3em 0; padding-left: 1.4em; }
  li { margin: 0.15em 0; }
  blockquote { margin: 0.6em 0; padding: 0.2em 1em; border-left: 3px solid #d0d7de; color: #57606a; }
  .callout { margin: 0.6em 0; padding: 0.6em 0.9em; background: #f6f8fa; border-radius: 6px; display: flex; gap: 0.5em; }
  pre { background: #f6f8fa; padding: 0.9em; border-radius: 6px; overflow: auto; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.9em; }
  pre code { font-size: 0.85em; }
  hr { border: none; border-top: 1px solid #d0d7de; margin: 1.4em 0; }
  img { max-width: 100%; height: auto; border-radius: 6px; }
  .todo { list-style: none; padding-left: 0; }
  .todo > li { display: flex; gap: 0.5em; align-items: baseline; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
<h1 class="doc-title">${escapeHtml(title)}</h1>
${body}
</body>
</html>`;
}

function renderNodes(
  ids: ID[],
  byId: Record<ID, Block>,
  childrenOf: Record<ID, ID[]>,
): string {
  let html = '';
  let i = 0;
  while (i < ids.length) {
    const b = byId[ids[i]];
    if (!b) { i++; continue; }

    // Group consecutive list items of the same kind into one <ul>/<ol>.
    if (b.type === 'bullet' || b.type === 'numbered' || b.type === 'todo') {
      const kind = b.type;
      const items: string[] = [];
      while (i < ids.length && byId[ids[i]]?.type === kind) {
        const item = byId[ids[i]];
        const kids = childrenOf[ids[i]];
        const nested = kids?.length ? renderNodes(kids, byId, childrenOf) : '';
        if (kind === 'todo') {
          const checked = Boolean(item.props.checked);
          items.push(
            `<li><input type="checkbox" disabled ${checked ? 'checked' : ''}/> <span>${item.text || ''}</span>${nested}</li>`,
          );
        } else {
          items.push(`<li>${item.text || ''}${nested}</li>`);
        }
        i++;
      }
      const tag = kind === 'numbered' ? 'ol' : 'ul';
      const cls = kind === 'todo' ? ' class="todo"' : '';
      html += `<${tag}${cls}>${items.join('')}</${tag}>`;
      continue;
    }

    html += renderBlock(b, childrenOf[ids[i]] ?? [], byId, childrenOf);
    i++;
  }
  return html;
}

function renderBlock(
  b: Block,
  kids: ID[],
  byId: Record<ID, Block>,
  childrenOf: Record<ID, ID[]>,
): string {
  const nested = kids.length ? renderNodes(kids, byId, childrenOf) : '';
  switch (b.type) {
    case 'heading':
      return `<h1>${b.text || ''}</h1>${nested}`;
    case 'heading2':
      return `<h2>${b.text || ''}</h2>${nested}`;
    case 'heading3':
      return `<h3>${b.text || ''}</h3>${nested}`;
    case 'quote':
      return `<blockquote>${b.text || ''}</blockquote>${nested}`;
    case 'callout': {
      const icon = (b.props.icon as string) ?? '💡';
      return `<div class="callout"><span>${escapeHtml(icon)}</span><div>${b.text || ''}</div></div>${nested}`;
    }
    case 'toggle':
      return `<p>${b.text || ''}</p>${nested}`;
    case 'code': {
      const lang = (b.props.lang as string) ?? '';
      return `<pre><code class="language-${escapeHtml(lang)}">${escapeHtml(b.text || '')}</code></pre>`;
    }
    case 'divider':
      return '<hr/>';
    case 'image': {
      const url = resolveAssetUrl((b.props.url as string) ?? '') ?? '';
      const alt = escapeHtml((b.text || '').trim());
      return url ? `<figure><img src="${escapeHtml(url)}" alt="${alt}"/>${alt ? `<figcaption>${alt}</figcaption>` : ''}</figure>` : '';
    }
    case 'text':
    default:
      return `<p>${b.text || ''}</p>${nested}`;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
