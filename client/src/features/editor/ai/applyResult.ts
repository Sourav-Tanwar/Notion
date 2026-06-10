/**
 * Shared helpers for materialising AI output into the document.
 *
 * The model returns Markdown. `block.text` in the store is an HTML string, so
 * we parse the Markdown into real block descriptors (headings, lists, quotes,
 * code) and convert inline syntax (`**bold**`, `*italic*`, `` `code` ``,
 * `[link](url)`) into HTML. Without this, raw `##`/`**` leak into the page as
 * literal characters.
 */

import { useBlocksStore } from '@/stores/blocks.store';
import type { BlockType, ID } from '@/types/domain';

interface ParsedBlock {
  type: BlockType;
  /** HTML for text-bearing blocks; plain source for code blocks. */
  text: string;
  props?: Record<string, unknown>;
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Convert inline Markdown to HTML. Input is escaped first to stay XSS-safe. */
export function inlineMarkdownToHtml(raw: string): string {
  let s = escapeHtml(raw);
  // Inline code first so its contents aren't re-processed for bold/italic.
  s = s.replace(/`([^`]+)`/g, (_m, code) => `<code>${code}</code>`);
  // Links [text](url) — only http(s)/mailto to avoid javascript: URIs.
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g, (_m, text, url) => {
    return `<a href="${url}">${text}</a>`;
  });
  // Bold (** or __) before italic so the single-char rule doesn't eat them.
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  // Italic (* or _). Require non-space neighbours to avoid matching stray *.
  s = s.replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<em>$2</em>');
  s = s.replace(/(^|[^_])_([^_\s][^_]*?)_(?!_)/g, '$1<em>$2</em>');
  // Strikethrough ~~text~~
  s = s.replace(/~~([^~]+)~~/g, '<s>$1</s>');
  return s;
}

/** A Markdown table separator row, e.g. `| --- | :--: |`. */
const isTableSeparator = (line: string): boolean => {
  const t = line.trim();
  if (!t.includes('|') || !t.includes('-')) return false;
  return splitTableCells(t).every((c) => /^:?-+:?$/.test(c));
};

/** A line that looks like a table row (has a pipe with content). */
const isTableRow = (line: string): boolean => /\|/.test(line.trim());

/** Split a `| a | b |` row into trimmed cells, dropping the outer pipes. */
const splitTableCells = (line: string): string[] => {
  let t = line.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|')) t = t.slice(0, -1);
  return t.split('|').map((c) => c.trim());
};

/** Split AI Markdown into block descriptors. */
export function parseAiText(raw: string): ParsedBlock[] {
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const out: ParsedBlock[] = [];

  let inFence = false;
  let fenceLang = 'plain';
  let fenceBuf: string[] = [];

  const flushFence = () => {
    out.push({ type: 'code', text: fenceBuf.join('\n'), props: { lang: fenceLang } });
    fenceBuf = [];
    fenceLang = 'plain';
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = line.match(/^\s*```([a-zA-Z0-9+#-]*)\s*$/);
    if (fence) {
      if (inFence) {
        inFence = false;
        flushFence();
      } else {
        inFence = true;
        fenceLang = fence[1] || 'plain';
      }
      continue;
    }
    if (inFence) {
      fenceBuf.push(line);
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) continue;

    // Table: a header row followed by a `| --- |` separator. Map it into a real
    // editable `table` block — `props.rows` is row-major [header, ...data].
    if (isTableRow(trimmed) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const headers = splitTableCells(trimmed);
      const rows: string[][] = [headers];
      i += 2; // skip header + separator; data rows follow
      for (; i < lines.length; i++) {
        const rowText = lines[i].trim();
        if (!rowText || !isTableRow(rowText)) {
          i--; // let the outer loop re-handle this non-row line
          break;
        }
        const cells = splitTableCells(rowText);
        // Normalise ragged rows to the header width.
        const row = Array.from({ length: headers.length }, (_, k) => cells[k] ?? '');
        rows.push(row);
      }
      out.push({ type: 'table', text: '', props: { rows, header: true } });
      continue;
    }

    // Headings: #, ##, ### (4+ collapse to h3). Strip the marker.
    const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      const type: BlockType = level === 1 ? 'heading' : level === 2 ? 'heading2' : 'heading3';
      out.push({ type, text: inlineMarkdownToHtml(heading[2]) });
      continue;
    }

    // Callout: GitHub-style admonition `> [!NOTE] text`. Check before plain quote.
    const callout = trimmed.match(/^>\s*\[!(\w+)\]\s*(.*)$/);
    if (callout) {
      const icons: Record<string, string> = {
        NOTE: '📝',
        TIP: '💡',
        INFO: 'ℹ️',
        IMPORTANT: '❗',
        WARNING: '⚠️',
        CAUTION: '🚧',
      };
      out.push({
        type: 'callout',
        text: inlineMarkdownToHtml(callout[2]),
        props: { icon: icons[callout[1].toUpperCase()] ?? '💡' },
      });
      continue;
    }

    // Blockquote
    const quote = trimmed.match(/^>\s+(.*)$/);
    if (quote) {
      out.push({ type: 'quote', text: inlineMarkdownToHtml(quote[1]) });
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      out.push({ type: 'divider', text: '' });
      continue;
    }

    // To-do checkbox: `- [ ] task` / `- [x] done`. Check before plain bullets.
    const todo = trimmed.match(/^[-*]\s+\[([ xX])\]\s+(.*)$/);
    if (todo) {
      out.push({
        type: 'todo',
        text: inlineMarkdownToHtml(todo[2]),
        props: { checked: /x/i.test(todo[1]) },
      });
      continue;
    }

    // Bulleted list
    const bullet = trimmed.match(/^[-*•]\s+(.*)$/);
    if (bullet) {
      out.push({ type: 'bullet', text: inlineMarkdownToHtml(bullet[1]) });
      continue;
    }

    // Numbered list
    const numbered = trimmed.match(/^\d+[.)]\s+(.*)$/);
    if (numbered) {
      out.push({ type: 'numbered', text: inlineMarkdownToHtml(numbered[1]) });
      continue;
    }

    // Plain paragraph
    out.push({ type: 'text', text: inlineMarkdownToHtml(trimmed) });
  }

  if (inFence && fenceBuf.length) flushFence(); // unterminated fence
  if (!out.length) out.push({ type: 'text', text: inlineMarkdownToHtml(raw.trim()) });
  return out;
}

/**
 * Insert AI text as new block(s) immediately after `afterId`. Returns the id of
 * the last inserted block so callers can focus it.
 */
export function insertAiBlocksAfter(afterId: ID, raw: string): ID {
  const store = useBlocksStore.getState();
  const parsed = parseAiText(raw);
  let prevId = afterId;
  // Collapse the whole insertion into ONE undo step so a single Ctrl+Z removes
  // the entire AI output (and the store can delete the new blocks server-side).
  store.runBatch(() => {
    for (const node of parsed) {
      const id = store.insertAfter(prevId, node.type, node.props);
      if (node.text) useBlocksStore.getState().setText(id, node.text);
      prevId = id;
    }
  });
  return prevId;
}
