import type { IncomingMessage, ServerResponse } from 'node:http';
import type { SessionStore } from '../session/session-store.js';
import { sendJson, type Route } from './server.js';

/**
 * Register session REST endpoints.
 * Adds 2 routes to the provided routes array:
 *   GET /api/sessions/:file  -- list sessions for a diagram file
 *   GET /api/session/:id     -- get full session events
 *
 * Note: Heatmap endpoints moved to heatmap-routes.ts (Phase 19).
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
        const sessionIds = await sessionStore.listSessions(file);

        // Enrich each session ID with summary data (totalEvents, duration)
        const sessions = await Promise.all(
          sessionIds.map(async (sessionId) => {
            try {
              const events = await sessionStore.readSession(sessionId);
              const startEvent = events.find((e) => e.type === 'session:start');
              const endEvent = events.find((e) => e.type === 'session:end');
              const startTs = startEvent?.ts ?? 0;
              const endTs = endEvent?.ts ?? (events.length > 0 ? events[events.length - 1]!.ts : 0);
              return {
                sessionId,
                totalEvents: events.length,
                duration: endTs - startTs,
                startedAt: startTs,
              };
            } catch {
              return { sessionId, totalEvents: 0, duration: 0, startedAt: 0 };
            }
          }),
        );

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

}
