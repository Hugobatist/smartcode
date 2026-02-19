import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { detect } from 'detect-port';
import open from 'open';
import { DiagramService } from '../diagram/service.js';
import { getStaticDir } from '../utils/paths.js';
import { log } from '../utils/logger.js';
import { serveStaticFile } from './static.js';
import { registerRoutes } from './routes.js';
import { WebSocketManager } from './websocket.js';
import { FileWatcher } from '../watcher/file-watcher.js';
import { serializeGraphModel } from '../diagram/graph-serializer.js';
import { SessionStore } from '../session/session-store.js';
import { HeatmapStore } from './heatmap-routes.js';
import { register as registerWorkspace, deregister as deregisterWorkspace } from '../registry/workspace-registry.js';

/** Options for starting the HTTP server */
export interface ServerOptions {
  port: number;
  dir: string;
  openBrowser: boolean;
}

/** A route handler function */
export type Handler = (
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
) => void | Promise<void>;

/** A registered route with method, pattern, and handler */
export interface Route {
  method: string;
  pattern: RegExp;
  handler: Handler;
}

/** Allowed localhost origins for CORS */
const LOCALHOST_PATTERNS = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
  /^https?:\/\/\[::1\](:\d+)?$/,
];

/**
 * Set CORS headers on a response.
 * Only allows localhost origins (127.0.0.1, localhost, [::1]).
 */
function setCorsHeaders(req: IncomingMessage, res: ServerResponse): void {
  const origin = req.headers.origin;
  if (origin && LOCALHOST_PATTERNS.some((p) => p.test(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
}

/**
 * Send a JSON response with CORS headers.
 */
export function sendJson(res: ServerResponse, data: unknown, status = 200): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

/** Maximum allowed request body size (1 MB) */
const MAX_BODY_SIZE = 1 * 1024 * 1024;

/**
 * Read and parse a JSON body from an incoming request.
 * Enforces a size limit to prevent memory exhaustion (DoS).
 * Throws an error with message 'Payload too large' if the limit is exceeded.
 */
export async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let aborted = false;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        aborted = true;
        req.destroy();
        reject(new Error('Payload too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (aborted) return;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8')) as T);
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', (err) => {
      if (!aborted) reject(err);
    });
  });
}

/**
 * Create the HTTP request handler for the diagram server.
 * This is the core handler logic shared between startServer and createHttpServer.
 */
