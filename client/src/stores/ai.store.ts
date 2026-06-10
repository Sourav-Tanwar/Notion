import { create } from 'zustand';
import { aiStatus } from '@/services/ai.api';

/**
 * AI feature settings.
 *
 * - `enabled` mirrors the server (is a Groq key configured?). Fetched once on
 *   first use; AI affordances stay hidden when false.
 * - `autocomplete` is a per-device preference (ghost-text as you type),
 *   persisted to localStorage. Defaults ON, but only ever fires when the
 *   server is `enabled`.
 */

const LS_KEY = 'ai.autocomplete';

const readPref = (): boolean => {
  try {
    return localStorage.getItem(LS_KEY) !== 'off';
  } catch {
    return true;
  }
};

interface AiSettingsState {
  enabled: boolean;
  enabledChecked: boolean;
  autocomplete: boolean;
  refreshStatus: () => Promise<void>;
  setAutocomplete: (on: boolean) => void;
}

export const useAiSettingsStore = create<AiSettingsState>((set, get) => ({
  enabled: false,
  enabledChecked: false,
  autocomplete: readPref(),
  async refreshStatus() {
    if (get().enabledChecked) return;
    const enabled = await aiStatus();
    set({ enabled, enabledChecked: true });
  },
  setAutocomplete(on) {
    try {
      localStorage.setItem(LS_KEY, on ? 'on' : 'off');
    } catch {
      /* ignore */
    }
    set({ autocomplete: on });
  },
}));

/** Non-reactive read for plugin code that lives outside React. */
export const aiSettings = {
  isAutocompleteOn: () => useAiSettingsStore.getState().autocomplete && useAiSettingsStore.getState().enabled,
};
