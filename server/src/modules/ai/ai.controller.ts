import type { Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler';
import type { AuthedRequest } from '../../middleware/auth.middleware';
import { env, aiEnabled } from '../../config/env';
import { streamChat, complete } from './ai.service';
import { buildCommandMessages, buildAutocompleteMessages, temperatureFor, type AiAction } from './ai.prompts';

const ACTIONS = [
  'summarize',
  'continue',
  'improve',
  'tone',
  'translate',
  'brainstorm',
  'shorter',
  'longer',
  'custom',
] as const;

// Cap inputs so a runaway selection can't blow the token budget / context.
const MAX_TEXT = 8_000;
const MAX_CONTEXT = 2_000;

export const commandSchema = z.object({
  action: z.enum(ACTIONS),
  text: z.string().max(MAX_TEXT).optional(),
  instruction: z.string().max(2_000).optional(),
  tone: z.string().max(60).optional(),
  language: z.string().max(60).optional(),
});

export const completeSchema = z.object({
  context: z.string().max(MAX_CONTEXT),
});

/** GET /api/ai/status — lets the SPA hide AI affordances when no key is set. */
export const status = (_req: AuthedRequest, res: Response): void => {
  res.json({ enabled: aiEnabled });
};

/**
 * POST /api/ai/command — streams a transformed-text response over SSE.
 * We hand-roll SSE (rather than EventSource) because the browser reads it via
 * fetch + ReadableStream, which lets us send the Bearer auth header.
 */
export const command = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const body = req.body as z.infer<typeof commandSchema>;
  const { system, user } = buildCommandMessages({
    action: body.action as AiAction,
    text: body.text,
    instruction: body.instruction,
    tone: body.tone,
    language: body.language,
  });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable proxy buffering (nginx)
  res.flushHeaders?.();

  const send = (obj: unknown) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  try {
    for await (const delta of streamChat({
      model: env.groqModel,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: temperatureFor(body.action as AiAction),
      signal: abortFromReq(req),
    })) {
      send({ t: delta });
    }
    send({ done: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AIError';
    send({ error: message });
  } finally {
    res.end();
  }
});

/** POST /api/ai/complete — short, non-streaming continuation for ghost text. */
export const completeText = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const { context } = req.body as z.infer<typeof completeSchema>;
  if (!context.trim()) {
    res.json({ suggestion: '' });
    return;
  }
  const { system, user } = buildAutocompleteMessages(context);
  const suggestion = await complete({
    model: env.groqAutocompleteModel,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    maxTokens: 48,
    signal: abortFromReq(req),
  });
  res.json({ suggestion });
});

/** Bridge Express's `close` event to an AbortSignal so we stop the upstream
 *  Groq call the moment the client disconnects. */
function abortFromReq(req: AuthedRequest): AbortSignal {
  const controller = new AbortController();
  req.on('close', () => controller.abort());
  return controller.signal;
}
