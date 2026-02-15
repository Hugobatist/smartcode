import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { DiagramService } from '../diagram/service.js';
import { registerTools } from './tools.js';
import { registerResources } from './resources.js';
import { log } from '../utils/logger.js';

/**
 * Create an MCP server instance configured with the shared DiagramService.
 * Registers all tools and resources on the server.
 */
export function createMcpServer(service: DiagramService): McpServer {
  const server = new McpServer({
    name: 'smartb-diagrams',
    version: '0.1.0',
  });

  registerTools(server, service);
  registerResources(server, service);

  log.debug('MCP server created with 4 tools and 2 resources');

  return server;
}

/**
 * Start the MCP server on stdio transport.
 * Creates a DiagramService bound to the given project directory
 * and connects the MCP server to StdioServerTransport.
 *
 * CRITICAL: All logging goes to stderr (via log.*). Never write to stdout
 * -- it would corrupt the MCP JSON-RPC protocol stream.
 */
export async function startMcpServer(projectDir: string): Promise<void> {
  const { resolve } = await import('node:path');
  const { DiagramService } = await import('../diagram/service.js');

  const resolvedDir = resolve(projectDir);
  const service = new DiagramService(resolvedDir);
  const server = createMcpServer(service);
  const transport = new StdioServerTransport();

  await server.connect(transport);
  log.info(`MCP server running on stdio (project: ${resolvedDir})`);
}
