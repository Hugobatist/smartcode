import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

let cachedVersion: string | undefined;

/**
 * Read the package version from package.json.
 * Works from both source (src/utils/) and bundled (dist/) contexts
 * by searching upward for package.json.
 */
export function getVersion(): string {
  if (cachedVersion) return cachedVersion;

  const startDir = dirname(fileURLToPath(import.meta.url));

  // Search upward from current file location to find package.json
  let dir = startDir;
  for (let i = 0; i < 5; i++) {
    try {
      const pkgPath = join(dir, 'package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version?: string };
      if (pkg.version) {
        cachedVersion = pkg.version;
        return cachedVersion;
      }
    } catch {
      // Not found at this level, go up
    }
    dir = dirname(dir);
  }

  cachedVersion = '0.0.0';
  return cachedVersion;
}
