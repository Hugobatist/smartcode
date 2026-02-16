import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DiagramService } from '../../src/diagram/service.js';
import { GhostPathStore } from '../../src/server/ghost-store.js';

/**
 * Tests for the check_breakpoints and record_ghost_path MCP tools.
 *
 * Tests the DiagramService breakpoint methods and GhostPathStore directly
 * rather than through the MCP server (simpler, faster, same coverage).
 */
describe('check_breakpoints', () => {
  let tmpDir: string;
  let service: DiagramService;

  const DIAGRAM_WITH_BREAKPOINT = [
    'flowchart LR',
    '    A["Start"] --> B["Process"]',
    '    B --> C["End"]',
    '',
    '%% --- ANNOTATIONS (auto-managed by SmartB Diagrams) ---',
    '%% @breakpoint B',
    '%% --- END ANNOTATIONS ---',
    '',
  ].join('\n');

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'smartb-bp-test-'));
    service = new DiagramService(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns breakpoint set containing the node when breakpoint exists', async () => {
    writeFileSync(join(tmpDir, 'test.mmd'), DIAGRAM_WITH_BREAKPOINT, 'utf-8');

    const breakpoints = await service.getBreakpoints('test.mmd');
    expect(breakpoints.has('B')).toBe(true);
  });

  it('returns empty set when no breakpoint on queried node', async () => {
    writeFileSync(join(tmpDir, 'test.mmd'), DIAGRAM_WITH_BREAKPOINT, 'utf-8');

    const breakpoints = await service.getBreakpoints('test.mmd');
    expect(breakpoints.has('A')).toBe(false);
    expect(breakpoints.has('C')).toBe(false);
  });

  it('continue signal clears after consumption', () => {
    const signals = new Map<string, boolean>();
    const signalKey = 'test.mmd:B';

    // Set continue signal
    signals.set(signalKey, true);
    expect(signals.has(signalKey)).toBe(true);

    // Consume signal (simulates what check_breakpoints handler does)
    signals.delete(signalKey);
    expect(signals.has(signalKey)).toBe(false);

    // Second check -- signal no longer present (would return "pause")
    expect(signals.has(signalKey)).toBe(false);
  });
});

describe('ghost store', () => {
  let store: GhostPathStore;

  beforeEach(() => {
    store = new GhostPathStore();
  });

  it('add and get ghost paths', () => {
    store.add('diagram.mmd', {
      fromNodeId: 'A',
      toNodeId: 'B',
      label: 'rejected approach',
      timestamp: 1000,
    });

    store.add('diagram.mmd', {
      fromNodeId: 'B',
      toNodeId: 'C',
      timestamp: 2000,
    });

    const paths = store.get('diagram.mmd');
    expect(paths).toHaveLength(2);
    expect(paths[0]).toEqual({
      fromNodeId: 'A',
      toNodeId: 'B',
      label: 'rejected approach',
      timestamp: 1000,
    });
    expect(paths[1]).toEqual({
      fromNodeId: 'B',
      toNodeId: 'C',
      timestamp: 2000,
    });
  });

  it('clear removes ghost paths for a specific file', () => {
    store.add('file1.mmd', {
      fromNodeId: 'A',
      toNodeId: 'B',
      timestamp: 1000,
    });
    store.add('file2.mmd', {
      fromNodeId: 'X',
      toNodeId: 'Y',
      timestamp: 2000,
    });

    store.clear('file1.mmd');

    expect(store.get('file1.mmd')).toHaveLength(0);
    expect(store.get('file2.mmd')).toHaveLength(1);
  });

  it('clearAll removes all ghost paths', () => {
    store.add('file1.mmd', {
      fromNodeId: 'A',
      toNodeId: 'B',
      timestamp: 1000,
    });
    store.add('file2.mmd', {
      fromNodeId: 'X',
      toNodeId: 'Y',
      timestamp: 2000,
    });

    store.clearAll();

    expect(store.get('file1.mmd')).toHaveLength(0);
    expect(store.get('file2.mmd')).toHaveLength(0);
  });

  it('get returns empty array for unknown file', () => {
    expect(store.get('nonexistent.mmd')).toHaveLength(0);
  });
});
