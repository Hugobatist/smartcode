import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Resolve path to static assets bundled with the package.
 * Works regardless of global/local install location.
 *
 * In production (built): __dirname points to dist/
 *   -> static assets at dist/static/ (../static from dist/)
 * In development/test: __dirname points to src/utils/
 *   -> static assets at <root>/static/ (../../static from src/utils/)
 */
export function getStaticDir(): string {
  // Production path: dist/ -> dist/static/
  const prodPath = path.join(__dirname, '..', 'static');
  if (existsSync(prodPath)) return prodPath;

  // Development path: src/utils/ -> <root>/static/
  const devPath = path.join(__dirname, '..', '..', 'static');
  if (existsSync(devPath)) return devPath;

  // Fallback to original behavior
  return prodPath;
}

export function getStaticFile(filename: string): string {
  return path.join(getStaticDir(), filename);
}

/**
 * Resolve a relative file path against a project root.
 * Throws if the resolved path escapes the project root (path traversal protection).
 */
export function resolveProjectPath(projectRoot: string, filePath: string): string {
  const resolvedRoot = path.resolve(projectRoot);
  const resolved = path.resolve(resolvedRoot, filePath);
  if (!resolved.startsWith(resolvedRoot + path.sep) && resolved !== resolvedRoot) {
    throw new Error(`Path traversal detected: ${filePath}`);
  }
  return resolved;
}
