import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

/** Directories excluded from .mmd file discovery */
const EXCLUDED_DIRS = new Set([
  'node_modules', '.git', 'test', 'dist', '.planning', '.smartb',
]);

/**
 * Discover all .mmd files recursively under the given directory.
 * Returns relative paths (relative to the directory).
 * Excludes node_modules, .git, test, dist, .planning, and .smartb directories.
 * Results are sorted alphabetically for deterministic output.
 *
 * Uses recursive readdir (Node 18.17+) with post-filtering to avoid
 * external CJS dependency bundling issues with tsup ESM output.
 */
export async function discoverMmdFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.mmd')) continue;

    // Build relative path from parentPath (available since Node 18.17)
    const parentPath = (entry as { parentPath?: string }).parentPath ?? '';
    const relativePath = parentPath
      ? join(parentPath, entry.name).slice(directory.length + 1)
      : entry.name;

    // Check if any path segment is in the excluded set
    const segments = relativePath.split('/');
    const excluded = segments.some((seg) => EXCLUDED_DIRS.has(seg));
    if (!excluded) {
      files.push(relativePath);
    }
  }

  return files.sort();
}
