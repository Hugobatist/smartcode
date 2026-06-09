import type { IncomingMessage, ServerResponse } from 'node:http';
import { McpSessionRegistry } from '../registry/mcp-session-registry.js';
import { sendJson, readJsonBody, type Route } from './server.js';
import type { WebSocketManager } from './websocket.js';

/**
 * Register REST endpoints for MCP session discovery.
 *   GET    /api/mcp-sessions        -- list all active AI sessions
 *   GET    /api/mcp-sessions/:id    -- get details of a specific session
 *   PATCH  /api/mcp-sessions/:id    -- rename a session label
 *   DELETE /api/mcp-sessions/:id    -- delete a session manifest from disk
 */
export function registerMcpSessionRoutes(
  routes: Route[],
  projectDir: string,
  wsManager?: WebSocketManager,
): void {
  // -------------------------------------------------------
  // GET /api/mcp-sessions -- List all active MCP sessions
  // -------------------------------------------------------
  routes.push({
    method: 'GET',
    pattern: new RegExp('^/api/mcp-sessions$'),
    handler: async (_req: IncomingMessage, res: ServerResponse) => {
      try {
        const sessions = await McpSessionRegistry.listActive(projectDir);
        sendJson(res, { sessions });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        sendJson(res, { error: message }, 500);
      }
    },
  });

  // -------------------------------------------------------
  // GET /api/mcp-sessions/:id -- Get a specific MCP session
  // -------------------------------------------------------
  routes.push({
    method: 'GET',
    pattern: new RegExp('^/api/mcp-sessions/(?<id>[^/]+)$'),
    handler: async (_req: IncomingMessage, res: ServerResponse, params: Record<string, string>) => {
      try {
        const id = decodeURIComponent(params['id']!);
        const session = await McpSessionRegistry.getSession(projectDir, id);
        if (!session) {
          sendJson(res, { error: 'Session not found' }, 404);
          return;
        }
        sendJson(res, session);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        sendJson(res, { error: message }, 500);
      }
    },
  });

  // -------------------------------------------------------
  // PATCH /api/mcp-sessions/:id -- Rename a session label
  // -------------------------------------------------------
  routes.push({
    method: 'PATCH',
    pattern: new RegExp('^/api/mcp-sessions/(?<id>[^/]+)$'),
    handler: async (req: IncomingMessage, res: ServerResponse, params: Record<string, string>) => {
      try {
        const id = decodeURIComponent(params['id']!);
        const body = await readJsonBody<{ label?: string }>(req);
        const label = body?.label;

        if (!label || typeof label !== 'string' || !label.trim()) {
          sendJson(res, { error: 'label is required' }, 400);
          return;
        }

        const ok = await McpSessionRegistry.renameOnDisk(projectDir, id, label.trim());
        if (!ok) {
          sendJson(res, { error: 'Session not found' }, 404);
          return;
        }

        if (wsManager) {
          wsManager.broadcastAll({ type: 'mcp-session:updated' });
        }

        sendJson(res, { ok: true, sessionId: id, label: label.trim() });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        sendJson(res, { error: message }, 500);
      }
    },
  });

  // -------------------------------------------------------
  // DELETE /api/mcp-sessions/:id -- Delete a session manifest
  // -------------------------------------------------------
  routes.push({
    method: 'DELETE',
    pattern: new RegExp('^/api/mcp-sessions/(?<id>[^/]+)$'),
    handler: async (_req: IncomingMessage, res: ServerResponse, params: Record<string, string>) => {
      try {
        const id = decodeURIComponent(params['id']!);
        const result = await McpSessionRegistry.deleteOnDisk(projectDir, id);
        if (result === 'not-found') {
          sendJson(res, { error: 'Session not found' }, 404);
          return;
        }

        if (wsManager) {
          wsManager.broadcastAll({ type: 'mcp-session:updated' });
        }

        sendJson(res, { ok: true, sessionId: id });
      } catch (err) {
        // Erro de IO inesperado (ex.: permissão) -- deleteOnDisk relança.
        const message = err instanceof Error ? err.message : 'Unknown error';
        sendJson(res, { error: message }, 500);
      }
    },
  });
}
