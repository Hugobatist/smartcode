import type { IncomingMessage, ServerResponse } from 'node:http';
import type { SessionStore } from '../session/session-store.js';
import { sendJson, type Route } from './server.js';

/**
 * Register session and heatmap REST endpoints.
 * Adds 3 routes to the provided routes array:
 *   GET /api/sessions/:file  -- list sessions for a diagram file
 *   GET /api/session/:id     -- get full session events
 *   GET /api/heatmap/:file   -- get heatmap aggregation data
 */
export function registerSessionRoutes(routes: Route[], sessionStore: SessionStore): void {
  // -------------------------------------------------------
  // GET /api/sessions/:file -- List sessions for a diagram file
  // -------------------------------------------------------
  routes.push({
    method: 'GET',
    pattern: new RegExp('^/api/sessions/(?<file>.+)$'),
    handler: async (_req: IncomingMessage, res: ServerResponse, params: Record<string, string>) => {
      try {
        const file = decodeURIComponent(params['file']!);
        const sessions = await sessionStore.listSessions(file);
        sendJson(res, { sessions });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        sendJson(res, { error: message }, 500);
      }
    },
  });

  // -------------------------------------------------------
  // GET /api/session/:id -- Get full session events
  // -------------------------------------------------------
  routes.push({
    method: 'GET',
    pattern: new RegExp('^/api/session/(?<id>[^/]+)$'),
    handler: async (_req: IncomingMessage, res: ServerResponse, params: Record<string, string>) => {
      try {
        const id = decodeURIComponent(params['id']!);
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) {
          sendJson(res, { error: 'Invalid session ID' }, 400);
          return;
        }
        const events = await sessionStore.readSession(id);
        if (events.length === 0) {
          sendJson(res, { error: 'Session not found' }, 404);
          return;
        }
        sendJson(res, { events });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        sendJson(res, { error: message }, 500);
      }
    },
  });

  // -------------------------------------------------------
  // GET /api/heatmap/:file -- Get heatmap aggregation data
  // -------------------------------------------------------
  routes.push({
    method: 'GET',
    pattern: new RegExp('^/api/heatmap/(?<file>.+)$'),
    handler: async (_req: IncomingMessage, res: ServerResponse, params: Record<string, string>) => {
      try {
        const file = decodeURIComponent(params['file']!);
        const data = await sessionStore.getHeatmapData(file);
        sendJson(res, data);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        sendJson(res, { error: message }, 500);
      }
    },
  });
}
