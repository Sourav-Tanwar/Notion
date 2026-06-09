import type { Block, ID } from '@/types/domain';
import { useBlocksStore } from '@/stores/blocks.store';
import { usePagesStore } from '@/stores/pages.store';
import { resolveAssetUrl } from '@/lib/assetUrl';

/**
 * Client-side Markdown serializer. Walks the in-memory block tree for a page
 * and emits CommonMark-ish text: headings, lists (bullet / numbered / todo),
 * quotes, callouts, code fences, dividers and images. Inline marks (bold,
 * italic, code, strike, links) are recovered from each block's stored HTML.
 *
 * The page must already be loaded into the blocks store (it is whenever the
 * editor for it is open).
 */
export function pageToMarkdown(pageId: ID): string {
  const pages = usePagesStore.getState();
  const blocks = useBlocksStore.getState();
  const page = pages.byId[pageId];
  const rootIds = blocks.rootByPage[pageId] ?? [];

  const lines: string[] = [];
  if (page) lines.push(`# ${page.icon ? `${page.icon} ` : ''}${page.title || 'Untitled'}`, '');

  walk(rootIds, blocks.byId, blocks.childrenOf, 0, lines);

  // Collapse 3+ blank lines down to a single blank line and trim trailing ws.
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

function walk(
  ids: ID[],
  byId: Record<ID, Block>,
  childrenOf: Record<ID, ID[]>,
  depth: number,
  out: string[],
): void {
  const indent = '  '.repeat(depth);
  let orderedIndex = 0;
  let prevType: string | null = null;

  for (const id of ids) {
    const b = byId[id];
    if (!b) continue;
    if (b.type === 'numbered') orderedIndex = prevType === 'numbered' ? orderedIndex + 1 : 1;
    else orderedIndex = 0;
    prevType = b.type;

    const inline = htmlToInlineMd(b.text);

    switch (b.type) {
      case 'heading':
        pushBlock(out, `${indent}# ${inline}`);
        break;
      case 'heading2':
        pushBlock(out, `${indent}## ${inline}`);
        break;
      case 'heading3':
        pushBlock(out, `${indent}### ${inline}`);
        break;
      case 'todo': {
        const checked = Boolean(b.props.checked);
        out.push(`${indent}- [${checked ? 'x' : ' '}] ${inline}`);
        break;
      }
      case 'bullet':
        out.push(`${indent}- ${inline}`);
        break;
      case 'numbered':
        out.push(`${indent}${orderedIndex}. ${inline}`);
        break;
      case 'toggle':
        out.push(`${indent}- ${inline}`);
        break;
      case 'quote':
        pushBlock(out, `${indent}> ${inline}`);
        break;
      case 'callout': {
        const icon = (b.props.icon as string) ?? '💡';
        pushBlock(out, `${indent}> ${icon} ${inline}`);
        break;
      }
      case 'code': {
        const lang = (b.props.lang as string) ?? '';
        pushBlock(out, `${indent}\`\`\`${lang === 'plain' ? '' : lang}`);
        for (const ln of (b.text || '').split('\n')) out.push(`${indent}${ln}`);
        out.push(`${indent}\`\`\``);
        break;
      }
      case 'divider':
        pushBlock(out, `${indent}---`);
        break;
      case 'image': {
        const url = resolveAssetUrl((b.props.url as string) ?? '') ?? '';
        const alt = (b.text || '').trim();
        if (url) pushBlock(out, `${indent}![${alt}](${url})`);
        break;
      }
      case 'text':
      default:
        if (inline) pushBlock(out, `${indent}${inline}`);
        else out.push('');
        break;
    }

    const kids = childrenOf[id];
    if (kids && kids.length) walk(kids, byId, childrenOf, depth + 1, out);
  }
}

/** Block-level elements want a blank line before them for clean rendering. */
function pushBlock(out: string[], line: string): void {
  if (out.length && out[out.length - 1] !== '') out.push('');
  out.push(line);
  out.push('');
}

/**
 * Convert a block's stored inline HTML into Markdown inline syntax. Uses the
 * DOM parser so we don't ship a hand-rolled HTML tokenizer; only the handful
 * of marks the editor can produce are translated.
 */
export function htmlToInlineMd(html: string): string {
  if (!html) return '';
  // Fast path: no tags → it's already plain text.
  if (!/[<&]/.test(html)) return html.trim();

  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstChild;
  return root ? serializeNode(root).trim() : '';
}

function serializeNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const el = node as HTMLElement;
  const inner = Array.from(el.childNodes).map(serializeNode).join('');
  const tag = el.tagName.toLowerCase();

  switch (tag) {
    case 'strong':
    case 'b':
      return `**${inner}**`;
    case 'em':
    case 'i':
      return `*${inner}*`;
    case 'code':
      return `\`${inner}\``;
    case 'del':
    case 's':
    case 'strike':
      return `~~${inner}~~`;
    case 'u':
      return inner; // Markdown has no underline; keep the text.
    case 'a': {
      const href = el.getAttribute('href') ?? '';
      return href ? `[${inner}](${href})` : inner;
    }
    case 'br':
      return '\n';
    default:
      return inner;
  }
}
