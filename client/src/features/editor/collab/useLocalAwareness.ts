/**
 * Broadcast the local user's identity + caret position into awareness.
 *
 * Identity is set once on mount. Caret position is updated on every
 * `selectionchange`, but throttled to ~30 Hz so a fast caret can't flood
 * the WebSocket. If the user clicks outside any [data-block-id], we clear
 * the `caret` field — peers will then show only the avatar pill, no cursor.
 *
 * Caret offsets are computed as the linear `innerText` character index from
 * the start of the block surface. This is intentionally lossy across rich
 * inline marks: a precise CRDT-anchored cursor requires y-prosemirror, which
 * lands with the editor schema migration. For visual presence on top of the
 * current contentEditable surfaces, character offsets are accurate enough
 * and degrade gracefully (the remote-caret renderer clamps to the block).
 */

import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import { useCollab } from './CollabContext';
import { colorFor, type AwarenessState, type AwarenessUser } from './awareness';

const THROTTLE_MS = 33; // ~30 Hz

export function useLocalAwareness(pageId: string): void {
  const { awareness } = useCollab();
  const user = useAuthStore((s) => s.user);

  // Capture identity in a ref so the throttled handler doesn't churn when
  // unrelated bits of the user record change.
  const identityRef = useRef<AwarenessUser | null>(null);

  useEffect(() => {
    if (!user) return;
    const identity: AwarenessUser = {
      id: user.id,
      name: user.name || user.email,
      email: user.email,
      avatarUrl: user.avatarUrl ?? null,
      color: colorFor(user.id),
    };
    identityRef.current = identity;

    // Seed awareness with our identity + no caret. Server-side onAuthenticate
    // already authenticated this user; awareness is purely cosmetic so we
    // don't repeat that check here.
    const seed: AwarenessState = { user: identity, lastActiveAt: Date.now() };
    awareness.setLocalState(seed);

    let pending = false;
    let lastSent = 0;

    const publish = () => {
      const id = identityRef.current;
      if (!id) return;
      const sel = window.getSelection();
      const next: AwarenessState = { user: id, lastActiveAt: Date.now() };
      const active = document.activeElement as HTMLElement | null;

      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        const host = findCaretHost(range.startContainer);
        if (host) {
          const blockId = host.dataset.caretId ?? host.dataset.blockId!;
          next.caret = {
            blockId,
            anchor: offsetWithin(host, sel.anchorNode, sel.anchorOffset),
            head: offsetWithin(host, sel.focusNode, sel.focusOffset),
          };
        }
      } else if (active) {
        // Inputs/Textareas keep selection internally; window.getSelection() may
        // be empty. Anchor to the nearest collab host so peers still see the
        // correct cell while the user moves the caret.
        const host = findCaretHost(active);
        if (host) {
          const blockId = host.dataset.caretId ?? host.dataset.blockId!;
          const input =
            active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement
              ? active
              : null;
          const caret = input ? Math.max(0, input.selectionStart ?? 0) : 0;
          next.caret = { blockId, anchor: caret, head: caret };
        }
      }
      awareness.setLocalState(next);
      lastSent = Date.now();
    };

    const onChange = () => {
      const now = Date.now();
      if (now - lastSent >= THROTTLE_MS) {
        publish();
      } else if (!pending) {
        pending = true;
        window.setTimeout(() => {
          pending = false;
          publish();
        }, THROTTLE_MS - (now - lastSent));
      }
    };

    document.addEventListener('selectionchange', onChange);
    // Some browsers/editable states coalesce selectionchange oddly while using
    // arrow keys; keyup/mouseup ensures caret-only movement still broadcasts.
    document.addEventListener('keyup', onChange, true);
    document.addEventListener('mouseup', onChange, true);
    // Also push a final null-caret state when the tab loses focus so peers
    // don't see a stale cursor of someone who alt-tabbed away.
    const onBlur = () => {
      const id = identityRef.current;
      if (!id) return;
      awareness.setLocalState({ user: id, lastActiveAt: Date.now() });
    };
    window.addEventListener('blur', onBlur);

    return () => {
      document.removeEventListener('selectionchange', onChange);
      document.removeEventListener('keyup', onChange, true);
      document.removeEventListener('mouseup', onChange, true);
      window.removeEventListener('blur', onBlur);
      // Clear our state so peers immediately drop our avatar.
      awareness.setLocalState(null);
    };
  }, [awareness, user, pageId]);
}

/** Walk up from a DOM node until we hit a collab host. We prefer fine-grained
 *  `data-caret-id` anchors (database cells), then fall back to `data-block-id`. */
function findCaretHost(node: Node | null): HTMLElement | null {
  let el: HTMLElement | null =
    node instanceof HTMLElement ? node : node?.parentElement ?? null;
  while (el && !el.dataset?.caretId && !el.dataset?.blockId) el = el.parentElement;
  return el && (el.dataset.caretId || el.dataset.blockId) ? el : null;
}

/**
 * Linear character offset from the start of `host` to (node, nodeOffset).
 * Mirrors how `innerText` flattens — close enough for caret display, and
 * cheap (O(N) over text nodes inside the block).
 */
function offsetWithin(host: HTMLElement, node: Node | null, nodeOffset: number): number {
  if (!node) return 0;
  if (!host.contains(node)) return 0;
  // Anchor/focus can point at either a text node or an element+child index.
  // A DOM Range gives us a consistent linear text offset for both cases.
  const r = document.createRange();
  try {
    r.setStart(host, 0);
    r.setEnd(node, nodeOffset);
    return r.toString().length;
  } catch {
    const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
    let acc = 0;
    let cur: Node | null = walker.nextNode();
    while (cur) {
      if (cur === node) return acc + nodeOffset;
      acc += (cur.nodeValue ?? '').length;
      cur = walker.nextNode();
    }
    return acc;
  }
}
