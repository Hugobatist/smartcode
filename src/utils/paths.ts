import path from 'node:path';

/**
 * Resolve path to static assets bundled with the package.
 * Works regardless of global/local install location.
 *
 * In development: import.meta.dirname points to src/utils/
 * In production (built): import.meta.dirname points to dist/
 * Static assets are always at ../static relative to the built output.
 */
export function getStaticDir(): string {
  return path.join(import.meta.dirname, '..', 'static');
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
