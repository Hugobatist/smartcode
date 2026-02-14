import { glob } from 'node:fs/promises';

/**
 * Discover all .mmd files recursively under the given directory.
 * Returns relative paths (relative to the directory).
 * Excludes node_modules and .git directories.
 * Results are sorted alphabetically for deterministic output.
 *
 * Uses Node.js built-in fs.glob (available since Node 22) to avoid
 * external CJS dependency bundling issues with tsup ESM output.
 */
export async function discoverMmdFiles(directory: string): Promise<string[]> {
  const files: string[] = [];

  for await (const entry of glob('**/*.mmd', {
    cwd: directory,
    exclude: (name) => name === 'node_modules' || name === '.git',
  })) {
    files.push(entry);
  }

  return files.sort();
}
