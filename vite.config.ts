import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const src = (dir: string): string => fileURLToPath(new URL(dir, import.meta.url));

export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  resolve: {
    alias: {
      '@core': src('./src/core'),
      '@game': src('./src/game'),
      '@ui': src('./src/ui'),
      '@testing': src('./src/testing'),
      '@fixtures': src('./tests/fixtures'),
    },
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks(id: string): string | undefined {
          return id.includes('node_modules/phaser') ? 'phaser' : undefined;
        },
      },
    },
  },
});
