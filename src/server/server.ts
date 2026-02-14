import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import { detect } from 'detect-port';
import open from 'open';
import { DiagramService } from '../diagram/service.js';
import { getStaticDir } from '../utils/paths.js';
import { log } from '../utils/logger.js';
import { serveStaticFile } from './static.js';
import { registerRoutes } from './routes.js';

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

/**
 * Set CORS headers on a response.
 * Allows all origins for local dev server usage.
 */
function setCorsHeaders(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

/**
 * Send a JSON response with CORS headers.
 */
export function sendJson(res: ServerResponse, data: unknown, status = 200): void {
  const body = JSON.stringify(data);
  setCorsHeaders(res);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

/**
 * Read and parse a JSON body from an incoming request.
 */
export async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf-8')) as T;
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

      // CORS headers on all responses
      setCorsHeaders(res);

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
      if (staticFilePath.startsWith(staticDir)) {
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

/**
 * Create an http.Server instance for the given project directory.
 * Used for integration testing (port 0) and as the core of startServer.
 * Returns the raw http.Server so the caller controls listening and shutdown.
 */
export function createHttpServer(projectDir: string): ReturnType<typeof createServer> {
  const resolvedDir = path.resolve(projectDir);
  const service = new DiagramService(resolvedDir);
  const staticDir = getStaticDir();
  const routes = registerRoutes(service, resolvedDir);
  const handler = createHandler(routes, staticDir);

  return createServer((req, res) => {
    handler(req, res).catch((err) => {
      log.error('Unhandled error:', err);
      if (!res.headersSent) {
        sendJson(res, { error: 'Internal Server Error' }, 500);
      }
    });
  });
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

  const server = createHttpServer(projectDir);

  server.listen(actualPort, () => {
    const url = `http://localhost:${actualPort}`;
    log.info(`Server running at ${url}`);
    log.info(`Serving diagrams from ${projectDir}`);
    if (options.openBrowser) {
      open(url).catch(() => {
        log.warn('Could not open browser automatically');
      });
    }
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    log.info('Shutting down...');
    server.close(() => process.exit(0));
  });
}
