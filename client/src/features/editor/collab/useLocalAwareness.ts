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

      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        const host = findBlockHost(range.startContainer);
        if (host) {
          const blockId = host.dataset.blockId!;
          next.caret = {
            blockId,
            anchor: offsetWithin(host, sel.anchorNode, sel.anchorOffset),
            head: offsetWithin(host, sel.focusNode, sel.focusOffset),
          };
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
      window.removeEventListener('blur', onBlur);
      // Clear our state so peers immediately drop our avatar.
      awareness.setLocalState(null);
    };
  }, [awareness, user, pageId]);
}

/** Walk up from a DOM node until we hit the editable surface tagged with
 *  `data-block-id`. Returns null if we never find one. */
function findBlockHost(node: Node | null): HTMLElement | null {
  let el: HTMLElement | null =
    node instanceof HTMLElement ? node : node?.parentElement ?? null;
  while (el && !el.dataset?.blockId) el = el.parentElement;
  return el && el.dataset.blockId ? el : null;
}

/**
 * Linear character offset from the start of `host` to (node, nodeOffset).
 * Mirrors how `innerText` flattens — close enough for caret display, and
 * cheap (O(N) over text nodes inside the block).
 */
function offsetWithin(host: HTMLElement, node: Node | null, nodeOffset: number): number {
  if (!node) return 0;
  if (!host.contains(node)) return 0;
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
