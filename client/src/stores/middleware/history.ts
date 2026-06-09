import type { StateCreator, StoreApi } from 'zustand';

/**
 * Lightweight time-travel for Zustand.
 *
 * - Captures snapshots of *only* the keys listed in `track`.
 * - Coalesces consecutive snapshots within `mergeWindow` ms (good for typing).
 * - Caps the history to `limit` entries (sliding window).
 *
 * This is purpose-built for the blocks store: tracking the whole state in a
 * normalized editor with thousands of blocks would explode memory. We snapshot
 * by reference — since the store uses immutable updates, snapshots are O(1)
 * memory until something actually changes.
 */

export interface HistoryApi {
  undo: () => boolean;
  redo: () => boolean;
  canUndo: () => boolean;
  canRedo: () => boolean;
  reset: () => void;
}

interface Snapshot<T> { data: Partial<T>; ts: number }

export function withHistory<T extends object>(
  config: StateCreator<T>,
  options: { track: (keyof T)[]; limit?: number; mergeWindow?: number },
): StateCreator<T & { history: HistoryApi }> {
  const { track, limit = 50, mergeWindow = 600 } = options;

  return (set, get, api) => {
    const past: Snapshot<T>[] = [];
    const future: Snapshot<T>[] = [];
    let suspended = false;

    const snap = (state: T): Partial<T> => {
      const out: Partial<T> = {};
      for (const k of track) out[k] = state[k];
      return out;
    };

    const wrappedSet: StoreApi<T>['setState'] = (partial, replace) => {
      if (!suspended) {
        const prev = snap(get());
        const last = past[past.length - 1];
        if (!last || Date.now() - last.ts > mergeWindow) {
          past.push({ data: prev, ts: Date.now() });
          if (past.length > limit) past.shift();
        } else {
          // within merge window — keep the older state, just bump ts
          last.ts = Date.now();
        }
        future.length = 0;
      }
      (set as StoreApi<T>['setState'])(partial, replace as never);
    };

    const wrappedApi: StoreApi<T> = { ...api, setState: wrappedSet };
    const baseState = config(wrappedSet, get, wrappedApi);

    const history: HistoryApi = {
      canUndo: () => past.length > 0,
      canRedo: () => future.length > 0,
      undo() {
        if (!past.length) return false;
        const cur = snap(get());
        future.push({ data: cur, ts: Date.now() });
        const prev = past.pop()!;
        suspended = true;
        (set as StoreApi<T>['setState'])(prev.data as Partial<T>);
        suspended = false;
        return true;
      },
      redo() {
        if (!future.length) return false;
        const cur = snap(get());
        past.push({ data: cur, ts: Date.now() });
        const next = future.pop()!;
        suspended = true;
        (set as StoreApi<T>['setState'])(next.data as Partial<T>);
        suspended = false;
        return true;
      },
      reset() {
        past.length = 0;
        future.length = 0;
      },
    };

    return { ...baseState, history } as T & { history: HistoryApi };
  };
}
