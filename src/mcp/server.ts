import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { DiagramService } from '../diagram/service.js';
import type { GhostPathStore } from '../server/ghost-store.js';
import type { WebSocketManager } from '../server/websocket.js';
import type { SessionStore } from '../session/session-store.js';
import { registerTools } from './tools.js';
import { registerResources } from './resources.js';
import { log } from '../utils/logger.js';

/** Options for starting the MCP server */
export interface McpServerOptions {
  dir: string;
  serve?: boolean;
  port?: number;
}

/** Optional dependencies for breakpoint/ghost path/session features */
export interface McpToolDependencies {
  ghostStore?: GhostPathStore;
  wsManager?: WebSocketManager;
  breakpointContinueSignals?: Map<string, boolean>;
  sessionStore?: SessionStore;
}

/**
 * Create an MCP server instance configured with the shared DiagramService.
 * Registers all tools and resources on the server.
 * When deps are provided, breakpoint and ghost path tools get full functionality.
 */
export function createMcpServer(
  service: DiagramService,
  deps?: McpToolDependencies,
): McpServer {
  const server = new McpServer({
    name: 'smartb-diagrams',
    version: '0.1.0',
  });

  registerTools(server, service, deps);
  registerResources(server, service);

  log.debug('MCP server created with 11 tools and 2 resources');

  return server;
}

/**
 * Start the MCP server on stdio transport.
 * Accepts an options object with dir, optional serve flag, and optional port.
 *
 * When serve=false (default): Starts MCP on stdio only (lightweight for AI tools).
 * When serve=true: Also starts HTTP+WS server sharing the same DiagramService,
 * so MCP tool calls that modify .mmd files trigger WebSocket broadcasts to browsers.
 *
 * CRITICAL: All logging goes to stderr (via log.*). Never write to stdout
 * -- it would corrupt the MCP JSON-RPC protocol stream.
 */
export async function startMcpServer(options: McpServerOptions): Promise<void> {
  const { resolve } = await import('node:path');
  const { DiagramService } = await import('../diagram/service.js');

  const resolvedDir = resolve(options.dir);
  const service = new DiagramService(resolvedDir);
  const transport = new StdioServerTransport();

  // Track HTTP server instance for cleanup (only when --serve)
  let httpCleanup: (() => Promise<void>) | undefined;
  let deps: McpToolDependencies | undefined;

  if (options.serve) {
    const { createHttpServer } = await import('../server/server.js');
    const { detect } = await import('detect-port');

    const preferredPort = options.port ?? 3333;
    const actualPort = await detect(preferredPort);
    if (actualPort !== preferredPort) {
      log.warn(`Port ${preferredPort} is in use, using port ${actualPort}`);
    }

    // Share the SAME DiagramService between MCP and HTTP servers
    const { httpServer, wsManager, fileWatcher, ghostStore, breakpointContinueSignals, sessionStore } =
      createHttpServer(resolvedDir, service);

    deps = { ghostStore, wsManager, breakpointContinueSignals, sessionStore };

    await new Promise<void>((resolvePromise) => {
      httpServer.listen(actualPort, () => {
        log.info(`HTTP+WS server running at http://localhost:${actualPort}`);
        resolvePromise();
      });
    });

    httpCleanup = async () => {
      log.info('Shutting down HTTP+WS server...');
      await fileWatcher.close();
      wsManager.close();
      await new Promise<void>((resolveClose) => {
        httpServer.close(() => resolveClose());
      });
    };
  }

  const server = createMcpServer(service, deps);

  await server.connect(transport);
  log.info(`MCP server running on stdio (project: ${resolvedDir})`);

  // Graceful shutdown handler
  const shutdown = async () => {
    log.info('Shutting down MCP server...');
    if (httpCleanup) {
      await httpCleanup();
    }
    process.exit(0);
  };

  // Parent process disconnected from stdio
  process.stdin.on('end', shutdown);

  // Signal handlers
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
