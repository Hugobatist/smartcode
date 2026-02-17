import type { IncomingMessage, ServerResponse } from 'node:http';
import type { DiagramService } from '../diagram/service.js';
import type { WebSocketManager } from './websocket.js';
import { sendJson, readJsonBody, type Route } from './server.js';

/**
 * Register breakpoint REST endpoints.
 * Follows the same pattern as session-routes.ts.
 */
export function registerBreakpointRoutes(
  routes: Route[],
  service: DiagramService,
  wsManager?: WebSocketManager,
  breakpointContinueSignals?: Map<string, boolean>,
): void {
  // -------------------------------------------------------
  // POST /api/breakpoints/:file/continue -- Signal continue past breakpoint
  // (must be registered BEFORE the general breakpoints route)
  // -------------------------------------------------------
  routes.push({
    method: 'POST',
    pattern: new RegExp('^/api/breakpoints/(?<file>.+)/continue$'),
    handler: async (req: IncomingMessage, res: ServerResponse, params: Record<string, string>) => {
      try {
        const file = decodeURIComponent(params['file']!);
        const body = await readJsonBody<{ nodeId: string }>(req);
        if (!body.nodeId) {
          sendJson(res, { error: 'Missing nodeId' }, 400);
          return;
        }
        if (breakpointContinueSignals) {
          // Prevent unbounded growth: evict oldest if map exceeds 500 entries
          if (breakpointContinueSignals.size >= 500) {
            const firstKey = breakpointContinueSignals.keys().next().value;
            if (firstKey !== undefined) breakpointContinueSignals.delete(firstKey);
          }
          breakpointContinueSignals.set(`${file}:${body.nodeId}`, true);
        }
        if (wsManager) {
          wsManager.broadcastAll({ type: 'breakpoint:continue', file, nodeId: body.nodeId });
        }
        sendJson(res, { ok: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        if (message === 'Payload too large') { sendJson(res, { error: message }, 413); return; }
        sendJson(res, { error: message }, 500);
      }
    },
  });

  // -------------------------------------------------------
  // GET /api/breakpoints/:file -- Get all breakpoints for a file
  // -------------------------------------------------------
  routes.push({
    method: 'GET',
    pattern: new RegExp('^/api/breakpoints/(?<file>.+)$'),
    handler: async (_req: IncomingMessage, res: ServerResponse, params: Record<string, string>) => {
      try {
        const file = decodeURIComponent(params['file']!);
        const breakpoints = await service.getBreakpoints(file);
        sendJson(res, { breakpoints: Array.from(breakpoints) });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        const code = (err as NodeJS.ErrnoException)?.code;
        sendJson(res, { error: message }, code === 'ENOENT' ? 404 : 500);
      }
    },
  });

  // -------------------------------------------------------
  // POST /api/breakpoints/:file -- Set or remove a breakpoint
  // -------------------------------------------------------
  routes.push({
    method: 'POST',
    pattern: new RegExp('^/api/breakpoints/(?<file>.+)$'),
    handler: async (req: IncomingMessage, res: ServerResponse, params: Record<string, string>) => {
      try {
        const file = decodeURIComponent(params['file']!);
        const body = await readJsonBody<{ nodeId: string; action: 'set' | 'remove' }>(req);
        if (!body.nodeId || !body.action) {
          sendJson(res, { error: 'Missing nodeId or action' }, 400);
          return;
        }
        if (body.action === 'set') {
          await service.setBreakpoint(file, body.nodeId);
          if (wsManager) {
            wsManager.broadcastAll({ type: 'breakpoint:hit', file, nodeId: body.nodeId });
          }
        } else {
          await service.removeBreakpoint(file, body.nodeId);
        }
        sendJson(res, { ok: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        if (message === 'Payload too large') { sendJson(res, { error: message }, 413); return; }
        const code = (err as NodeJS.ErrnoException)?.code;
        sendJson(res, { error: message }, code === 'ENOENT' ? 404 : 500);
      }
    },
  });
}
