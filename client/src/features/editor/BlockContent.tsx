import { forwardRef, memo, useEffect, useRef } from 'react';
import type { BlockType } from '@/types/domain';
import { cn } from '@/lib/cn';

interface Props {
  type: BlockType;
  text: string;
  checked?: boolean;
  index?: number; // for numbered lists
  onInput: (text: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  onToggleCheck?: () => void;
}

/**
 * A single editable block surface. Uses contentEditable so the browser handles
 * caret + IME natively; we only push text on input. We do NOT update innerText
 * from React after mount to avoid clobbering the caret (the parent controls
 * remounts via `key` if it ever needs to reset).
 */
export const BlockContent = memo(
  forwardRef<HTMLDivElement, Props>(function BlockContent(
    { type, text, checked, index, onInput, onKeyDown, onToggleCheck },
    ref,
  ) {
    const innerRef = useRef<HTMLDivElement | null>(null);
    const setRefs = (el: HTMLDivElement | null) => {
      innerRef.current = el;
      if (typeof ref === 'function') ref(el);
      else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = el;
    };

    // Sync external `text` changes into the DOM only when they actually
    // differ from what's already shown. Skipping the write on every render
    // is what keeps the caret stable while the user is typing.
    useEffect(() => {
      const el = innerRef.current;
      if (!el) return;
      if (el.innerText !== text) {
        el.innerText = text;
      }
    }, [text]);

    const classes = cn(
      'flex-1 min-w-0 py-1 leading-snug',
      type === 'heading' && 'text-2xl font-semibold',
      type === 'code' && 'font-mono text-sm bg-zinc-100 dark:bg-zinc-900/60 rounded px-3 py-2',
      type === 'todo' && checked && 'line-through text-zinc-500',
    );

    const placeholder =
      type === 'heading'
        ? 'Heading'
        : type === 'code'
        ? 'Code'
        : type === 'todo'
        ? 'To-do'
        : "Type '/' for commands";

    return (
      <div className="group flex items-start gap-2">
        {type === 'todo' && (
          <input
            type="checkbox"
            checked={!!checked}
            onChange={onToggleCheck}
            className="mt-2 h-4 w-4 accent-accent"
            aria-label="toggle"
          />
        )}
        {type === 'bullet' && <span className="mt-1 select-none text-zinc-400">•</span>}
        {type === 'numbered' && (
          <span className="mt-1 select-none text-zinc-400 tabular-nums">{(index ?? 0) + 1}.</span>
        )}
        <div
          ref={setRefs}
          role="textbox"
          contentEditable
          suppressContentEditableWarning
          data-placeholder={placeholder}
          data-empty={!text}
          className={classes}
          onInput={(e) => onInput((e.currentTarget as HTMLDivElement).innerText)}
          onKeyDown={onKeyDown}
        />
      </div>
    );
  }),
);

