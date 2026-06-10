/**
 * Prompt construction for the AI module.
 *
 * Every "Ask AI" action maps to a system prompt that constrains the model to
 * return ONLY the transformed text — no preamble, no "Sure, here is…", no
 * markdown fences. The editor inserts the raw output straight into a block,
 * so chatty wrappers would leak into the document.
 */

export type AiAction =
  | 'summarize'
  | 'continue'
  | 'improve'
  | 'tone'
  | 'translate'
  | 'brainstorm'
  | 'shorter'
  | 'longer'
  | 'custom';

export interface AiCommandInput {
  action: AiAction;
  /** The user's selected text / source content the action operates on. */
  text?: string;
  /** Free-form instruction for `custom`, or the `/ai` block prompt. */
  instruction?: string;
  /** Target tone for `tone` (e.g. "professional", "friendly", "concise"). */
  tone?: string;
  /** Target language for `translate` (e.g. "Spanish", "Hindi"). */
  language?: string;
}

const BASE_RULES = [
  'You are an expert writing assistant embedded in a document editor.',
  'Return ONLY the requested content with no preamble, explanation, or sign-off.',
  'Never wrap the entire response in a markdown code fence.',
  'Use clean Markdown for structure when it helps: "# ", "## ", "### " for headings',
  '(always put a space after the # marks), "- " for bullets, "1. " for numbered lists,',
  '"> " for quotes, **bold** and *italic* for emphasis. Put each heading, list item,',
  'and paragraph on its own line, with a blank line between paragraphs.',
  'For tabular data, use GitHub-style Markdown tables (a header row, a "| --- |"',
  'separator row, then data rows) — the editor renders these as real editable grids.',
  'Match the language of the source text unless told otherwise.',
  'Preserve meaning; never invent facts that are not implied by the input.',
].join(' ');

/** Build the system + user messages for a one-shot command action. */
export function buildCommandMessages(
  input: AiCommandInput,
): { system: string; user: string } {
  const { action, text = '', instruction = '', tone = '', language = '' } = input;
  const source = text.trim();

  switch (action) {
    case 'summarize':
      return {
        system: `${BASE_RULES} Summarize the text into a few tight bullet points or a short paragraph, keeping only the key ideas.`,
        user: source,
      };
    case 'continue':
      return {
        system: `${BASE_RULES} Continue writing naturally from where the text stops. Output only the continuation, not a repeat of the existing text.`,
        user: source,
      };
    case 'improve':
      return {
        system: `${BASE_RULES} Rewrite the text to improve clarity, grammar, and flow while preserving the original meaning and length.`,
        user: source,
      };
    case 'tone':
      return {
        system: `${BASE_RULES} Rewrite the text in a ${tone || 'professional'} tone. Keep the meaning intact.`,
        user: source,
      };
    case 'translate':
      return {
        system: `${BASE_RULES} Translate the text into ${language || 'English'}. Output only the translation.`,
        user: source,
      };
    case 'brainstorm':
      return {
        system: `${BASE_RULES} Brainstorm a useful list of ideas for the topic. Return a concise bulleted list.`,
        user: source || instruction,
      };
    case 'shorter':
      return {
        system: `${BASE_RULES} Make the text shorter and more concise without losing essential meaning.`,
        user: source,
      };
    case 'longer':
      return {
        system: `${BASE_RULES} Expand the text with more detail and explanation while staying on topic.`,
        user: source,
      };
    case 'custom':
    default:
      return {
        system: `${BASE_RULES} Follow the user's instruction precisely.`,
        user: source
          ? `Instruction: ${instruction}\n\nText:\n${source}`
          : instruction,
      };
  }
}

/**
 * Per-action sampling temperature. Transforms (rewrite/translate/summarize)
 * stay low for faithful, consistent output; idea-generation runs warmer.
 */
export function temperatureFor(action: AiAction): number {
  switch (action) {
    case 'brainstorm':
      return 0.8;
    case 'continue':
    case 'custom':
      return 0.6;
    default:
      // improve / summarize / tone / translate / shorter / longer
      return 0.3;
  }
}

/**
 * Autocomplete: predict a short continuation of the text the user is typing.
 * Kept deliberately terse — a sentence or clause, not a paragraph — so the
 * ghost text stays unobtrusive and cheap.
 */
export function buildAutocompleteMessages(context: string): {
  system: string;
  user: string;
} {
  return {
    system:
      'You are an inline autocomplete engine. Given the text the user has typed so far, ' +
      'predict the most likely short continuation (at most one sentence or ~12 words). ' +
      'Return ONLY the continuation text that should appear after the cursor — no quotes, ' +
      'no explanation, no leading space unless the text clearly needs one. If no sensible ' +
      'continuation exists, return an empty string.',
    user: context,
  };
}
