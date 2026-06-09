/**
 * Minimal CommonMark-ish parser used by the "Import Markdown" feature.
 *
 * It is intentionally focused on the subset of Markdown our own exporter
 * (`client/src/features/editor/export/markdown.ts`) emits — headings, lists
 * (bullet / numbered / todo), quotes, fenced code, dividers and images — plus
 * the common inline marks (bold, italic, code, strike, links). Anything it
 * doesn't recognise becomes a plain text/paragraph block, so importing an
 * arbitrary `.md` file degrades gracefully rather than failing.
 *
 * Output is a flat list of blocks with a `depth` (derived from list
 * indentation); the service turns those depths into parent/child block links.
 */

import { BLOCK_TYPES, type BlockType } from '../blocks/blocks.model';

export interface ParsedBlock {
  type: BlockType;
  /** Inline HTML for text-like blocks; raw source for code; alt for images. */
  text: string;
  props: Record<string, unknown>;
  /** Nesting depth (0 = top level), driven by list indentation. */
  depth: number;
}

export interface ParsedDocument {
  title: string;
  icon: string;
  blocks: ParsedBlock[];
}

const BLOCK_TYPE_SET = new Set<string>(BLOCK_TYPES);
const isBlockType = (t: string): t is BlockType => BLOCK_TYPE_SET.has(t);

/** Leading emoji (+ optional following space) at the start of a string. */
const LEADING_EMOJI =
  /^(\p{Extended_Pictographic}(?:\u200d\p{Extended_Pictographic})*\uFE0F?)\s*/u;

/** Number of indentation levels for a list item (2 spaces or 1 tab per level). */
function indentDepth(raw: string): number {
  const match = /^[ \t]*/.exec(raw)?.[0] ?? '';
  let cols = 0;
  for (const ch of match) cols += ch === '\t' ? 2 : 1;
  return Math.floor(cols / 2);
}

export function parseMarkdown(input: string): ParsedDocument {
  // Normalise line endings and strip a UTF-8 BOM if present.
  const lines = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');

  let title = '';
  let icon = '📄';
  let titleTaken = false;

  const blocks: ParsedBlock[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip blank lines (block separation is implicit in our model).
    if (trimmed === '') continue;

    // Fenced code block: ``` or ~~~ optionally with a language.
    const fence = /^([ \t]*)(`{3,}|~{3,})\s*([\w+-]*)\s*$/.exec(line);
    if (fence) {
      const marker = fence[2][0];
      const lang = fence[3] || 'plain';
      const code: string[] = [];
      i++;
      while (i < lines.length) {
        const closing = new RegExp(`^[ \\t]*${marker === '`' ? '`' : '~'}{3,}\\s*$`);
        if (closing.test(lines[i])) break;
        code.push(lines[i]);
        i++;
      }
      blocks.push({ type: 'code', text: code.join('\n'), props: { lang }, depth: 0 });
      continue;
    }

    // Horizontal rule / divider.
    if (/^[ \t]*([-*_])(?:\s*\1){2,}[ \t]*$/.test(line)) {
      blocks.push({ type: 'divider', text: '', props: {}, depth: 0 });
      continue;
    }

    // Standalone image: ![alt](url)
    const img = /^[ \t]*!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)\s*$/.exec(line);
    if (img) {
      blocks.push({ type: 'image', text: img[1] ?? '', props: { url: img[2] }, depth: 0 });
      continue;
    }

    // ATX heading: #, ##, ### (deeper levels collapse to h3).
    const heading = /^[ \t]*(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      let content = heading[2].trim().replace(/\s+#+\s*$/, ''); // drop closing #'s

      // The first top-level "# " line seeds the page title + icon.
      if (level === 1 && !titleTaken) {
        titleTaken = true;
        const m = LEADING_EMOJI.exec(content);
        if (m) {
          icon = m[1];
          content = content.slice(m[0].length);
        }
        title = inlineToText(content).trim();
        continue;
      }

      const type: BlockType = level === 1 ? 'heading' : level === 2 ? 'heading2' : 'heading3';
      blocks.push({ type, text: inlineToHtml(content), props: {}, depth: 0 });
      continue;
    }

    // Todo / bullet list item: "- [ ] ", "- ", "* ", "+ "
    const todo = /^([ \t]*)[-*+]\s+\[([ xX])\]\s+(.*)$/.exec(line);
    if (todo) {
      blocks.push({
        type: 'todo',
        text: inlineToHtml(todo[3]),
        props: { checked: todo[2].toLowerCase() === 'x' },
        depth: indentDepth(todo[1]),
      });
      continue;
    }
    const bullet = /^([ \t]*)[-*+]\s+(.*)$/.exec(line);
    if (bullet) {
      blocks.push({
        type: 'bullet',
        text: inlineToHtml(bullet[2]),
        props: {},
        depth: indentDepth(bullet[1]),
      });
      continue;
    }

    // Numbered list item: "1. ", "2) "
    const numbered = /^([ \t]*)\d+[.)]\s+(.*)$/.exec(line);
    if (numbered) {
      blocks.push({
        type: 'numbered',
        text: inlineToHtml(numbered[2]),
        props: {},
        depth: indentDepth(numbered[1]),
      });
      continue;
    }

    // Block quote / callout: "> text" or "> 💡 text"
    const quote = /^[ \t]*>\s?(.*)$/.exec(line);
    if (quote) {
      let content = quote[1];
      const em = LEADING_EMOJI.exec(content);
      if (em) {
        blocks.push({
          type: 'callout',
          text: inlineToHtml(content.slice(em[0].length)),
          props: { icon: em[1] },
          depth: 0,
        });
      } else {
        blocks.push({ type: 'quote', text: inlineToHtml(content), props: {}, depth: 0 });
      }
      continue;
    }

    // Anything else → a plain paragraph (text) block.
    blocks.push({ type: 'text', text: inlineToHtml(trimmed), props: {}, depth: 0 });
  }

  if (!title) title = 'Imported page';
  // Drop any block whose type somehow isn't supported (defensive).
  const safe = blocks.filter((b) => isBlockType(b.type));
  return { title, icon, blocks: safe };
}

/* ------------------------------------------------------------------ */
/* Inline Markdown → HTML                                              */
/* ------------------------------------------------------------------ */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Convert inline Markdown to the small HTML vocabulary the editor stores:
 * <strong>, <em>, <code>, <del>, <a>. Code spans are extracted first so their
 * contents are never treated as further markup.
 */
export function inlineToHtml(src: string): string {
  if (!src) return '';

  // 1. Protect inline code spans with placeholders.
  const codes: string[] = [];
  let text = src.replace(/`([^`]+)`/g, (_m, code: string) => {
    codes.push(`<code>${escapeHtml(code)}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });

  // 2. Protect links: [label](href)
  const links: string[] = [];
  text = text.replace(
    /\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g,
    (_m, label: string, href: string) => {
      links.push(
        `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(
          label,
        )}</a>`,
      );
      return `\u0001${links.length - 1}\u0001`;
    },
  );

  // 3. Escape the remaining raw text, then apply emphasis marks.
  text = escapeHtml(text);
  text = text
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    .replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/(^|[^_])_([^_\s][^_]*?)_(?!_)/g, '$1<em>$2</em>');

  // 4. Restore links + code spans.
  text = text.replace(/\u0001(\d+)\u0001/g, (_m, n: string) => links[Number(n)]);
  text = text.replace(/\u0000(\d+)\u0000/g, (_m, n: string) => codes[Number(n)]);

  return text;
}

/** Strip inline markup down to plain text (used for the page title). */
export function inlineToText(src: string): string {
  return src
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1');
}
