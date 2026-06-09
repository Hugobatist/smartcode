import { defineConfig } from 'tsup';

/**
 * Browser build of the shared annotation core. Emits an IIFE exposing
 * window.SmartCodeAnnotationsCore, consumed by static/annotations.js.
 *
 * Output lands in static/vendor/ next to the other browser bundles. The main
 * tsup config (tsup.config.ts) then copies static/ into dist/static/ via its
 * onSuccess hook, so the npm-published dist/ includes this bundle too.
 *
 * Runs before the main build: `tsup --config tsup.browser.ts && tsup`.
 */
export default defineConfig({
  entry: { 'annotations-core': 'src/diagram/annotations-core.ts' },
  format: ['iife'],
  globalName: 'SmartCodeAnnotationsCore',
  outDir: 'static/vendor',
  platform: 'browser',
  target: 'es2020',
  outExtension: () => ({ js: '.js' }),
  dts: false,
  clean: false,
  sourcemap: false,
  splitting: false,
  minify: false,
});
