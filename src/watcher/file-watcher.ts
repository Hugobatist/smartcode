import chokidar, { type FSWatcher } from 'chokidar';
import path from 'node:path';
import { log } from '../utils/logger.js';

/**
 * Watches a project directory for .mmd file changes using chokidar.
 * Fires callbacks with normalized forward-slash relative paths.
 */
export class FileWatcher {
  private watcher: FSWatcher;

  constructor(
    private projectDir: string,
    private onFileChanged: (relativePath: string) => void,
    private onFileAdded: (relativePath: string) => void,
    private onFileRemoved: (relativePath: string) => void,
  ) {
    this.watcher = chokidar.watch(projectDir, {
      ignored: (filePath: string, stats) => {
        // Exclude node_modules and .git directories
        const basename = path.basename(filePath);
        if (basename === 'node_modules' || basename === '.git') return true;
        // Allow directories to be traversed
        if (stats?.isDirectory()) return false;
        // Only watch .mmd files
        return !filePath.endsWith('.mmd');
      },
      persistent: true,
      ignoreInitial: true,
      atomic: true,
    });

    this.watcher
      .on('change', (filePath: string) => this.handleEvent('change', filePath))
      .on('add', (filePath: string) => this.handleEvent('add', filePath))
      .on('unlink', (filePath: string) => this.handleEvent('unlink', filePath));

    log.debug(`FileWatcher started for ${projectDir}`);
  }

  /** Normalize file path and route to appropriate callback */
  private handleEvent(event: string, filePath: string): void {
    const relative = path.relative(this.projectDir, filePath)
      .split(path.sep).join('/');

    log.debug(`File ${event}: ${relative}`);

    if (event === 'change') this.onFileChanged(relative);
    else if (event === 'add') this.onFileAdded(relative);
    else if (event === 'unlink') this.onFileRemoved(relative);
  }

  /** Close the file watcher and release OS file handles */
  async close(): Promise<void> {
    await this.watcher.close();
    log.debug('FileWatcher closed');
  }
}
