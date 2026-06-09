import { defineConfig } from 'tsup';

/**
 * Builds dos bundles de NAVEGADOR (IIFE). Cada entry vira um global window.*
 * próprio, então usamos um ARRAY de configs (tsup roda todas) — `globalName`
 * é por-config, não por-entry.
 *
 * Output em static/vendor/ ao lado dos outros bundles. O config principal
 * (tsup.config.ts) depois copia static/ para dist/static/ via onSuccess,
 * então o dist/ publicado no npm inclui estes bundles também.
 *
 * Roda antes do build principal: `tsup --config tsup.browser.ts && tsup`.
 *
 * Bundles:
 *  1. annotations-core → window.SmartCodeAnnotationsCore (core de anotações).
 *  2. sketch-shapes    → window.SmartCodeSketchShapes (formas hand-drawn,
 *     Wave 2 da reforma visual; consumido por svg-shapes.js atrás da flag).
 */
const shared = {
  format: ['iife'] as const,
  outDir: 'static/vendor',
  platform: 'browser' as const,
  target: 'es2020' as const,
  outExtension: () => ({ js: '.js' }),
  dts: false,
  clean: false,
  sourcemap: false,
  splitting: false,
  minify: false,
};

export default defineConfig([
  {
    ...shared,
    entry: { 'annotations-core': 'src/diagram/annotations-core.ts' },
    globalName: 'SmartCodeAnnotationsCore',
  },
  {
    ...shared,
    entry: { 'sketch-shapes': 'src/render/sketch-shapes.ts' },
    globalName: 'SmartCodeSketchShapes',
  },
]);
