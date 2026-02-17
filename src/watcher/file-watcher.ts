import { watch, existsSync, type FSWatcher } from 'node:fs';
import path from 'node:path';
import { log } from '../utils/logger.js';

/**
 * Watches a project directory for .mmd file changes using Node.js native fs.watch.
 * Uses recursive mode (supported on macOS and Windows with Node >= 22).
 * Fires callbacks with normalized forward-slash relative paths.
 *
 * Replaces chokidar which has known issues with directory watching on macOS (Darwin 25+).
 */
export class FileWatcher {
  private watcher: FSWatcher;
  /** Debounce map to avoid duplicate events for the same file */
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private static readonly DEBOUNCE_MS = 80;

  constructor(
    private projectDir: string,
    private onFileChanged: (relativePath: string) => void,
    private onFileAdded: (relativePath: string) => void,
    private onFileRemoved: (relativePath: string) => void,
  ) {
    this.watcher = watch(
      projectDir,
      { recursive: true },
      (_eventType, filename) => {
        if (!filename) return;

        // Normalize to forward slashes
        const relative = filename.split(path.sep).join('/');

        // Only watch .mmd files
        if (!relative.endsWith('.mmd')) return;

        // Skip node_modules and .git
        if (relative.includes('node_modules/') || relative.includes('.git/')) return;

        // Debounce: fs.watch can fire multiple events for a single write
        const existing = this.debounceTimers.get(relative);
        if (existing) clearTimeout(existing);

        this.debounceTimers.set(relative, setTimeout(() => {
          this.debounceTimers.delete(relative);
          this.handleEvent(relative);
        }, FileWatcher.DEBOUNCE_MS));
      },
    );

    log.debug(`FileWatcher started for ${projectDir} (native fs.watch recursive)`);
  }

  /** Tracks known files so we can distinguish adds from changes */
  private knownFiles = new Set<string>();

  /** Check if file exists and route to appropriate callback */
  private handleEvent(relative: string): void {
    const absolute = path.join(this.projectDir, relative);
    const exists = existsSync(absolute);

    if (exists) {
      if (this.knownFiles.has(relative)) {
        log.debug(`File changed: ${relative}`);
        this.onFileChanged(relative);
      } else {
        log.debug(`File added: ${relative}`);
        this.knownFiles.add(relative);
        this.onFileAdded(relative);
      }
    } else {
      log.debug(`File removed: ${relative}`);
      this.knownFiles.delete(relative);
      this.onFileRemoved(relative);
    }
  }

  /** Close the file watcher and release OS file handles */
  async close(): Promise<void> {
    this.watcher.close();
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    log.debug('FileWatcher closed');
  }
}
