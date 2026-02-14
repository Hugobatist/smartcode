import { defineConfig } from 'tsup';
import { cpSync } from 'node:fs';

export default defineConfig({
  entry: ['src/cli.ts', 'src/index.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  dts: { entry: 'src/index.ts' },
  clean: true,
  splitting: false,
  sourcemap: true,
  shims: false,
  onSuccess: async () => {
    cpSync('static', 'dist/static', { recursive: true });
    console.error('[build] Static assets copied to dist/static/');
  },
});
