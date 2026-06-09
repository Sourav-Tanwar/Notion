export const uid = (): string =>
  globalThis.crypto?.randomUUID?.() ??
  `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
