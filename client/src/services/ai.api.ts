/**
 * AI client — talks to the server's `/api/ai/*` endpoints.
 *
 * Streaming uses fetch + ReadableStream (not EventSource) so we can send the
 * Bearer access token. The server emits SSE frames: `data: {"t":"…"}` for
 * token deltas, `data: {"done":true}` at the end, `data: {"error":"…"}` on
 * failure.
 */

import { tokens, tryRefresh, ApiError } from './http';

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

export interface AiCommandBody {
  action: AiAction;
  text?: string;
  instruction?: string;
  tone?: string;
  language?: string;
}

let cachedEnabled: boolean | null = null;

/** Whether the server has a Groq key configured. Cached after first check. */
export async function aiStatus(): Promise<boolean> {
  if (cachedEnabled !== null) return cachedEnabled;
  try {
    const res = await authedFetch('/api/ai/status', { method: 'GET' });
    const data = (await res.json()) as { enabled?: boolean };
    cachedEnabled = Boolean(data.enabled);
  } catch {
    cachedEnabled = false;
  }
  return cachedEnabled;
}

/**
 * Stream an AI command. Calls `onToken` for each delta. Resolves with the full
 * text when the stream ends. Reject/abort via the optional `signal`.
 */
export async function streamAiCommand(
  body: AiCommandBody,
  onToken: (full: string, delta: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const res = await authedFetch('/api/ai/command', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok || !res.body) {
    throw new ApiError(res.status, await safeError(res));
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';
    for (const frame of frames) {
      const line = frame.split('\n').find((l) => l.startsWith('data:'));
      if (!line) continue;
      const json = safeJson(line.slice(5).trim());
      if (!json) continue;
      if (json.error) throw new ApiError(500, String(json.error));
      if (json.done) return full;
      if (typeof json.t === 'string') {
        full += json.t;
        onToken(full, json.t);
      }
    }
  }
  return full;
}

/** One-shot autocomplete continuation. Returns '' when nothing sensible. */
export async function fetchAiComplete(context: string, signal?: AbortSignal): Promise<string> {
  const res = await authedFetch('/api/ai/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ context }),
    signal,
  });
  if (!res.ok) return '';
  const data = (await res.json()) as { suggestion?: string };
  return data.suggestion ?? '';
}

/** fetch wrapper that attaches the Bearer token and retries once on 401. */
async function authedFetch(path: string, init: RequestInit, retried = false): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = tokens.get();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(path, { ...init, headers, credentials: 'include' });
  if (res.status === 401 && !retried) {
    const ok = await tryRefresh();
    if (ok) return authedFetch(path, init, true);
  }
  return res;
}

function safeJson(s: string): { t?: string; done?: boolean; error?: string } | null {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

async function safeError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    return data.error ?? res.statusText;
  } catch {
    return res.statusText;
  }
}
