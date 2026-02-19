import { readFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { DiagramService } from '../diagram/service.js';
import type { WebSocketManager } from './websocket.js';
import { resolveProjectPath } from '../utils/paths.js';
import { sendJson, type Route } from './server.js';
import {
  parseSubgraphs,
  generateCollapsedView,
  focusOnNode,
  navigateToBreadcrumb,
  getBreadcrumbs,
  createEmptyState,
  DEFAULT_CONFIG,
  type CollapseConfig,
  type CollapseState,
} from '../diagram/collapser.js';
import { serializeGraphModel } from '../diagram/graph-serializer.js';
import type { SessionStore } from '../session/session-store.js';
import { registerSessionRoutes } from './session-routes.js';
import { registerFileRoutes } from './file-routes.js';
import { registerBreakpointRoutes } from './breakpoint-routes.js';
import { registerGhostPathRoutes } from './ghost-path-routes.js';
import { registerAnnotationRoutes } from './annotation-routes.js';
import { registerMcpSessionRoutes } from './mcp-session-routes.js';
import { registerHeatmapRoutes, type HeatmapStore } from './heatmap-routes.js';
import { list as listWorkspaces } from '../registry/workspace-registry.js';

/**
 * Register all route handlers for the diagram viewer server.
 * Returns an array of routes matching method + URL pattern to handler functions.
 */
export function registerRoutes(
  service: DiagramService,
  projectDir: string,
  wsManager?: WebSocketManager,
  breakpointContinueSignals?: Map<string, boolean>,
  sessionStore?: SessionStore,
  heatmapStore?: HeatmapStore,
): Route[] {
  const routes: Route[] = [];

  // ── File CRUD routes (tree, save, delete, mkdir, move, rmdir) ──
  registerFileRoutes(routes, service, projectDir);

  // -------------------------------------------------------
  // GET /api/status -- Server diagnostics
  // -------------------------------------------------------
  routes.push({
    method: 'GET',
    pattern: new RegExp('^/api/status$'),
    handler: async (_req: IncomingMessage, res: ServerResponse) => {
      try {
        const files = await service.listFiles();

        const activeFlags: Array<{ file: string; nodeId: string; message: string }> = [];
        for (const file of files) {
          try {
            const flags = await service.getFlags(file);
            for (const flag of flags) {
              activeFlags.push({ file, nodeId: flag.nodeId, message: flag.message });
            }
          } catch {
            // Skip files that can't be read
          }
        }

        sendJson(res, {
          status: 'running',
          uptime: process.uptime(),
          port: null,
          projectDir,
          files: files.length,
          connectedClients: wsManager?.getClientCount() ?? 0,
          activeFlags,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        sendJson(res, { error: message }, 500);
      }
    },
  });

  // -------------------------------------------------------
  // GET /api/diagrams -- REST: List all diagrams
  // -------------------------------------------------------
  routes.push({
    method: 'GET',
    pattern: new RegExp('^/api/diagrams$'),
    handler: async (_req: IncomingMessage, res: ServerResponse) => {
      try {
        const files = await service.listFiles();
        sendJson(res, { files });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        sendJson(res, { error: message }, 500);
      }
    },
  });

  // -------------------------------------------------------
  // GET /api/diagrams/:file -- REST: Get diagram content
  // -------------------------------------------------------
  routes.push({
    method: 'GET',
    pattern: new RegExp('^/api/diagrams/(?<file>.+)$'),
    handler: async (req: IncomingMessage, res: ServerResponse, params: Record<string, string>) => {
      try {
        const file = decodeURIComponent(params['file']!);
        const diagram = await service.readDiagram(file);

        const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
        const collapsedParam = url.searchParams.get('collapsed');
        const configParam = url.searchParams.get('collapseConfig');
        const focusParam = url.searchParams.get('focus');
        const breadcrumbParam = url.searchParams.get('breadcrumb');

        let collapseConfig: CollapseConfig = { ...DEFAULT_CONFIG };
        if (configParam) {
          try {
            const userConfig = JSON.parse(configParam) as Partial<CollapseConfig>;
            collapseConfig = { ...DEFAULT_CONFIG, ...userConfig };
          } catch { /* use defaults */ }
        }

        const subgraphs = parseSubgraphs(diagram.mermaidContent);
        let userCollapsed: string[] = [];
        if (collapsedParam) {
          try {
            const parsed = JSON.parse(collapsedParam);
            if (Array.isArray(parsed)) userCollapsed = parsed as string[];
          } catch { /* ignore malformed collapsed param */ }
        }
        let state: CollapseState = {
          ...createEmptyState(),
          collapsed: new Set(userCollapsed),
        };

        if (focusParam) {
          state = focusOnNode(focusParam, subgraphs, state);
        } else if (breadcrumbParam) {
          state = navigateToBreadcrumb(breadcrumbParam, subgraphs, state);
        }

        const result = generateCollapsedView(
          diagram.mermaidContent,
          subgraphs,
          state,
          collapseConfig,
        );

        const breadcrumbs = getBreadcrumbs(state, subgraphs);

        sendJson(res, {
          filePath: diagram.filePath,
          mermaidContent: result.content,
          rawContent: diagram.mermaidContent,
          flags: Object.fromEntries(diagram.flags),
          validation: {
            valid: diagram.validation.valid,
            errors: diagram.validation.errors,
            diagramType: diagram.validation.diagramType,
          },
          collapse: {
            visibleNodes: result.visibleNodes,
            autoCollapsed: result.autoCollapsed,
            manualCollapsed: result.manualCollapsed,
            config: collapseConfig,
            breadcrumbs,
            focusedSubgraph: state.focusedSubgraph,
          },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        const code = (err as NodeJS.ErrnoException)?.code;
        sendJson(res, { error: message }, code === 'ENOENT' ? 404 : 500);
      }
    },
  });

  // -------------------------------------------------------
  // GET /api/graph/:file -- REST: Get graph model
  // -------------------------------------------------------
  routes.push({
    method: 'GET',
    pattern: new RegExp('^/api/graph/(?<file>.+)$'),
    handler: async (_req: IncomingMessage, res: ServerResponse, params: Record<string, string>) => {
      try {
        const file = decodeURIComponent(params['file']!);
        const graph = await service.readGraph(file);
        const json = serializeGraphModel(graph);
        sendJson(res, json);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        const code = (err as NodeJS.ErrnoException)?.code;
        sendJson(res, { error: message }, code === 'ENOENT' ? 404 : 500);
      }
    },
  });

  // ── Breakpoint routes ──
  registerBreakpointRoutes(routes, service, wsManager, breakpointContinueSignals);

  // ── Ghost path routes ──
  registerGhostPathRoutes(routes, service, wsManager);

  // ── Annotation routes (risk levels) ──
  registerAnnotationRoutes(routes, service);

  // ── Session routes ──
  if (sessionStore) {
    registerSessionRoutes(routes, sessionStore);
  }

  // ── Heatmap routes (click tracking + session data merge) ──
  if (heatmapStore) {
    registerHeatmapRoutes(routes, heatmapStore, sessionStore, wsManager);
  }

  // ── MCP Session discovery routes ──
  registerMcpSessionRoutes(routes, projectDir, wsManager);

  // -------------------------------------------------------
  // GET /api/workspaces -- List all registered workspace instances
  // -------------------------------------------------------
  routes.push({
    method: 'GET',
    pattern: new RegExp('^/api/workspaces$'),
    handler: async (_req: IncomingMessage, res: ServerResponse) => {
      try {
        const workspaces = await listWorkspaces();
        sendJson(res, workspaces);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        sendJson(res, { error: message }, 500);
      }
    },
  });

  // -------------------------------------------------------
  // GET /*.mmd -- Serve raw .mmd file content from project dir
  // (must be registered AFTER /api routes to avoid conflicts)
  // -------------------------------------------------------
  routes.push({
    method: 'GET',
    pattern: new RegExp('^/(?<mmdPath>.+\\.mmd)$'),
    handler: async (_req: IncomingMessage, res: ServerResponse, params: Record<string, string>) => {
      try {
        const filePath = params['mmdPath']!;
        const resolved = resolveProjectPath(projectDir, filePath);
        const content = await readFile(resolved, 'utf-8');
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(content);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        const code = (err as NodeJS.ErrnoException)?.code;
        sendJson(res, { error: message }, code === 'ENOENT' ? 404 : 500);
      }
    },
  });

  return routes;
}
