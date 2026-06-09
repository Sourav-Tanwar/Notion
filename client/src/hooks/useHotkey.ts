import { useEffect } from 'react';

interface Options {
  enabled?: boolean;
  preventDefault?: boolean;
}

/**
 * Bind a keyboard shortcut. `combo` examples: 'mod+s', 'shift+enter', 'escape'.
 * `mod` = ctrl on Windows/Linux, meta on macOS.
 */
export function useHotkey(combo: string, handler: (e: KeyboardEvent) => void, opts: Options = {}): void {
  const { enabled = true, preventDefault = true } = opts;
  useEffect(() => {
    if (!enabled) return;
    const parts = combo.toLowerCase().split('+');
    const key = parts.pop()!;
    const needCtrl = parts.includes('ctrl') || parts.includes('mod');
    const needMeta = parts.includes('meta') || parts.includes('mod');
    const needShift = parts.includes('shift');
    const needAlt = parts.includes('alt');

    const onKey = (e: KeyboardEvent) => {
      // If a lower-level handler (e.g. a focused ProseMirror EditorView)
      // already claimed this keystroke, skip the global binding. Without
      // this, Mod-Z inside a collab text surface would fire BOTH the CRDT
      // undo and the block-level Zustand undo.
      if (e.defaultPrevented) return;
      const isMac = navigator.platform.toLowerCase().includes('mac');
      const modPressed = isMac ? e.metaKey : e.ctrlKey;
      if (parts.includes('mod') && !modPressed) return;
      if (needCtrl && !parts.includes('mod') && !e.ctrlKey) return;
      if (needMeta && !parts.includes('mod') && !e.metaKey) return;
      if (needShift !== e.shiftKey) return;
      if (needAlt !== e.altKey) return;
      if (e.key.toLowerCase() !== key) return;
      if (preventDefault) e.preventDefault();
      handler(e);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [combo, handler, enabled, preventDefault]);
}
