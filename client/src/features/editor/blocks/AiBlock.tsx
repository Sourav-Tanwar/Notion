/**
 * AI generation block (`/ai`).
 *
 * A transient prompt block: type an instruction, generate, then either keep
 * the result (it materialises into real text/list blocks below and this block
 * removes itself) or discard. Nothing AI-specific is persisted — the output
 * becomes ordinary editor content.
 */

import { useRef, useState } from 'react';
import type { RenderProps } from '../registry/blockRegistry';
import { streamAiCommand } from '@/services/ai.api';
import { useBlocksStore } from '@/stores/blocks.store';
import { useAiSettingsStore } from '@/stores/ai.store';
import { insertAiBlocksAfter } from '../ai/applyResult';
import { cn } from '@/lib/cn';

type Phase = 'prompt' | 'streaming' | 'done' | 'error';

export function AiRender({ block }: RenderProps): JSX.Element {
  const aiEnabled = useAiSettingsStore((s) => s.enabled);
  const removeBlock = useBlocksStore((s) => s.removeBlock);
  const [phase, setPhase] = useState<Phase>('prompt');
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const generate = () => {
    const instruction = prompt.trim();
    if (!instruction) return;
    setResult('');
    setError('');
    setPhase('streaming');
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    streamAiCommand({ action: 'custom', instruction }, (full) => setResult(full), ctrl.signal)
      .then((full) => {
        setResult(full);
        setPhase('done');
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        setError(
          err?.message === 'TooManyRequests'
            ? 'Rate limit reached — wait a moment.'
            : 'AI request failed.',
        );
        setPhase('error');
      });
  };

  const keep = () => {
    insertAiBlocksAfter(block.id, result);
    removeBlock(block.id);
  };

  const discard = () => removeBlock(block.id);

  if (!aiEnabled) {
    return (
      <div className="rounded-md border border-border bg-zinc-900/40 p-3 text-sm text-zinc-400">
        AI is not configured on this server.
        <button type="button" onClick={discard} className="ml-2 text-zinc-300 underline">
          Remove
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border bg-zinc-900/40 p-3" contentEditable={false}>
      {phase === 'prompt' && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm text-zinc-300">
            <span>✨</span>
            <input
              autoFocus
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  generate();
                } else if (e.key === 'Escape' || (e.key === 'Backspace' && !prompt)) {
                  e.preventDefault();
                  discard();
                }
              }}
              placeholder="Ask AI to write anything…  (e.g. “Draft a project kickoff email”)"
              className="flex-1 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
            />
            <button
              type="button"
              onClick={generate}
              disabled={!prompt.trim()}
              className={cn(
                'rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-500',
                !prompt.trim() && 'cursor-not-allowed opacity-50',
              )}
            >
              Generate
            </button>
          </div>
        </div>
      )}

      {(phase === 'streaming' || phase === 'done') && (
        <div className="flex flex-col gap-2">
          <div className="max-h-72 overflow-auto whitespace-pre-wrap rounded border border-border bg-zinc-900/60 p-3 text-sm text-zinc-100">
            {result || <span className="text-zinc-500">Generating…</span>}
            {phase === 'streaming' && <span className="ml-0.5 animate-pulse">▋</span>}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {phase === 'streaming' ? (
              <Ghost onClick={() => { abortRef.current?.abort(); setPhase('done'); }}>Stop</Ghost>
            ) : (
              <>
                <Ghost onClick={discard}>Discard</Ghost>
                <Ghost onClick={() => setPhase('prompt')}>Try again</Ghost>
                <button
                  type="button"
                  onClick={keep}
                  className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500"
                >
                  Keep
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {phase === 'error' && (
        <div className="text-sm">
          <p className="text-red-400">{error}</p>
          <div className="mt-2 flex justify-end gap-2">
            <Ghost onClick={discard}>Discard</Ghost>
            <button
              type="button"
              onClick={generate}
              className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500"
            >
              Retry
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Ghost({ children, onClick }: { children: React.ReactNode; onClick: () => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
    >
      {children}
    </button>
  );
}
