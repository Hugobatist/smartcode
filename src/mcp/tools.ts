import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DiagramService } from '../diagram/service.js';
import {
  UpdateDiagramInput,
  ReadFlagsInput,
  GetDiagramContextInput,
  UpdateNodeStatusInput,
} from './schemas.js';

/**
 * Register all 4 MCP tools on the server, backed by DiagramService.
 *
 * Tools:
 * - update_diagram: Create or update a .mmd file
 * - read_flags: Read all active developer flags from a diagram
 * - get_diagram_context: Get full diagram state (content, flags, statuses, validation)
 * - update_node_status: Set node status (ok, problem, in-progress, discarded)
 */
export function registerTools(
  server: McpServer,
  service: DiagramService,
): void {
  // Tool 1: update_diagram (MCP-02)
  server.registerTool(
    'update_diagram',
    {
      description:
        'Create or update a Mermaid diagram (.mmd file). The content should be valid Mermaid syntax. Changes appear in the browser viewer within 100ms via WebSocket.',
      inputSchema: UpdateDiagramInput,
    },
    async ({ filePath, content }) => {
      try {
        await service.writeDiagram(filePath, content);
        return {
          content: [
            {
              type: 'text' as const,
              text: `Diagram updated: ${filePath}`,
            },
          ],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [{ type: 'text' as const, text: message }],
          isError: true,
        };
      }
    },
  );

  // Tool 2: read_flags (MCP-03)
  server.registerTool(
    'read_flags',
    {
      description:
        'Read all active developer flags from a .mmd diagram file. Flags are annotations added by developers to signal issues or requests to the AI.',
      inputSchema: ReadFlagsInput,
    },
    async ({ filePath }) => {
      try {
        const flags = await service.getFlags(filePath);
        const result = flags.map((f) => ({
          nodeId: f.nodeId,
          message: f.message,
        }));
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [{ type: 'text' as const, text: message }],
          isError: true,
        };
      }
    },
  );

  // Tool 3: get_diagram_context (MCP-04)
  server.registerTool(
    'get_diagram_context',
    {
      description:
        'Get the current state of a diagram including Mermaid content, flags, node statuses, and validation info. Use this to understand the diagram before making changes.',
      inputSchema: GetDiagramContextInput,
    },
    async ({ filePath }) => {
      try {
        const diagram = await service.readDiagram(filePath);
        const context = {
          filePath: diagram.filePath,
          mermaidContent: diagram.mermaidContent,
          flags: Array.from(diagram.flags.values()).map((f) => ({
            nodeId: f.nodeId,
            message: f.message,
          })),
          statuses: Object.fromEntries(diagram.statuses),
          validation: {
            valid: diagram.validation.valid,
            errors: diagram.validation.errors,
            diagramType: diagram.validation.diagramType,
          },
        };
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(context, null, 2),
            },
          ],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [{ type: 'text' as const, text: message }],
          isError: true,
        };
      }
    },
  );

  // Tool 4: update_node_status (MCP-05)
  server.registerTool(
    'update_node_status',
    {
      description:
        'Set the status of a specific node in a diagram. Status values: "ok" (green), "problem" (red), "in-progress" (yellow), "discarded" (gray). Status renders as color in the browser viewer.',
      inputSchema: UpdateNodeStatusInput,
    },
    async ({ filePath, nodeId, status }) => {
      try {
        await service.setStatus(filePath, nodeId, status);
        return {
          content: [
            {
              type: 'text' as const,
              text: `Node "${nodeId}" status set to "${status}" in ${filePath}`,
            },
          ],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [{ type: 'text' as const, text: message }],
          isError: true,
        };
      }
    },
  );
}
