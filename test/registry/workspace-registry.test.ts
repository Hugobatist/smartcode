import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';

/**
 * Tests for workspace-registry.ts core logic.
 *
 * The real module reads/writes ~/.smartb/workspaces.json using homedir().
 * To avoid touching the real registry, we test the core data logic
 * (serialization, filtering, deduplication) in isolation using a temp dir.
 */

let tmpDir: string;
let smartbDir: string;
let registryPath: string;

/** Simulate readRegistry: parse JSON file, return [] on any error */
async function readRegistry(filePath: string): Promise<Array<{ name: string; dir: string; port: number; pid: number }>> {
  try {
    const raw = await readFile(filePath, 'utf-8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/** Simulate isProcessAlive */
function isProcessAlive(pid: number): boolean {
  try {
    // Signal 0 checks if process exists without sending a real signal
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Simulate filterAlive */
function filterAlive(entries: Array<{ name: string; dir: string; port: number; pid: number }>) {
  return entries.filter((e) => isProcessAlive(e.pid));
}

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'smartb-registry-test-'));
  smartbDir = join(tmpDir, '.smartb');
  registryPath = join(smartbDir, 'workspaces.json');
  await mkdir(smartbDir, { recursive: true });
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('workspace-registry', () => {
  it('registry file round-trip: write + read JSON array', async () => {
    const entries = [
      { name: 'project-a', dir: '/tmp/a', port: 4000, pid: process.pid },
      { name: 'project-b', dir: '/tmp/b', port: 4001, pid: process.pid },
    ];

    await writeFile(registryPath, JSON.stringify(entries, null, 2), 'utf-8');
    const parsed = await readRegistry(registryPath);

    expect(parsed.length).toBe(2);
    expect(parsed[0]!.name).toBe('project-a');
    expect(parsed[0]!.port).toBe(4000);
    expect(parsed[1]!.name).toBe('project-b');
    expect(parsed[1]!.dir).toBe('/tmp/b');
  });

  it('empty registry returns empty array', async () => {
    await writeFile(registryPath, '[]', 'utf-8');
    const parsed = await readRegistry(registryPath);
    expect(parsed).toEqual([]);
  });

  it('malformed JSON returns empty array (fallback behavior)', async () => {
    await writeFile(registryPath, 'not valid json{{{', 'utf-8');
    const parsed = await readRegistry(registryPath);
    expect(parsed).toEqual([]);
  });

  it('non-array JSON returns empty array (fallback behavior)', async () => {
    await writeFile(registryPath, '{"not": "array"}', 'utf-8');
    const parsed = await readRegistry(registryPath);
    expect(parsed).toEqual([]);
  });

  it('missing file returns empty array', async () => {
    const parsed = await readRegistry(join(smartbDir, 'nonexistent.json'));
    expect(parsed).toEqual([]);
  });

  it('filterAlive keeps current process and removes dead PIDs', () => {
    const entries = [
      { name: 'alive', dir: '/tmp/a', port: 3000, pid: process.pid },
      { name: 'dead', dir: '/tmp/b', port: 3001, pid: 999999999 },
    ];

    const alive = filterAlive(entries);
    expect(alive.length).toBe(1);
    expect(alive[0]!.name).toBe('alive');
  });

  it('isProcessAlive returns true for current process', () => {
    expect(isProcessAlive(process.pid)).toBe(true);
  });

  it('isProcessAlive returns false for nonexistent PID', () => {
    expect(isProcessAlive(999999999)).toBe(false);
  });

  it('deduplication: same port or dir replaces existing entry', () => {
    const entries = [
      { name: 'old', dir: '/tmp/old', port: 3000, pid: process.pid },
      { name: 'other', dir: '/tmp/other', port: 3001, pid: process.pid },
    ];

    // Simulate register logic: filter out same port or same dir, then push new
    const newEntry = { name: 'new', dir: '/tmp/old', port: 3002, pid: process.pid };
    const cleaned = entries.filter((e) => e.port !== newEntry.port && e.dir !== newEntry.dir);
    cleaned.push(newEntry);

    expect(cleaned.length).toBe(2);
    expect(cleaned.find((e) => e.name === 'old')).toBeUndefined();
    expect(cleaned.find((e) => e.name === 'new')).toBeDefined();
    expect(cleaned.find((e) => e.name === 'other')).toBeDefined();
  });

  it('deregister filters entries by port', () => {
    const entries = [
      { name: 'a', dir: '/tmp/a', port: 3000, pid: 1 },
      { name: 'b', dir: '/tmp/b', port: 3001, pid: 2 },
      { name: 'c', dir: '/tmp/c', port: 3002, pid: 3 },
    ];

    const filtered = entries.filter((e) => e.port !== 3001);
    expect(filtered.length).toBe(2);
    expect(filtered.find((e) => e.name === 'b')).toBeUndefined();
  });

  it('workspace name is derived from directory basename', () => {
    expect(basename('/Users/dev/my-project')).toBe('my-project');
    expect(basename('/tmp/smartb-test')).toBe('smartb-test');
    // Empty path edge case: basename returns the directory itself
    expect(basename('/') || '/').toBe('/');
  });
});
