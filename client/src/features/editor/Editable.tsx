import { memo } from 'react';
import { RichTextSurface } from './collab/RichTextSurface';

interface Props {
  id: string;
  html: string;
  className?: string;
  placeholder?: string;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  registerEditable?: (el: HTMLElement | null) => void;
}

/**
 * Legacy entrypoint — now a thin delegating wrapper.
 *
 * Prior to 8.2b this was a hand-rolled contentEditable surface whose source
 * of truth was the Zustand store's HTML string. As of 8.2b the source of
 * truth for inline text + marks is a per-block `Y.XmlFragment` owned by
 * the page's `Y.Doc`, edited through a per-block ProseMirror EditorView.
 *
 * We preserve the original component name + prop contract so every block
 * spec in `registry/builtins` (and every BlockNode focus-management call
 * site) keeps working unchanged.
 *
 * `html` is treated as a SEED, not a live binding. The CRDT owns subsequent
 * state; `RichTextSurface` reads `html` only on first mount of a block id.
 */
function EditableInner(props: Props): JSX.Element {
  return (
    <RichTextSurface
      id={props.id}
      initialHtml={props.html}
      className={props.className}
      placeholder={props.placeholder}
      onKeyDown={props.onKeyDown}
      registerEditable={props.registerEditable}
    />
  );
}

export const Editable = memo(EditableInner);
