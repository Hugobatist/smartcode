import { appendFile, readFile, readdir, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { SessionEvent, SessionMeta, SessionSummary } from './session-types.js';

/**
 * SessionStore -- persists session events as JSONL files in .smartb/sessions/.
 * Each session is a single .jsonl file with one JSON object per line.
 * Uses per-session write locks to prevent concurrent JSONL corruption.
 */
export class SessionStore {
  private readonly sessionsDir: string;
  private readonly activeSessions = new Map<string, SessionMeta>();
  private readonly writeLocks = new Map<string, Promise<void>>();

  constructor(projectRoot: string) {
    this.sessionsDir = join(projectRoot, '.smartb', 'sessions');
  }

  /** Ensure the sessions directory exists */
  private async ensureDir(): Promise<void> {
    await mkdir(this.sessionsDir, { recursive: true });
  }

  /** Serialize write operations on a given session to prevent JSONL corruption */
  private async withWriteLock<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.writeLocks.get(sessionId) ?? Promise.resolve();
    const current = prev.then(fn, fn);
    this.writeLocks.set(sessionId, current.then(() => {}, () => {}));
    return current;
  }

  /** Get the file path for a session's JSONL file */
  private filePath(sessionId: string): string {
    return join(this.sessionsDir, `${sessionId}.jsonl`);
  }

  /**
   * Start a new session for a diagram file.
   * Creates the sessions directory if needed, generates a UUID, and writes the start event.
   * Returns the session ID.
   */
  async startSession(diagramFile: string): Promise<string> {
    await this.ensureDir();

    const id = randomUUID();
    const startedAt = Date.now();
    const meta: SessionMeta = { id, diagramFile, startedAt };
    this.activeSessions.set(id, meta);

    const startEvent: SessionEvent = {
      ts: startedAt,
      type: 'session:start',
      payload: { diagramFile },
    };

    await appendFile(this.filePath(id), JSON.stringify(startEvent) + '\n', 'utf-8');
    return id;
  }

  /**
   * Record a step (event) in an active session.
   * Uses a write lock to prevent concurrent JSONL corruption.
   */
  async recordStep(sessionId: string, event: SessionEvent): Promise<void> {
    return this.withWriteLock(sessionId, async () => {
      await appendFile(this.filePath(sessionId), JSON.stringify(event) + '\n', 'utf-8');
    });
  }

  /**
   * End an active session.
   * Appends a session:end event, computes summary statistics, and removes from active sessions.
   */
  async endSession(sessionId: string): Promise<SessionSummary> {
    const meta = this.activeSessions.get(sessionId);
    const diagramFile = meta?.diagramFile ?? '';

    const endEvent: SessionEvent = {
      ts: Date.now(),
      type: 'session:end',
      payload: {},
    };

    await this.withWriteLock(sessionId, async () => {
      await appendFile(this.filePath(sessionId), JSON.stringify(endEvent) + '\n', 'utf-8');
    });

    const events = await this.readSession(sessionId);
    this.activeSessions.delete(sessionId);
    this.writeLocks.delete(sessionId);

    return this.computeSummary(events, sessionId, diagramFile);
  }

  /**
   * Read all events from a session's JSONL file.
   * Each line is parsed as a JSON object. Empty lines are filtered.
   */
  async readSession(sessionId: string): Promise<SessionEvent[]> {
    try {
      const content = await readFile(this.filePath(sessionId), 'utf-8');
      return content
        .split('\n')
        .filter((line) => line.trim() !== '')
        .map((line) => JSON.parse(line) as SessionEvent);
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
        return [];
      }
      throw err;
    }
  }

  /**
   * List session IDs for a specific diagram file.
   * Reads the first line of each .jsonl file to check the diagramFile in the session:start payload.
   */
  async listSessions(diagramFile: string): Promise<string[]> {
    await this.ensureDir();

    let entries: string[];
    try {
      entries = await readdir(this.sessionsDir);
    } catch {
      return [];
    }

    const matching: string[] = [];

    for (const entry of entries) {
      if (!entry.endsWith('.jsonl')) continue;

      const sessionId = entry.replace('.jsonl', '');
      try {
        const content = await readFile(join(this.sessionsDir, entry), 'utf-8');
        const firstLine = content.split('\n')[0];
        if (!firstLine) continue;
        const event = JSON.parse(firstLine) as SessionEvent;
        if (event.type === 'session:start' && event.payload.diagramFile === diagramFile) {
          matching.push(sessionId);
        }
      } catch {
        // Skip files that can't be read or parsed
      }
    }

    return matching;
  }

  /**
   * Get heatmap data for a diagram file: counts of node:visited events by nodeId.
   * Aggregates across all sessions for the given file.
   */
  async getHeatmapData(diagramFile: string): Promise<Record<string, number>> {
    const sessionIds = await this.listSessions(diagramFile);
    const counts: Record<string, number> = {};

    for (const sessionId of sessionIds) {
      const events = await this.readSession(sessionId);
      for (const event of events) {
        if (event.type === 'node:visited' && typeof event.payload.nodeId === 'string') {
          const nodeId = event.payload.nodeId;
          counts[nodeId] = (counts[nodeId] ?? 0) + 1;
        }
      }
    }

    return counts;
  }

  /** Get metadata for an active session, or undefined if not active */
  getActiveSession(sessionId: string): SessionMeta | undefined {
    return this.activeSessions.get(sessionId);
  }

  /** Compute summary statistics from a list of session events */
  private computeSummary(
    events: SessionEvent[],
    sessionId: string,
    diagramFile: string,
  ): SessionSummary {
    const startEvent = events.find((e) => e.type === 'session:start');
    const endEvent = events.find((e) => e.type === 'session:end');

    const startTs = startEvent?.ts ?? 0;
    const endTs = endEvent?.ts ?? Date.now();
    const duration = endTs - startTs;

    let nodesVisited = 0;
    const uniqueNodes = new Set<string>();
    let edgesTraversed = 0;

    for (const event of events) {
      if (event.type === 'node:visited') {
        nodesVisited++;
        if (typeof event.payload.nodeId === 'string') {
          uniqueNodes.add(event.payload.nodeId);
        }
      } else if (event.type === 'edge:traversed') {
        edgesTraversed++;
      }
    }

    return {
      sessionId,
      diagramFile,
      duration,
      totalEvents: events.length,
      nodesVisited,
      uniqueNodesVisited: uniqueNodes.size,
      edgesTraversed,
    };
  }
}
