/**
 * Inline AI autocomplete (ghost text).
 *
 * A ProseMirror plugin that, when the caret sits at the end of a non-empty
 * text block, asks the server for a short continuation and renders it as a
 * dimmed widget decoration after the cursor. `Tab` accepts it; any edit or
 * `Escape` dismisses it.
 *
 * Acceptance is wired through RichTextSurface's `handleKeyDown` (which runs
 * before the per-block key handler) via `acceptAutocomplete` / `dismiss
 * Autocomplete`, so Tab-to-accept wins over Tab-to-indent only when a
 * suggestion is actually showing.
 */

import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import { fetchAiComplete } from '@/services/ai.api';
import { aiSettings } from '@/stores/ai.store';

interface GhostState {
  text: string;
  pos: number;
}

export const autocompleteKey = new PluginKey<GhostState | null>('ai-autocomplete');

const DEBOUNCE_MS = 600;
const MIN_CONTEXT = 3;
const MAX_CONTEXT = 1_000;

function ghostWidget(text: string): HTMLElement {
  const span = document.createElement('span');
  span.textContent = text;
  span.className = 'ai-ghost-text';
  span.style.opacity = '0.4';
  span.style.pointerEvents = 'none';
  span.setAttribute('aria-hidden', 'true');
  return span;
}

/** Is the caret at the end of a non-empty text block? */
function caretAtBlockEnd(view: EditorView): { ok: boolean; head: number } {
  const { selection } = view.state;
  if (!selection.empty) return { ok: false, head: 0 };
  const { $head } = selection;
  const atEnd = $head.parentOffset === $head.parent.content.size;
  const hasText = $head.parent.textContent.trim().length >= MIN_CONTEXT;
  return { ok: atEnd && hasText, head: selection.head };
}

export function autocompletePlugin(): Plugin<GhostState | null> {
  let timer: number | null = null;
  let inFlight: AbortController | null = null;
  let lastContext = '';

  const cancel = () => {
    if (timer != null) {
      window.clearTimeout(timer);
      timer = null;
    }
    inFlight?.abort();
    inFlight = null;
  };

  return new Plugin<GhostState | null>({
    key: autocompleteKey,
    state: {
      init: () => null,
      apply(tr, value) {
        const meta = tr.getMeta(autocompleteKey);
        if (meta !== undefined) return meta as GhostState | null;
        // Any document or selection change invalidates the current ghost.
        if (tr.docChanged || tr.selectionSet) return null;
        return value;
      },
    },
    props: {
      decorations(state) {
        const ghost = autocompleteKey.getState(state);
        if (!ghost || !ghost.text) return null;
        return DecorationSet.create(state.doc, [
          Decoration.widget(ghost.pos, () => ghostWidget(ghost.text), { side: 1 }),
        ]);
      },
    },
    view() {
      return {
        update(view) {
          if (!aiSettings.isAutocompleteOn()) {
            cancel();
            return;
          }
          const current = autocompleteKey.getState(view.state);
          const { ok, head } = caretAtBlockEnd(view);
          if (!ok) {
            cancel();
            if (current) {
              view.dispatch(view.state.tr.setMeta(autocompleteKey, null));
            }
            return;
          }
          const context = view.state.doc.textBetween(
            Math.max(0, head - MAX_CONTEXT),
            head,
            ' ',
          );
          // Already showing a suggestion for this exact context → leave it.
          if (current && context === lastContext) return;

          cancel();
          timer = window.setTimeout(() => {
            timer = null;
            const ctrl = new AbortController();
            inFlight = ctrl;
            lastContext = context;
            void fetchAiComplete(context, ctrl.signal)
              .then((suggestion) => {
                if (ctrl.signal.aborted) return;
                const trimmed = suggestion.replace(/^\s+/, (m) =>
                  context.endsWith(' ') ? '' : m ? ' ' : '',
                );
                // Bail if the caret moved while we were waiting.
                const now = caretAtBlockEnd(view);
                if (!now.ok || now.head !== head || !trimmed.trim()) return;
                view.dispatch(
                  view.state.tr.setMeta(autocompleteKey, {
                    text: trimmed,
                    pos: head,
                  } as GhostState),
                );
              })
              .catch(() => {
                /* network/quota errors are silent for autocomplete */
              });
          }, DEBOUNCE_MS);
        },
        destroy: cancel,
      };
    },
  });
}

/** Accept the active suggestion in `view`. Returns false if none showing. */
export function acceptAutocomplete(view: EditorView): boolean {
  const ghost = autocompleteKey.getState(view.state);
  if (!ghost || !ghost.text) return false;
  const tr = view.state.tr
    .insertText(ghost.text, ghost.pos)
    .setMeta(autocompleteKey, null);
  view.dispatch(tr);
  return true;
}

/** Dismiss any active suggestion. Returns true if one was showing. */
export function dismissAutocomplete(view: EditorView): boolean {
  const ghost = autocompleteKey.getState(view.state);
  if (!ghost) return false;
  view.dispatch(view.state.tr.setMeta(autocompleteKey, null));
  return true;
}
