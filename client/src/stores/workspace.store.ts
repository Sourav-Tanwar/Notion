import { create } from 'zustand';
import { workspacesApi, type WorkspaceDTO } from '@/services/workspaces.api';
import {
  getActiveWorkspaceId,
  setActiveWorkspaceId,
  subscribeActiveWorkspace,
} from '@/services/activeWorkspace';
import { usePagesStore } from './pages.store';
import { useBlocksStore } from './blocks.store';
import { useSelectionStore } from './selection.store';

/**
 * Workspace store.
 *
 * Wraps `activeWorkspace.ts` (which lives outside Zustand because the HTTP
 * client needs a synchronous getter — see the comment in that file). React UI
 * subscribes here; the imperative singleton stays the source of truth.
 *
 * Switching the active workspace must:
 *   1. Update the singleton (header stamp changes immediately).
 *   2. Reset every workspace-scoped store so the sidebar/editor don't render
 *      stale data from the previous tenant for a frame.
 *   3. Refetch pages under the new identity.
 *
 * Order matters: we set the active id FIRST so the page refetch carries the
 * correct `x-workspace-id` header.
 */
interface WorkspaceState {
  list: WorkspaceDTO[];
  activeId: string | null;
  loaded: boolean;
  error: string | null;

  fetch: () => Promise<void>;
  setActive: (id: string) => Promise<void>;
  create: (input: { name: string; iconEmoji?: string }) => Promise<WorkspaceDTO>;
  update: (id: string, input: { name?: string; iconEmoji?: string }) => Promise<void>;
  archive: (id: string) => Promise<void>;
  reset: () => void;
}

function resetScopedStores(): void {
  usePagesStore.getState().reset();
  useBlocksStore.getState().reset();
  useSelectionStore.getState().clear();
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  list: [],
  activeId: getActiveWorkspaceId(),
  loaded: false,
  error: null,

  async fetch() {
    try {
      const list = await workspacesApi.list();
      set({ list, loaded: true, error: null, activeId: getActiveWorkspaceId() });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to load workspaces' });
    }
  },

  async setActive(id) {
    if (id === get().activeId) return;
    setActiveWorkspaceId(id);
    resetScopedStores();
    set({ activeId: id });
    // Re-hydrate pages under the new tenant. Fire-and-forget; the sidebar
    // already shows a loading state until `loaded` flips back to true.
    void usePagesStore.getState().fetchAll();
  },

  async create(input) {
    const ws = await workspacesApi.create(input);
    set((s) => ({ list: [ws, ...s.list] }));
    await get().setActive(ws.id);
    return ws;
  },

  async update(id, input) {
    const ws = await workspacesApi.update(id, input);
    set((s) => ({ list: s.list.map((w) => (w.id === id ? ws : w)) }));
  },

  async archive(id) {
    await workspacesApi.archive(id);
    const remaining = get().list.filter((w) => w.id !== id);
    set({ list: remaining });
    if (get().activeId === id && remaining.length) {
      await get().setActive(remaining[0].id);
    }
  },

  reset() {
    set({ list: [], activeId: null, loaded: false, error: null });
  },
}));

// Keep the React store and the activeWorkspace singleton in sync if either
// side mutates (e.g. logout calls `setActiveWorkspaceId(null)` directly).
subscribeActiveWorkspace((id) => {
  if (useWorkspaceStore.getState().activeId !== id) {
    useWorkspaceStore.setState({ activeId: id });
  }
});

export const selectActiveWorkspace = (s: WorkspaceState): WorkspaceDTO | null =>
  s.list.find((w) => w.id === s.activeId) ?? null;
