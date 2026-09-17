export const MAX_AI_TEXT_CHARS = 4_000;
export const MAX_AI_INSTRUCTION_CHARS = 1_500;

export function validateAiCommandInput(input: { text?: string; instruction?: string }): {
  text: string;
  instruction: string;
} {
  const text = (input.text ?? '').trim();
  const instruction = (input.instruction ?? '').trim();

  if (instruction.length > MAX_AI_INSTRUCTION_CHARS) {
    throw new Error(
      `Instruction is too long (${instruction.length} chars). Please shorten it to ${MAX_AI_INSTRUCTION_CHARS} chars or split it into smaller requests.`,
    );
  }

  if (text.length > MAX_AI_TEXT_CHARS) {
    throw new Error(
      `Text is too long (${text.length} chars). Please shorten it to ${MAX_AI_TEXT_CHARS} chars or split it into smaller chunks.`,
    );
  }

  return { text, instruction };
}
