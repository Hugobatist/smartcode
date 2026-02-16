import { readFile, writeFile, mkdir, unlink, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { DiagramService } from '../diagram/service.js';
import type { WebSocketManager } from './websocket.js';
import { resolveProjectPath } from '../utils/paths.js';
import { sendJson, readJsonBody, type Route } from './server.js';
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

/**
 * A node in the file tree returned by /tree.json.
 */
interface TreeNode {
  type: 'file' | 'folder';
  name: string;
  path?: string;
  children?: TreeNode[];
}

/**
 * Convert a flat list of relative file paths into a nested tree structure.
 * Used by /tree.json to match the format expected by live.html sidebar.
 */
function buildFileTree(files: string[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const filePath of files) {
    const parts = filePath.split('/');
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      const isFile = i === parts.length - 1;

      if (isFile) {
        current.push({ type: 'file', name: part, path: filePath });
      } else {
        let folder = current.find(
          (n) => n.type === 'folder' && n.name === part,
        );
        if (!folder) {
          folder = { type: 'folder', name: part, children: [] };
          current.push(folder);
        }
        current = folder.children!;
      }
    }
  }

  return root;
}

/**
 * Register all route handlers for the diagram viewer server.
 * Returns an array of routes matching method + URL pattern to handler functions.
 *
 * Routes handle two categories:
 * 1. live.html endpoints: tree.json, .mmd serving, /save, /delete, /mkdir, /move
 * 2. REST API endpoints: GET /api/diagrams, GET /api/diagrams/:file
 */
