import '@testing-library/jest-dom';

/**
 * jsdom does not implement BroadcastChannel. Provide a tiny in-process polyfill
 * so cross-tab tests can wire two channel instances together inside a single
 * Node process. Real browsers replace this at runtime.
 */
if (typeof (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel === 'undefined') {
  const channels = new Map<string, Set<MockBroadcastChannel>>();
  class MockBroadcastChannel {
    private listeners = new Set<(ev: MessageEvent) => void>();
    constructor(public name: string) {
      const set = channels.get(name) ?? new Set<MockBroadcastChannel>();
      set.add(this);
      channels.set(name, set);
    }
    postMessage(data: unknown): void {
      const set = channels.get(this.name);
      if (!set) return;
      for (const peer of set) {
        if (peer === this) continue;
        for (const l of peer.listeners) l({ data } as MessageEvent);
      }
    }
    addEventListener(_type: 'message', fn: (ev: MessageEvent) => void): void {
      this.listeners.add(fn);
    }
    removeEventListener(_type: 'message', fn: (ev: MessageEvent) => void): void {
      this.listeners.delete(fn);
    }
    close(): void {
      const set = channels.get(this.name);
      set?.delete(this);
    }
  }
  (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel = MockBroadcastChannel;
}
