import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useBlocksStore } from '@/stores/blocks.store';
import type { RenderProps } from '../registry/blockRegistry';

/**
 * Code block.
 *
 * - Stores PLAIN TEXT (not HTML) in block.text — code shouldn't have inline marks.
 * - Renders a contentEditable PRE whose content the user edits directly.
 * - Syntax highlighting is rendered in a sibling layer and toggled on blur for
 *   performance — typing on a 200-line code block + highlighting on every
 *   keystroke would jank. The user sees plain text while typing; highlight
 *   appears when focus leaves the block.
 *
 * - Prism core + languages are loaded lazily via dynamic import → not in the
 *   main bundle. First-paint of the editor is unaffected.
 */

const LANGUAGES = ['plain', 'javascript', 'typescript', 'jsx', 'tsx', 'json', 'bash', 'css', 'html', 'python', 'sql'] as const;
type Lang = (typeof LANGUAGES)[number];

const Highlighter = lazy(() => import('./PrismHighlighter').then((m) => ({ default: m.PrismHighlighter })));

export function CodeRender({ block, onKeyDown, registerEditable }: RenderProps): JSX.Element {
  const setText = useBlocksStore((s) => s.setText);
  const setProp = useBlocksStore((s) => s.setProp);
  const lang = ((block.props.lang as Lang) || 'plain') as Lang;
  const [focused, setFocused] = useState(false);
  const [copied, setCopied] = useState(false);
  const editableRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    registerEditable?.(editableRef.current);
    return () => registerEditable?.(null);
  }, [registerEditable]);

  const onCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(block.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="group relative my-1 rounded-md border border-border bg-zinc-900/60">
      <div className="flex items-center justify-between gap-2 border-b border-border px-2 py-1 text-xs">
        <select
          value={lang}
          onChange={(e) => setProp(block.id, 'lang', e.target.value)}
          className="bg-transparent text-zinc-300 focus:outline-none"
          aria-label="language"
        >
          {LANGUAGES.map((l) => (
            <option key={l} value={l} className="bg-zinc-900">{l}</option>
          ))}
        </select>
        <button
          onClick={onCopy}
          className="rounded px-2 py-0.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      <div className="relative font-mono text-sm">
        {focused || lang === 'plain' ? (
          <pre
            ref={editableRef}
            data-block-id={block.id}
            contentEditable
            suppressContentEditableWarning
            spellCheck={false}
            className="m-0 whitespace-pre-wrap break-words px-3 py-2 outline-none"
            onInput={(e) => setText(block.id, (e.currentTarget as HTMLPreElement).innerText)}
            onKeyDown={onKeyDown}
            onBlur={() => setFocused(false)}
            // Plain-text content; render once via initial children only.
            dangerouslySetInnerHTML={{ __html: escapeHtml(block.text) }}
          />
        ) : (
          <button
            onClick={() => setFocused(true)}
            className="block w-full cursor-text px-3 py-2 text-left"
            aria-label="edit code"
          >
            <Suspense fallback={<pre className="m-0 whitespace-pre-wrap break-words">{block.text}</pre>}>
              <Highlighter code={block.text} lang={lang} />
            </Suspense>
          </button>
        )}
      </div>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
