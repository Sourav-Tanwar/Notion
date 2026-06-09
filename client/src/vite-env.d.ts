/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_ORIGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Injected by Vite's `define`. See vite.config.ts and lib/assetUrl.ts. */
declare const __VITE_API_ORIGIN__: string;
