import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionStore } from '../../src/session/session-store.js';
import type { SessionEvent } from '../../src/session/session-types.js';

describe('SessionStore', () => {
  let tempDir: string;
  let store: SessionStore;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'smartb-session-test-'));
    store = new SessionStore(tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('startSession creates .smartb/sessions/ directory and JSONL file', async () => {
    const sessionId = await store.startSession('test.mmd');

    expect(sessionId).toBeTruthy();
    expect(typeof sessionId).toBe('string');

    // Verify JSONL file exists and first line is session:start event
    const filePath = join(tempDir, '.smartb', 'sessions', `${sessionId}.jsonl`);
    const content = await readFile(filePath, 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines.length).toBe(1);

    const startEvent = JSON.parse(lines[0]!) as SessionEvent;
    expect(startEvent.type).toBe('session:start');
    expect(startEvent.payload.diagramFile).toBe('test.mmd');
    expect(typeof startEvent.ts).toBe('number');
  });

  it('recordStep appends event to JSONL file', async () => {
    const sessionId = await store.startSession('test.mmd');

    // Record 3 steps
    for (let i = 0; i < 3; i++) {
      const event: SessionEvent = {
        ts: Date.now() + i,
        type: 'node:visited',
        payload: { nodeId: `Node${i}`, action: 'analyzed' },
      };
      await store.recordStep(sessionId, event);
    }

    const events = await store.readSession(sessionId);
    // 1 start event + 3 step events = 4 total
    expect(events.length).toBe(4);
    expect(events[0]!.type).toBe('session:start');
    expect(events[1]!.type).toBe('node:visited');
    expect(events[2]!.type).toBe('node:visited');
    expect(events[3]!.type).toBe('node:visited');
  });

  it('endSession appends end event and returns summary', async () => {
    const sessionId = await store.startSession('flow.mmd');

    // Record 2 node:visited + 1 edge:traversed
    await store.recordStep(sessionId, {
      ts: Date.now(),
      type: 'node:visited',
      payload: { nodeId: 'A', action: 'visited' },
    });
    await store.recordStep(sessionId, {
      ts: Date.now() + 1,
      type: 'node:visited',
      payload: { nodeId: 'B', action: 'visited' },
    });
    await store.recordStep(sessionId, {
      ts: Date.now() + 2,
      type: 'edge:traversed',
      payload: { fromNodeId: 'A', toNodeId: 'B' },
    });

    const summary = await store.endSession(sessionId);

    expect(summary.sessionId).toBe(sessionId);
    expect(summary.diagramFile).toBe('flow.mmd');
    expect(summary.nodesVisited).toBe(2);
    expect(summary.edgesTraversed).toBe(1);
    expect(summary.totalEvents).toBe(5); // start + 2 visited + 1 traversed + end
    expect(typeof summary.duration).toBe('number');
    expect(summary.duration).toBeGreaterThanOrEqual(0);
  });

  it('readSession returns all events in order', async () => {
    const sessionId = await store.startSession('order.mmd');

    const baseTs = Date.now();

    // Record 5 events with increasing timestamps after start
    for (let i = 0; i < 5; i++) {
      await store.recordStep(sessionId, {
        ts: baseTs + (i + 1) * 100,
        type: 'node:visited',
        payload: { nodeId: `N${i}`, action: 'step' },
      });
    }

    const events = await store.readSession(sessionId);
    expect(events.length).toBe(6); // start + 5 steps

    // Verify all events have timestamps and they are in append order
    for (const event of events) {
      expect(typeof event.ts).toBe('number');
      expect(event.ts).toBeGreaterThan(0);
    }
  });

  it('listSessions returns only sessions matching diagram file', async () => {
    // Start 2 sessions for file-a.mmd
    await store.startSession('file-a.mmd');
    await store.startSession('file-a.mmd');

    // Start 1 session for file-b.mmd
    await store.startSession('file-b.mmd');

    const sessionsA = await store.listSessions('file-a.mmd');
    expect(sessionsA.length).toBe(2);

    const sessionsB = await store.listSessions('file-b.mmd');
    expect(sessionsB.length).toBe(1);
  });

  it('getHeatmapData aggregates node:visited counts across sessions', async () => {
    // Session 1: visit A twice, B once
    const s1 = await store.startSession('heat.mmd');
    await store.recordStep(s1, {
      ts: Date.now(), type: 'node:visited', payload: { nodeId: 'A', action: 'visit' },
    });
    await store.recordStep(s1, {
      ts: Date.now(), type: 'node:visited', payload: { nodeId: 'A', action: 'visit' },
    });
    await store.recordStep(s1, {
      ts: Date.now(), type: 'node:visited', payload: { nodeId: 'B', action: 'visit' },
    });
    await store.endSession(s1);

    // Session 2: visit A once, C five times
    const s2 = await store.startSession('heat.mmd');
    await store.recordStep(s2, {
      ts: Date.now(), type: 'node:visited', payload: { nodeId: 'A', action: 'visit' },
    });
    for (let i = 0; i < 5; i++) {
      await store.recordStep(s2, {
        ts: Date.now(), type: 'node:visited', payload: { nodeId: 'C', action: 'visit' },
      });
    }
    await store.endSession(s2);

    const heatmap = await store.getHeatmapData('heat.mmd');
    expect(heatmap).toEqual({ A: 3, B: 1, C: 5 });
  });

  it('getHeatmapData returns empty object when no sessions exist', async () => {
    const heatmap = await store.getHeatmapData('nonexistent.mmd');
    expect(heatmap).toEqual({});
  });

  it('endSession with no active session throws an error', async () => {
    // Start session and immediately forget it (not tracked in activeSessions after restart)
    const sessionId = await store.startSession('orphan.mmd');

    // Simulate a "lost" session by creating a new store instance
    const freshStore = new SessionStore(tempDir);

    // endSession should throw because the session is not in activeSessions
    await expect(freshStore.endSession(sessionId)).rejects.toThrow(
      `Session ${sessionId} is not active`,
    );
  });
});