export function registerRoutes(service: DiagramService, projectDir: string, wsManager?: WebSocketManager): Route[] {
  const routes: Route[] = [];

  // -------------------------------------------------------
  // 1. GET /tree.json -- File tree for sidebar
  // -------------------------------------------------------
  routes.push({
    method: 'GET',
    pattern: new RegExp('^/tree\\.json$'),
    handler: async (_req: IncomingMessage, res: ServerResponse) => {
      try {
        const files = await service.listFiles();
        const tree = buildFileTree(files);
        sendJson(res, tree);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        sendJson(res, { error: message }, 500);
      }
    },
  });

  // -------------------------------------------------------
  // 2. POST /save -- Save diagram content
  // -------------------------------------------------------
  routes.push({
    method: 'POST',
    pattern: new RegExp('^/save$'),
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      try {
        const body = await readJsonBody<{ filename: string; content: string }>(req);
        if (!body.filename || body.content === undefined) {
          sendJson(res, { error: 'Missing filename or content' }, 400);
          return;
        }
        const resolved = resolveProjectPath(projectDir, body.filename);
        await mkdir(path.dirname(resolved), { recursive: true });
        await writeFile(resolved, body.content, 'utf-8');
        sendJson(res, { ok: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        if (message === 'Payload too large') { sendJson(res, { error: message }, 413); return; }
        const code = (err as NodeJS.ErrnoException)?.code;
        sendJson(res, { error: message }, code === 'ENOENT' ? 404 : 500);
      }
    },
  });

  // -------------------------------------------------------
  // 3. POST /delete -- Delete diagram file
  // -------------------------------------------------------
  routes.push({
    method: 'POST',
    pattern: new RegExp('^/delete$'),
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      try {
        const body = await readJsonBody<{ filename: string }>(req);
        if (!body.filename) {
          sendJson(res, { error: 'Missing filename' }, 400);
          return;
        }
        const resolved = resolveProjectPath(projectDir, body.filename);
        await unlink(resolved);
        sendJson(res, { ok: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        if (message === 'Payload too large') { sendJson(res, { error: message }, 413); return; }
        const code = (err as NodeJS.ErrnoException)?.code;
        sendJson(res, { error: message }, code === 'ENOENT' ? 404 : 500);
      }
    },
  });

  // -------------------------------------------------------
  // 4. POST /mkdir -- Create directory
  // -------------------------------------------------------
  routes.push({
    method: 'POST',
    pattern: new RegExp('^/mkdir$'),
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      try {
        const body = await readJsonBody<{ folder: string }>(req);
        if (!body.folder) {
          sendJson(res, { error: 'Missing folder' }, 400);
          return;
        }
        const resolved = resolveProjectPath(projectDir, body.folder);
        await mkdir(resolved, { recursive: true });
        sendJson(res, { ok: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        if (message === 'Payload too large') { sendJson(res, { error: message }, 413); return; }
        sendJson(res, { error: message }, 500);
      }
    },
  });

  // -------------------------------------------------------
  // 5. POST /move -- Rename/move file
  // -------------------------------------------------------
  routes.push({
    method: 'POST',
    pattern: new RegExp('^/move$'),
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      try {
        const body = await readJsonBody<{ from: string; to: string }>(req);
        if (!body.from || !body.to) {
          sendJson(res, { error: 'Missing from or to' }, 400);
          return;
        }
        const resolvedFrom = resolveProjectPath(projectDir, body.from);
        const resolvedTo = resolveProjectPath(projectDir, body.to);
        await mkdir(path.dirname(resolvedTo), { recursive: true });
        await rename(resolvedFrom, resolvedTo);
        sendJson(res, { ok: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        if (message === 'Payload too large') { sendJson(res, { error: message }, 413); return; }
        const code = (err as NodeJS.ErrnoException)?.code;
        sendJson(res, { error: message }, code === 'ENOENT' ? 404 : 500);
      }
    },
  });

  // -------------------------------------------------------
  // 6. POST /rmdir -- Delete directory recursively
  // -------------------------------------------------------
  routes.push({
    method: 'POST',
    pattern: new RegExp('^/rmdir$'),
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      try {
        const body = await readJsonBody<{ folder: string }>(req);
        if (!body.folder) {
          sendJson(res, { error: 'Missing folder' }, 400);
          return;
        }
        const resolved = resolveProjectPath(projectDir, body.folder);
        await rm(resolved, { recursive: true });
        sendJson(res, { ok: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        if (message === 'Payload too large') { sendJson(res, { error: message }, 413); return; }
        const code = (err as NodeJS.ErrnoException)?.code;
        sendJson(res, { error: message }, code === 'ENOENT' ? 404 : 500);
      }
    },
  });

  // -------------------------------------------------------
  // 7. GET /api/status -- Server diagnostics
  // -------------------------------------------------------
  routes.push({
    method: 'GET',
    pattern: new RegExp('^/api/status$'),
    handler: async (_req: IncomingMessage, res: ServerResponse) => {
      try {
        const files = await service.listFiles();

        // Collect active flags across all files
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
  // 8. GET /api/diagrams -- REST: List all diagrams
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
  // 9. GET /api/diagrams/:file -- REST: Get diagram content
  //    Query params:
  //      collapsed     - JSON array of manually collapsed subgraph IDs
  //      collapseConfig - JSON object to override DEFAULT_CONFIG
  //      focus         - node ID to enter focus mode on
  //      breadcrumb    - breadcrumb ID to navigate to
  // -------------------------------------------------------
  routes.push({
    method: 'GET',
    pattern: new RegExp('^/api/diagrams/(?<file>.+)$'),
    handler: async (req: IncomingMessage, res: ServerResponse, params: Record<string, string>) => {
      try {
        const file = decodeURIComponent(params['file']!);
        const diagram = await service.readDiagram(file);

        // Parse query params for collapse integration
        const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
        const collapsedParam = url.searchParams.get('collapsed');
        const configParam = url.searchParams.get('collapseConfig');
        const focusParam = url.searchParams.get('focus');
        const breadcrumbParam = url.searchParams.get('breadcrumb');

        // Build collapse config
        let collapseConfig: CollapseConfig = { ...DEFAULT_CONFIG };
        if (configParam) {
          try {
            const userConfig = JSON.parse(configParam) as Partial<CollapseConfig>;
            collapseConfig = { ...DEFAULT_CONFIG, ...userConfig };
          } catch { /* use defaults */ }
        }

        // Parse subgraphs and build collapse state
        const subgraphs = parseSubgraphs(diagram.mermaidContent);
        const userCollapsed: string[] = collapsedParam ? JSON.parse(collapsedParam) as string[] : [];
        let state: CollapseState = {
          ...createEmptyState(),
          collapsed: new Set(userCollapsed),
        };

        // Handle focus mode
        if (focusParam) {
          state = focusOnNode(focusParam, subgraphs, state);
        } else if (breadcrumbParam) {
          state = navigateToBreadcrumb(breadcrumbParam, subgraphs, state);
        }

        // Generate collapsed view (applies auto-collapse if enabled)
        const result = generateCollapsedView(
          diagram.mermaidContent,
          subgraphs,
          state,
          collapseConfig,
        );

        // Build breadcrumbs for current state
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
  // 10. GET /api/graph/:file -- REST: Get graph model (structured layout data)
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

  // -------------------------------------------------------
  // 11. GET /*.mmd -- Serve raw .mmd file content from project dir
  //     (must be registered AFTER /api routes to avoid conflicts)
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
