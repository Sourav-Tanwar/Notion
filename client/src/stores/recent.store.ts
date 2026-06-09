import { create } from 'zustand';
import type { ID } from '@/types/domain';

/**
 * "Recently visited" pages. A small most-recent-first list of page ids,
 * persisted to localStorage so it survives reloads. Purely a client-side
 * convenience — no server round-trip.
 */
const STORAGE_KEY = 'notion.recentPages';
const MAX = 8;

function load(): ID[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed as ID[]) : [];
  } catch {
    return [];
  }
}

function persist(ids: ID[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    /* storage unavailable — ignore */
  }
}

interface RecentState {
  ids: ID[];
  /** Record a page visit (moves it to the front). */
  visit: (id: ID) => void;
  /** Drop a page from the list (e.g. after it's deleted). */
  remove: (id: ID) => void;
  clear: () => void;
}

export const useRecentStore = create<RecentState>((set, get) => ({
  ids: load(),
  visit(id) {
    const next = [id, ...get().ids.filter((x) => x !== id)].slice(0, MAX);
    persist(next);
    set({ ids: next });
  },
  remove(id) {
    const next = get().ids.filter((x) => x !== id);
    persist(next);
    set({ ids: next });
  },
  clear() {
    persist([]);
    set({ ids: [] });
  },
}));
