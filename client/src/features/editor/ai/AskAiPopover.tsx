/**
 * AskAiPopover — the "Ask AI" surface launched from the floating toolbar when
 * text is selected. Walks the user through: pick action → (optional input) →
 * stream result → apply (Replace / Insert below) or retry / discard.
 */

import { useEffect, useRef, useState } from 'react';
import { streamAiCommand, type AiAction, type AiCommandBody } from '@/services/ai.api';
import { replaceRangeWithText } from '../collab/marks';
import { insertAiBlocksAfter } from './applyResult';
import { SELECTION_ACTIONS, type AiActionDef } from './aiActions';
import { cn } from '@/lib/cn';

interface SelectionCtx {
  blockId: string;
  from: number;
  to: number;
  text: string;
}

interface Props {
  selection: SelectionCtx;
  onClose: () => void;
}

type Phase = 'menu' | 'input' | 'streaming' | 'done' | 'error';

export function AskAiPopover({ selection, onClose }: Props): JSX.Element {
  const [phase, setPhase] = useState<Phase>('menu');
  const [action, setAction] = useState<AiActionDef | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Dismiss on outside click / Escape.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
      abortRef.current?.abort();
    };
  }, [onClose]);

  const run = (def: AiActionDef, value: string) => {
    setAction(def);
    setResult('');
    setError('');
    setPhase('streaming');
    const body: AiCommandBody = { action: def.id as AiAction, text: selection.text };
    if (def.input?.key === 'tone') body.tone = value;
    if (def.input?.key === 'language') body.language = value;
    if (def.input?.key === 'instruction') body.instruction = value;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    streamAiCommand(body, (full) => setResult(full), ctrl.signal)
      .then((full) => {
        setResult(full);
        setPhase('done');
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        setError(err?.message === 'TooManyRequests' ? 'Rate limit reached — wait a moment.' : 'AI request failed.');
        setPhase('error');
      });
  };

  const pick = (def: AiActionDef) => {
    if (def.input) {
      setAction(def);
      setInputValue('');
      setPhase('input');
    } else {
      run(def, '');
    }
  };

  const onReplace = () => {
    replaceRangeWithText(selection.blockId, selection.from, selection.to, result);
    onClose();
  };
  const onInsertBelow = () => {
    insertAiBlocksAfter(selection.blockId, result);
    onClose();
  };

  return (
    <div
      ref={ref}
      onMouseDown={(e) => e.stopPropagation()}
      className="absolute left-0 top-full z-[90] mt-2 w-96 max-w-[90vw] rounded-lg border border-border bg-surface shadow-2xl"
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-sm font-medium text-zinc-200">
        <span>✨ Ask AI</span>
        {action && phase !== 'menu' && (
          <span className="text-xs font-normal text-zinc-500">· {action.label.replace('…', '')}</span>
        )}
      </div>

      {phase === 'menu' && (
        <ul className="max-h-80 overflow-auto py-1">
          {SELECTION_ACTIONS.map((def) => (
            <li key={def.id}>
              <button
                type="button"
                onClick={() => pick(def)}
                className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800"
              >
                <span className="w-5 text-center">{def.icon}</span>
                <span>{def.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {phase === 'input' && action?.input && (
        <form
          className="p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (inputValue.trim()) run(action, inputValue.trim());
          }}
        >
          <input
            autoFocus
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={action.input.placeholder}
            className="w-full rounded border border-border bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500"
          />
          <div className="mt-2 flex justify-end gap-2">
            <BtnGhost onClick={() => setPhase('menu')}>Back</BtnGhost>
            <BtnPrimary type="submit" disabled={!inputValue.trim()}>Generate</BtnPrimary>
          </div>
        </form>
      )}

      {(phase === 'streaming' || phase === 'done') && (
        <div className="p-3">
          <div className="max-h-64 overflow-auto whitespace-pre-wrap rounded border border-border bg-zinc-900/60 p-3 text-sm text-zinc-100">
            {result || <span className="text-zinc-500">Generating…</span>}
            {phase === 'streaming' && <span className="ml-0.5 animate-pulse">▋</span>}
          </div>
          <div className="mt-2 flex flex-wrap justify-end gap-2">
            {phase === 'done' && (
              <>
                <BtnGhost onClick={() => action && run(action, inputValue)}>Try again</BtnGhost>
                <BtnGhost onClick={onInsertBelow}>Insert below</BtnGhost>
                <BtnPrimary onClick={onReplace}>Replace</BtnPrimary>
              </>
            )}
            {phase === 'streaming' && (
              <BtnGhost onClick={() => { abortRef.current?.abort(); setPhase('done'); }}>Stop</BtnGhost>
            )}
          </div>
        </div>
      )}

      {phase === 'error' && (
        <div className="p-3 text-sm">
          <p className="text-red-400">{error}</p>
          <div className="mt-2 flex justify-end gap-2">
            <BtnGhost onClick={() => setPhase('menu')}>Back</BtnGhost>
            {action && <BtnPrimary onClick={() => run(action, inputValue)}>Retry</BtnPrimary>}
          </div>
        </div>
      )}
    </div>
  );
}

function BtnPrimary({
  children,
  onClick,
  type = 'button',
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
}): JSX.Element {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      {children}
    </button>
  );
}

function BtnGhost({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick?: () => void;
}): JSX.Element {
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
