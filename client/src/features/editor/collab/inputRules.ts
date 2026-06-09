import { InputRule, inputRules } from 'prosemirror-inputrules';
import type { MarkType } from 'prosemirror-model';
import { schema } from './pmSchema';

/**
 * Inline markdown shortcuts.
 *
 * As you type the *closing* delimiter, the wrapped text converts to the
 * matching mark and the delimiters are removed — e.g. `**bold**`, `*italic*`,
 * `` `code` ``, `~~strike~~`. This mirrors Notion's inline behaviour and
 * complements the block-level markdown shortcuts (`#`, `-`, `>`…) handled by
 * the registry.
 *
 * Positioning is anchored from the match END (the cursor), not the start, so
 * single-delimiter rules can keep a non-capturing "guard" char in front
 * (needed to stop `*italic*` from firing while you're mid-typing `**bold**`)
 * without that guard char being swallowed by the replacement.
 */
function markRule(
  regexp: RegExp,
  markType: MarkType,
  delimLen: number,
  options: { stripMarks?: boolean } = {},
): InputRule {
  return new InputRule(regexp, (state, match, _start, end) => {
    const inner = match[match.length - 1];
    if (!inner) return null;
    const from = end - inner.length - delimLen * 2;
    if (from < 0) return null;

    const tr = state.tr;
    tr.insertText(inner, from, end);
    const markEnd = from + inner.length;
    if (options.stripMarks) tr.removeMark(from, markEnd, null);
    tr.addMark(from, markEnd, markType.create());
    // Don't let the just-applied mark bleed into following typed text.
    tr.removeStoredMark(markType);
    return tr;
  });
}

export function markdownInputRules() {
  const rules: InputRule[] = [
    // **bold** / __bold__ (inner can't start/end with whitespace)
    markRule(/\*\*([^*\s][^*]*?[^*\s]|[^*\s])\*\*$/, schema.marks.strong, 2),
    markRule(/__([^_\s][^_]*?[^_\s]|[^_\s])__$/, schema.marks.strong, 2),
    // *italic* / _italic_ — guard char in front prevents firing inside **bold**
    markRule(/(?:^|[^*])\*([^*\s][^*]*?[^*\s]|[^*\s])\*$/, schema.marks.em, 1),
    markRule(/(?:^|[^_])_([^_\s][^_]*?[^_\s]|[^_\s])_$/, schema.marks.em, 1),
    // ~~strike~~
    markRule(/~~([^~\s][^~]*?[^~\s]|[^~\s])~~$/, schema.marks.strike, 2),
    // `code` (exclusive: strip any inner marks)
    markRule(/`([^`\s][^`]*?[^`\s]|[^`\s])`$/, schema.marks.code, 1, { stripMarks: true }),
  ];
  return inputRules({ rules });
}
