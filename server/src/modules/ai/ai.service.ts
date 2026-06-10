/**
 * AI service — provider-agnostic façade over a single hosted backend.
 *
 * Phase 13 ships the Groq adapter only (free, fast, OpenAI-compatible). The
 * shape here — `streamChat` (async generator of text deltas) + `complete`
 * (one-shot string) — is deliberately provider-neutral so a future Gemini /
 * Ollama / OpenAI adapter can slot in behind the same interface without the
 * controllers changing.
 *
 * The API key never leaves this process. Controllers call these functions;
 * the SPA only ever sees streamed text.
 */

import { env } from '../../config/env';
import { HttpError } from '../../utils/HttpError';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatOptions {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

const GROQ_TIMEOUT_MS = 30_000;

/**
 * Stream chat completions as plain-text deltas. Yields each token chunk as it
 * arrives so the controller can forward it over SSE. Throws HttpError on
 * upstream failure so the standard error middleware can format the response.
 */
export async function* streamChat(opts: ChatOptions): AsyncGenerator<string> {
  if (!env.groqApiKey) throw new HttpError(503, 'AIDisabled');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GROQ_TIMEOUT_MS);
  // Abort the upstream call if the client disconnects mid-stream.
  opts.signal?.addEventListener('abort', () => controller.abort(), { once: true });

  let res: Response;
  try {
    res = await fetch(`${env.groqBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.groqApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        temperature: opts.temperature ?? 0.7,
        max_tokens: opts.maxTokens ?? 1024,
        stream: true,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (controller.signal.aborted) return; // client gone / timeout — stop quietly
    throw new HttpError(502, 'AIUpstreamUnreachable');
  }

  if (!res.ok || !res.body) {
    clearTimeout(timer);
    const detail = await res.text().catch(() => '');
    throw new HttpError(res.status === 429 ? 429 : 502, 'AIUpstreamError', detail.slice(0, 500));
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // SSE frames are separated by double newlines; each `data:` line holds a
      // JSON chunk (or the literal `[DONE]` sentinel).
      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';
      for (const frame of frames) {
        const line = frame.split('\n').find((l) => l.startsWith('data:'));
        if (!line) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') return;
        try {
          const json = JSON.parse(data) as {
            choices?: { delta?: { content?: string } }[];
          };
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {
          // Ignore malformed keep-alive frames.
        }
      }
    }
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}

/** One-shot, non-streaming completion. Used by autocomplete. */
export async function complete(opts: Omit<ChatOptions, 'signal'> & { signal?: AbortSignal }): Promise<string> {
  if (!env.groqApiKey) throw new HttpError(503, 'AIDisabled');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GROQ_TIMEOUT_MS);
  opts.signal?.addEventListener('abort', () => controller.abort(), { once: true });

  try {
    const res = await fetch(`${env.groqBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.groqApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        temperature: opts.temperature ?? 0.4,
        max_tokens: opts.maxTokens ?? 48,
        stream: false,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new HttpError(res.status === 429 ? 429 : 502, 'AIUpstreamError', detail.slice(0, 500));
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return json.choices?.[0]?.message?.content?.trim() ?? '';
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if (controller.signal.aborted) return '';
    throw new HttpError(502, 'AIUpstreamUnreachable');
  } finally {
    clearTimeout(timer);
  }
}
