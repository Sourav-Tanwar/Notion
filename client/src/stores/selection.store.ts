import { create } from 'zustand';
import type { ID } from '@/types/domain';

/**
 * Multi-block selection state.
 *
 * Lives in its own slice so changes don't re-render the block tree —
 * only the components that opt into a selection selector update.
 *
 * `anchorId` is the start of a range; `selected` is the resolved set.
 * The Editor computes the linear order of visible blocks and resolves
 * shift-click / shift-arrow ranges into a Set.
 */

interface SelectionState {
  anchorId: ID | null;
  selected: ReadonlySet<ID>;
  setSelection: (ids: Iterable<ID>, anchor?: ID | null) => void;
  toggle: (id: ID) => void;
  clear: () => void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  anchorId: null,
  selected: new Set(),
  setSelection(ids, anchor = null) {
    set({ selected: new Set(ids), anchorId: anchor });
  },
  toggle(id) {
    set((s) => {
      const next = new Set(s.selected);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selected: next, anchorId: s.anchorId ?? id };
    });
  },
  clear() {
    set({ selected: new Set(), anchorId: null });
  },
}));

export const selectIsSelected = (id: ID) => (s: SelectionState) => s.selected.has(id);
