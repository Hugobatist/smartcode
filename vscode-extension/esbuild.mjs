import * as esbuild from 'esbuild';

const isWatch = process.argv.includes('--watch');

// Bundle 1: Extension host code (Node.js, CommonJS for VS Code)
const extensionConfig = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  sourcemap: true,
  minify: !isWatch,
};

// Bundle 2: Webview script (browser, IIFE)
// mermaid is loaded as a separate <script> tag in the webview HTML, not bundled here.
const webviewConfig = {
  entryPoints: ['src/webview/main.ts'],
  bundle: true,
  outfile: 'media/webview.js',
  format: 'iife',
  platform: 'browser',
  sourcemap: true,
  minify: !isWatch,
  external: ['mermaid'],
};

if (isWatch) {
  const ctx1 = await esbuild.context(extensionConfig);
  const ctx2 = await esbuild.context(webviewConfig);
  await ctx1.watch();
  await ctx2.watch();
  console.log('Watching for changes...');
} else {
  await esbuild.build(extensionConfig);
  await esbuild.build(webviewConfig);
  console.log('Build complete');
}
