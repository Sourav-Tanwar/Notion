import type { BlockType } from '@/types/domain';
import { matchMarkdown } from './registry/blockRegistry';

/**
 * Markdown shortcut engine.
 *
 * Strategy:
 *  - Listen to the block's current plain-text content.
 *  - After a SPACE has been typed at the start of an empty-ish line, test
 *    against registered patterns.
 *  - If matched, the caller (BlockNode) converts the block's type and trims
 *    the trigger from the text.
 *
 * Triple-backtick code block uses Enter as its trigger instead of space.
 */

export interface MarkdownHit {
  newType: BlockType;
  newText: string;
  props: Record<string, unknown>;
}

export function tryMarkdown(plainText: string): MarkdownHit | null {
  const hit = matchMarkdown(plainText);
  if (!hit) return null;
  const newText = hit.spec.markdown?.extractText?.(hit.match) ?? '';
  const props = hit.spec.markdown?.propsFromMatch?.(hit.match) ?? hit.spec.defaultProps ?? {};
  return { newType: hit.spec.type as BlockType, newText, props };
}
