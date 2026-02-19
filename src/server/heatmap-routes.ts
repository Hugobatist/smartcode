import type { IncomingMessage, ServerResponse } from 'node:http';
import type { SessionStore } from '../session/session-store.js';
import type { WebSocketManager } from './websocket.js';
import { sendJson, readJsonBody, type Route } from './server.js';

/**
 * In-memory store for browser click frequency data.
 * Stores nodeId -> click count per file.
 * Ephemeral: cleared on server restart (session JSONL provides persistent data).
 */
export class HeatmapStore {
  private data = new Map<string, Map<string, number>>();

  /** Merge incoming counts into the store for a given file */
  increment(file: string, counts: Record<string, number>): void {
    let fileMap = this.data.get(file);
    if (!fileMap) {
      fileMap = new Map();
      this.data.set(file, fileMap);
    }
    for (const [nodeId, count] of Object.entries(counts)) {
      if (typeof count !== 'number' || count < 0) continue;
      fileMap.set(nodeId, (fileMap.get(nodeId) ?? 0) + count);
    }
  }

  /** Get click counts for a file as a plain object */
  getCounts(file: string): Record<string, number> {
    const fileMap = this.data.get(file);
    if (!fileMap) return {};
    const result: Record<string, number> = {};
    for (const [nodeId, count] of fileMap) {
      result[nodeId] = count;
    }
    return result;
  }

  /** Clear counts for a specific file (used in testing) */
  clear(file: string): void {
    this.data.delete(file);
  }

  /** Clear all data (used in testing) */
  clearAll(): void {
    this.data.clear();
  }
}

/**
 * Merge two count objects. Returns a new object with summed counts.
 */
function mergeCounts(
  a: Record<string, number>,
  b: Record<string, number>,
): Record<string, number> {
  const result = { ...a };
  for (const [key, value] of Object.entries(b)) {
    result[key] = (result[key] ?? 0) + value;
  }
  return result;
}

/**
 * Register heatmap REST endpoints.
 * Adds 2 routes:
 *   GET  /api/heatmap/:file           -- get merged heatmap data (clicks + sessions)
 *   POST /api/heatmap/:file/increment -- increment click counts from browser
 */
export function registerHeatmapRoutes(
  routes: Route[],
  heatmapStore: HeatmapStore,
  sessionStore: SessionStore | undefined,
  wsManager: WebSocketManager | undefined,
): void {
  // -------------------------------------------------------
  // GET /api/heatmap/:file -- Get merged heatmap data
  // -------------------------------------------------------
  routes.push({
    method: 'GET',
    pattern: new RegExp('^/api/heatmap/(?<file>.+)$'),
    handler: async (_req: IncomingMessage, res: ServerResponse, params: Record<string, string>) => {
      try {
        const file = decodeURIComponent(params['file']!);

        // Get click counts from in-memory store
        const clickCounts = heatmapStore.getCounts(file);

        // Get session counts from persistent store
        let sessionCounts: Record<string, number> = {};
        if (sessionStore) {
          try {
            sessionCounts = await sessionStore.getHeatmapData(file);
          } catch {
            // Session store errors shouldn't block click data
          }
        }

        // Merge both sources
        const merged = mergeCounts(clickCounts, sessionCounts);
        sendJson(res, merged);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        sendJson(res, { error: message }, 500);
      }
    },
  });

  // -------------------------------------------------------
  // POST /api/heatmap/:file/increment -- Increment click counts
  // -------------------------------------------------------
  routes.push({
    method: 'POST',
    pattern: new RegExp('^/api/heatmap/(?<file>.+)/increment$'),
    handler: async (req: IncomingMessage, res: ServerResponse, params: Record<string, string>) => {
      try {
        const file = decodeURIComponent(params['file']!);
        const body = await readJsonBody<{ counts?: Record<string, number> }>(req);

        if (!body.counts || typeof body.counts !== 'object') {
          sendJson(res, { error: 'Missing or invalid "counts" field' }, 400);
          return;
        }

        // Validate that all values are positive numbers
        for (const [key, value] of Object.entries(body.counts)) {
          if (typeof key !== 'string' || typeof value !== 'number' || value < 0) {
            sendJson(res, { error: 'Invalid count entry' }, 400);
            return;
          }
        }

        heatmapStore.increment(file, body.counts);

        // Broadcast updated heatmap to browsers
        if (wsManager) {
          const allCounts = heatmapStore.getCounts(file);
          // Merge with session data for complete picture
          let sessionCounts: Record<string, number> = {};
          if (sessionStore) {
            try {
              sessionCounts = await sessionStore.getHeatmapData(file);
            } catch {
              // Non-fatal
            }
          }
          const merged = mergeCounts(allCounts, sessionCounts);
          wsManager.broadcastAll({
            type: 'heatmap:update',
            file,
            data: merged,
          });
        }

        sendJson(res, { ok: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        if (message === 'Invalid JSON' || message === 'Payload too large') {
          sendJson(res, { error: message }, 400);
          return;
        }
        sendJson(res, { error: message }, 500);
      }
    },
  });
}
