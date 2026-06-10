/**
 * RichTextSurface — per-block ProseMirror EditorView bound to a Y.XmlFragment
 * stored under `ydoc.getMap('blocks').get(blockId)`.
 *
 * Lifecycle
 * ---------
 *  - On mount: ensure a `Y.XmlFragment` exists for this block id. If it's
 *    empty (we're the first writer in the room for this block), seed it
 *    from `initialHtml` so legacy content materializes into the CRDT.
 *  - Wire `ySyncPlugin` so PM and the fragment stay reconciled.
 *  - Wire `yUndoPlugin` so undo/redo are scoped per-user (origin-aware).
 *  - On unmount: destroy the view. The Y.XmlFragment stays in the Y.Doc
 *    for future mounts and remote peers.
 *
 * Source-of-truth contract
 * ------------------------
 *  - **Inline text + marks** → owned by Y.XmlFragment (CRDT).
 *  - **Stored HTML in Zustand** → derivative. We serialize the PM doc back
 *    on every change (debounced) so REST snapshots, the read-only public
 *    viewer, and copy-to-plaintext all stay current. Remote awareness
 *    updates also funnel through here.
 *
 * Why we don't drop the HTML in the store entirely
 * ------------------------------------------------
 * Lots of features read `block.text` synchronously (search, copy/paste,
 * non-collab consumers, markdown shortcut detection, PublicShare). Migrating
 * all of them off HTML is a separate concern; for now, HTML stays the
 * REST-facing format and the CRDT is the live runtime.
 */

import { useEffect, useLayoutEffect, useRef } from 'react';
import * as Y from 'yjs';
import { EditorState, type Plugin, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap, toggleMark } from 'prosemirror-commands';
import {
  ySyncPlugin,
  yUndoPlugin,
  undo as yUndo,
  redo as yRedo,
  prosemirrorJSONToYXmlFragment,
} from 'y-prosemirror';
import { schema } from './pmSchema';
import { htmlToDoc, docToHtml, docToPlain } from './htmlBridge';
import { markdownInputRules } from './inputRules';
import { focusedView } from './focusedView';
import { blockViews } from './blockViews';
import { autocompletePlugin, acceptAutocomplete, dismissAutocomplete } from './autocomplete';
import { makeMentionView } from './mentionNodeView';
import { useCollab } from './CollabContext';
import { useBlocksStore } from '@/stores/blocks.store';
import { useCommentsUiStore } from '@/stores/comments.store';
import { usePagesStore } from '@/stores/pages.store';
import { cn } from '@/lib/cn';

interface Props {
  id: string;
  /** Initial HTML used to seed an empty CRDT fragment. */
  initialHtml: string;
  className?: string;
  placeholder?: string;
  /** Forwarded as-is from BlockNode. Receives the synthetic event with
   *  `currentTarget` set to the editable host so existing block-level
   *  keyboard logic (Enter, Backspace-on-empty, Tab, markdown shortcuts)
   *  keeps working without modification. */
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  registerEditable?: (el: HTMLElement | null) => void;
}

const STORE_DEBOUNCE_MS = 400;