function createHandler(
  routes: Route[],
  staticDir: string,
) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host}`);

      // CORS headers on all responses (localhost-only)
      setCorsHeaders(req, res);

      // Handle OPTIONS preflight
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      // Try matching a registered route
      for (const route of routes) {
        if (req.method === route.method) {
          const match = route.pattern.exec(url.pathname);
          if (match) {
            const params = match.groups ?? {};
            await route.handler(req, res, params);
            return;
          }
        }
      }

      // Serve index: / or /index.html -> live.html
      if (url.pathname === '/' || url.pathname === '/index.html') {
        const served = await serveStaticFile(res, path.join(staticDir, 'live.html'));
        if (served) return;
      }

      // Try serving static file from static dir (with path traversal protection)
      const safePath = path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, '');
      const staticFilePath = path.join(staticDir, safePath);
      if (staticFilePath === staticDir || staticFilePath.startsWith(staticDir + path.sep)) {
        const served = await serveStaticFile(res, staticFilePath);
        if (served) return;
      }

      // 404
      sendJson(res, { error: 'Not Found' }, 404);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal Server Error';
      log.error('Request error:', message);
      sendJson(res, { error: message }, 500);
    }
  };
}

/** The composite server instance returned by createHttpServer */
export interface ServerInstance {
  httpServer: ReturnType<typeof createServer>;
  wsManager: WebSocketManager;
  fileWatcher: FileWatcher;
  breakpointContinueSignals: Map<string, boolean>;
  sessionStore: SessionStore;
  heatmapStore: HeatmapStore;
  /** Add a new project directory with its own FileWatcher and WebSocket namespace */
  addProject: (name: string, dir: string) => void;
  /** Close all FileWatcher instances (default + named projects) */
  closeAllWatchers: () => Promise<void>;
}

/**
 * Create an http.Server instance for the given project directory.
 * Used for integration testing (port 0) and as the core of startServer.
 * Returns a ServerInstance with httpServer, wsManager, fileWatcher, and addProject().
 *
 * The default project connects on /ws. Named projects connect on /ws/project-name.
 */
export function createHttpServer(projectDir: string, existingService?: DiagramService): ServerInstance {
  const resolvedDir = path.resolve(projectDir);
  const service = existingService ?? new DiagramService(resolvedDir);
  const staticDir = getStaticDir();

  const httpServer = createServer();
  const wsManager = new WebSocketManager(httpServer);
  const breakpointContinueSignals = new Map<string, boolean>();
  const sessionStore = new SessionStore(resolvedDir);
  const heatmapStore = new HeatmapStore();

  const routes = registerRoutes(service, resolvedDir, wsManager, breakpointContinueSignals, sessionStore, heatmapStore);
  const handler = createHandler(routes, staticDir);

  httpServer.on('request', (req, res) => {
    handler(req, res).catch((err) => {
      log.error('Unhandled error:', err);
      if (!res.headersSent) {
        sendJson(res, { error: 'Internal Server Error' }, 500);
      }
    });
  });

  // Track all watchers for cleanup
  const watchers = new Map<string, FileWatcher>();

  /** Create a FileWatcher for a project directory with standard broadcast callbacks */
  function createProjectWatcher(
    projectName: string, projectDir: string, projectService: DiagramService,
  ): FileWatcher {
    return new FileWatcher(
      projectDir,
      async (file) => {
        const content = await readFile(
          path.join(projectDir, file), 'utf-8',
        ).catch(() => null);
        if (content !== null) {
          wsManager.broadcast(projectName, { type: 'file:changed', file, content });
        }
        try {
          const graph = await projectService.readGraph(file);
          const graphJson = serializeGraphModel(graph);
          wsManager.broadcast(projectName, { type: 'graph:update', file, graph: graphJson });
        } catch {
          // Parse failure -- file:changed already sent, browser falls back to Mermaid
        }
      },
      (file) => {
        wsManager.broadcast(projectName, { type: 'file:added', file });
        projectService.listFiles().then((files) => {
          wsManager.broadcast(projectName, { type: 'tree:updated', files });
        }).catch((err) => { log.error(`Failed to list files for ${projectName} after add:`, err); });
      },
      (file) => {
        wsManager.broadcast(projectName, { type: 'file:removed', file });
        projectService.listFiles().then((files) => {
          wsManager.broadcast(projectName, { type: 'tree:updated', files });
        }).catch((err) => { log.error(`Failed to list files for ${projectName} after remove:`, err); });
      },
    );
  }

  const fileWatcher = createProjectWatcher('default', resolvedDir, service);
  watchers.set('default', fileWatcher);

  /** Add a new project directory with its own FileWatcher and WebSocket namespace */
  function addProject(name: string, dir: string): void {
    const resolvedProjectDir = path.resolve(dir);
    const projectService = new DiagramService(resolvedProjectDir);
    wsManager.addProject(name);
    watchers.set(name, createProjectWatcher(name, resolvedProjectDir, projectService));
  }

  /** Close all FileWatcher instances (default + named projects) */
  async function closeAllWatchers(): Promise<void> {
    for (const w of watchers.values()) {
      await w.close();
    }
    watchers.clear();
  }

  return { httpServer, wsManager, fileWatcher, breakpointContinueSignals, sessionStore, heatmapStore, addProject, closeAllWatchers };
}

/**
 * Start the HTTP server for the diagram viewer.
 *
 * - Creates a DiagramService bound to the project directory
 * - Detects an available port (falls back if preferred port is in use)
 * - Serves static assets from getStaticDir() and diagram files from project dir
 * - Registers all routes (live.html endpoints + REST API)
 * - Opens the browser automatically (unless disabled)
 * - Handles graceful shutdown on SIGINT
 */
export async function startServer(options: ServerOptions): Promise<void> {
  const projectDir = path.resolve(options.dir);

  const actualPort = await detect(options.port);
  if (actualPort !== options.port) {
    log.warn(`Port ${options.port} is in use, using port ${actualPort}`);
  }

  const service = new DiagramService(projectDir);
  const { httpServer, wsManager, closeAllWatchers } = createHttpServer(projectDir, service);

  // Check for .mmd files and warn if none found
  const mmdFiles = await service.listFiles();
  if (mmdFiles.length === 0) {
    log.warn('No .mmd files found in ' + projectDir);
    log.warn("Run 'smartb init' to create a sample diagram, or create a .mmd file manually.");
  }

  httpServer.listen(actualPort, () => {
    const url = `http://localhost:${actualPort}`;
    log.info(`Server running at ${url}`);
    log.info(`Serving diagrams from ${projectDir}`);
    if (options.openBrowser) {
      open(url).catch(() => {
        log.warn('Could not open browser automatically');
      });
    }
  });

  // Register in workspace registry
  await registerWorkspace(projectDir, actualPort).catch((err) => {
    log.warn('Failed to register workspace:', err instanceof Error ? err.message : err);
  });

  // Graceful shutdown
  process.once('SIGINT', async () => {
    log.info('Shutting down...');
    const shutdownTimeout = setTimeout(() => {
      log.warn('Shutdown timed out after 5s, forcing exit');
      process.exit(1);
    }, 5000);
    try {
      await deregisterWorkspace(actualPort).catch(() => {});
      await closeAllWatchers().catch(() => {});
      wsManager.close();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    } finally {
      clearTimeout(shutdownTimeout);
      process.exit(0);
    }
  });
}
