import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_AI_INSTRUCTION_CHARS, MAX_AI_TEXT_CHARS, validateAiCommandInput } from './ai.input';

test('accepts short instruction and text', () => {
  const result = validateAiCommandInput({
    instruction: 'Write a short summary',
    text: 'A quick note',
  });

  assert.equal(result.instruction, 'Write a short summary');
  assert.equal(result.text, 'A quick note');
});

test('rejects instruction that exceeds the safe limit', () => {
  const longInstruction = 'x'.repeat(MAX_AI_INSTRUCTION_CHARS + 1);
  assert.throws(
    () => validateAiCommandInput({ instruction: longInstruction }),
    /Instruction is too long/,
  );
});

test('rejects text that exceeds the safe limit', () => {
  const longText = 'x'.repeat(MAX_AI_TEXT_CHARS + 1);
  assert.throws(
    () => validateAiCommandInput({ text: longText }),
    /Text is too long/,
  );
});
