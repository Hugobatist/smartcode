import { describe, it, expect, afterAll } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { formatUptime, showStatus } from '../../src/cli/status.js';
import { createHttpServer } from '../../src/server/server.js';

describe('formatUptime', () => {
  it('formats 0 seconds', () => {
    expect(formatUptime(0)).toBe('0s');
  });

  it('formats seconds only', () => {
    expect(formatUptime(45)).toBe('45s');
  });

  it('formats minutes and seconds', () => {
    expect(formatUptime(65)).toBe('1m 5s');
  });

  it('formats hours, minutes, and seconds', () => {
    expect(formatUptime(3661)).toBe('1h 1m 1s');
  });

  it('formats exact minutes (no trailing 0s)', () => {
    expect(formatUptime(120)).toBe('2m');
  });

  it('formats exact hours (no trailing 0m 0s)', () => {
    expect(formatUptime(3600)).toBe('1h');
  });
});

describe('showStatus against real /api/status', () => {
  let tempDir: string;
  let server: ReturnType<typeof createHttpServer>;
  let port: number;

  afterAll(async () => {
    if (server) {
      server.fileWatcher.close();
      server.wsManager.close();
      await new Promise<void>((resolve) => server.httpServer.close(() => resolve()));
    }
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('connects to running server and retrieves status', async () => {
    // Create temp project with a .mmd file
    tempDir = await mkdtemp(path.join(tmpdir(), 'smartb-status-'));
    await writeFile(
      path.join(tempDir, 'test.mmd'),
      'flowchart LR\n    A --> B\n',
      'utf-8',
    );

    // Start server on random port
    server = createHttpServer(tempDir);
    await new Promise<void>((resolve) => {
      server.httpServer.listen(0, () => resolve());
    });
    const addr = server.httpServer.address();
    port = typeof addr === 'object' && addr ? addr.port : 0;

    // showStatus should not throw (it logs output via log.info)
    await expect(showStatus(port)).resolves.toBeUndefined();
  });

  it('handles connection refused gracefully', async () => {
    // Port 1 is almost certainly not running a server
    await expect(showStatus(1)).resolves.toBeUndefined();
  });
});