export function RichTextSurface({
  id,
  initialHtml,
  className,
  placeholder,
  onKeyDown,
  registerEditable,
}: Props): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  // Hold the latest onKeyDown in a ref so PM plugins always call the
  // current React closure even though the view is mounted only once.
  const onKeyDownRef = useRef(onKeyDown);
  useLayoutEffect(() => {
    onKeyDownRef.current = onKeyDown;
  });

  const { doc: ydoc, pageId } = useCollab();
  const setText = useBlocksStore((s) => s.setText);
  // Page-level read-only lock. Held in a ref so the PM `editable` callback
  // (created once at mount) always sees the latest value.
  const locked = usePagesStore((s) => s.byId[pageId]?.locked ?? false);
  const lockedRef = useRef(locked);
  useEffect(() => {
    lockedRef.current = locked;
    viewRef.current?.setProps({ editable: () => !lockedRef.current });
  }, [locked]);
  // Mount the EditorView exactly once per `id`. Remounts (e.g. block type
  // change forcing a parent `key` swap) destroy and rebuild — the Y.XmlFragment
  // persists across that because it's owned by the page-level Y.Doc.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const fragments = ydoc.getMap<Y.XmlFragment>('blocks');
    let frag = fragments.get(id);
    if (!frag) {
      frag = new Y.XmlFragment();
      fragments.set(id, frag);
    }

    // Seed empty fragment BEFORE creating the view so the initial
    // ySyncPlugin snapshot includes the seeded content and no
    // duplicate-paragraph race occurs. `htmlToDoc('')` returns a doc with
    // one empty paragraph, which satisfies the `paragraph+` schema
    // constraint and matches the legacy "new empty block" rendering.
    if (frag.length === 0) {
      const pmDoc = htmlToDoc(initialHtml || '');
      prosemirrorJSONToYXmlFragment(schema, pmDoc.toJSON(), frag);
    }

    let storeTimer: number | null = null;
    const flushToStore = (state: EditorState, editableEl: HTMLElement) => {
      if (storeTimer != null) window.clearTimeout(storeTimer);
      storeTimer = window.setTimeout(() => {
        storeTimer = null;
        const html = docToHtml(state.doc);
        const current = useBlocksStore.getState().byId[id]?.text;
        if (current !== html) setText(id, html);
        // Toggle placeholder visibility on the live PM editable element
        // (the one carrying contenteditable + data-placeholder).
        editableEl.dataset.empty = docToPlain(state.doc).trim() === '' ? 'true' : 'false';
      }, STORE_DEBOUNCE_MS);
    };

    const plugins: Plugin[] = [
      ySyncPlugin(frag),
      yUndoPlugin(),
      markdownInputRules(),
      keymap({
        'Mod-z': yUndo,
        'Mod-y': yRedo,
        'Mod-Shift-z': yRedo,
        'Mod-b': toggleMark(schema.marks.strong),
        'Mod-i': toggleMark(schema.marks.em),
        'Mod-u': toggleMark(schema.marks.underline),
      }),
      keymap(baseKeymap),
      autocompletePlugin(),
    ];

    const state = EditorState.create({ schema, plugins });

    const view = new EditorView(host, {
      state,
      editable: () => !lockedRef.current,
      nodeViews: {
        pageMention: (node) => makeMentionView(node),
      },
      attributes: {
        // Hook the standard data attributes BlockNode/FloatingToolbar/
        // RemoteCarets rely on. Note: `attributes` apply to PM's *editable*
        // element (`view.dom`), not the wrapper host. That's exactly what
        // we want — selectors like `[data-block-id]` should match the
        // element that actually contains the text nodes.
        'data-block-id': id,
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
      },
      handleKeyDown(viewArg, event) {
        // Ghost-text autocomplete: Tab accepts an active suggestion (winning
        // over Tab-to-indent only when one is showing); Escape dismisses it.
        if (event.key === 'Tab' && acceptAutocomplete(viewArg)) {
          event.preventDefault();
          return true;
        }
        if (event.key === 'Escape' && dismissAutocomplete(viewArg)) {
          return true;
        }
        // Forward to BlockNode synchronously. We wrap as a React-style
        // synthetic so the existing handler (which reads .key, .shiftKey,
        // .preventDefault, .currentTarget.innerText) can run unchanged.
        // `currentTarget` is the PM editable element so `.innerText`
        // matches what the user actually sees in this block.
        const synthetic = makeSyntheticKey(event, viewArg.dom as HTMLDivElement);
        onKeyDownRef.current(synthetic);
        // If BlockNode preventDefault'd (e.g. for Enter to create a new
        // block), tell PM "handled" so it skips its default behavior.
        return event.defaultPrevented;
      },
      dispatchTransaction(tr) {
        // `this` is the EditorView (PM invokes via `.call(view, tr)`).
        // We can't close over the outer `view` const because
        // `ySyncPlugin.view()` dispatches a sync transaction during
        // `new EditorView(...)`, before the const binding initializes
        // (TDZ ReferenceError).
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const self = this as unknown as EditorView;
        const next = self.state.apply(tr);
        self.updateState(next);
        if (tr.docChanged) flushToStore(next, self.dom as HTMLElement);
      },
      handleDOMEvents: {
        focus: () => {
          const v = viewRef.current;
          if (v) focusedView.set(v);
          return false;
        },
        blur: () => {
          const v = viewRef.current;
          if (v && focusedView.get() === v) focusedView.set(null);
          return false;
        },
      },
      handleClickOn(_view, _pos, _node, _nodePos, event) {
        // Clicking a commented span opens that thread in the drawer.
        const el = (event.target as HTMLElement)?.closest?.('[data-comment-id]');
        const commentId = el?.getAttribute('data-comment-id');
        if (commentId) {
          useCommentsUiStore.getState().focusComment(commentId);
          return true;
        }
        return false;
      },
    });
    viewRef.current = view;
    blockViews.register(id, view);
    const editableEl = view.dom as HTMLElement;
    editableEl.dataset.empty = docToPlain(state.doc).trim() === '' ? 'true' : 'false';
    // Imperative focus API consumed by `useFocusBlock`. Attached to the
    // editable element (same one passed to `registerEditable`) so callers
    // can find it via the editableRef they already hold.
    (editableEl as HTMLElement & { __focusPM?: (where: 'start' | 'end') => void }).__focusPM = (
      where,
    ) => {
      const v = viewRef.current;
      if (!v) return;
      const pos = where === 'start' ? 1 : v.state.doc.content.size;
      const tr = v.state.tr.setSelection(TextSelection.create(v.state.doc, pos));
      v.dispatch(tr);
      v.focus();
    };
    registerEditable?.(editableEl);

    return () => {
      if (storeTimer != null) window.clearTimeout(storeTimer);
      registerEditable?.(null);
      blockViews.unregister(id);
      if (focusedView.get() === view) focusedView.set(null);
      view.destroy();
      viewRef.current = null;
    };
    // initialHtml and placeholder intentionally NOT in deps — they're seed
    // values; subsequent updates flow through the CRDT, not React props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, ydoc]);

  return (
    <div
      ref={hostRef}
      role="textbox"
      className={cn('outline-none', className)}
    />
  );
}

/** Wrap a native KeyboardEvent so it satisfies the `React.KeyboardEvent`
 *  surface the legacy onKeyDown handlers actually use. We don't try to be
 *  faithful to the full SyntheticEvent contract — just the read paths. */
function makeSyntheticKey(
  event: KeyboardEvent,
  host: HTMLElement,
): React.KeyboardEvent<HTMLDivElement> {
  return {
    key: event.key,
    shiftKey: event.shiftKey,
    metaKey: event.metaKey,
    ctrlKey: event.ctrlKey,
    altKey: event.altKey,
    nativeEvent: event,
    currentTarget: host as HTMLDivElement,
    target: event.target as EventTarget & HTMLDivElement,
    preventDefault: () => event.preventDefault(),
    stopPropagation: () => event.stopPropagation(),
  } as unknown as React.KeyboardEvent<HTMLDivElement>;
}
