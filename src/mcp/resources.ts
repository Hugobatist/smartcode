import {
  McpServer,
  ResourceTemplate,
} from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DiagramService } from '../diagram/service.js';

/**
 * Register all 2 MCP resources on the server, backed by DiagramService.
 *
 * Resources:
 * - diagram-list: List of all .mmd files in the project (fixed URI)
 * - diagram-content: Content of a specific .mmd file (URI template)
 */
export function registerResources(
  server: McpServer,
  service: DiagramService,
): void {
  // Resource 1: diagram-list (MCP-06)
  // Fixed resource that lists all available .mmd files
  server.registerResource(
    'diagram-list',
    'smartb://diagrams',
    {
      title: 'Available Diagrams',
      description: 'List of all .mmd diagram files in the project',
      mimeType: 'application/json',
    },
    async (uri) => {
      const files = await service.listFiles();
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify({ files }),
          },
        ],
      };
    },
  );

  // Resource 2: diagram-content (MCP-07)
  // Template resource for reading individual diagram content
  const diagramTemplate = new ResourceTemplate(
    'smartb://diagrams/{filePath}',
    {
      list: async () => {
        const files = await service.listFiles();
        return {
          resources: files.map((f) => ({
            uri: `smartb://diagrams/${encodeURIComponent(f)}`,
            name: f,
          })),
        };
      },
    },
  );

  server.registerResource(
    'diagram-content',
    diagramTemplate,
    {
      title: 'Diagram Content',
      description: 'Content of a specific .mmd diagram file',
      mimeType: 'text/plain',
    },
    async (_uri, variables) => {
      try {
        const filePath = decodeURIComponent(
          String(variables.filePath),
        );
        const diagram = await service.readDiagram(filePath);
        return {
          contents: [
            {
              uri: _uri.href,
              mimeType: 'text/plain',
              text: diagram.mermaidContent,
            },
          ],
        };
      } catch {
        // Resources don't have isError -- return empty contents on error
        return { contents: [] };
      }
    },
  );
}
