import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    resolve: {
      alias: { '@': path.resolve(__dirname, 'src') },
    },
    // Expose VITE_API_ORIGIN as a global so a single helper (lib/assetUrl.ts)
    // can read it without touching `import.meta`, which lets the same code
    // compile cleanly under ts-jest's CommonJS target.
    define: {
      __VITE_API_ORIGIN__: JSON.stringify(env.VITE_API_ORIGIN ?? ''),
    },
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': 'http://localhost:4000',
      },
    },
  };
});
