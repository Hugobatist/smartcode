import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DiagramService } from '../diagram/service.js';
import type { GhostPathStore } from '../server/ghost-store.js';
import type { WebSocketManager } from '../server/websocket.js';
import type { SessionStore } from '../session/session-store.js';
import {
  UpdateDiagramInput,
  ReadFlagsInput,
  GetDiagramContextInput,
  UpdateNodeStatusInput,
  GetCorrectionContextInput,
  CheckBreakpointsInput,
  RecordGhostPathInput,
} from './schemas.js';
import { registerSessionTools } from './session-tools.js';

/**
 * Register all 11 MCP tools on the server, backed by DiagramService.
 *
 * Tools 1-7 (Phase 5/15):
 * - update_diagram: Create or update a .mmd file
 * - read_flags: Read all active developer flags from a diagram
 * - get_diagram_context: Get full diagram state (content, flags, statuses, validation)
 * - update_node_status: Set node status (ok, problem, in-progress, discarded)
 * - get_correction_context: Get structured correction context for a flagged node
 * - check_breakpoints: Check if a node has a breakpoint, returns 'pause' or 'continue'
 * - record_ghost_path: Record a discarded reasoning branch as a ghost path
 *
 * Tools 8-11 (Phase 16, registered via session-tools.ts):
 * - start_session: Start a new JSONL recording session
 * - record_step: Record a node visit event in a session
 * - end_session: Close a session and return summary
 * - set_risk_level: Set @risk annotation on a node
 */
export function registerTools(
  server: McpServer,
  service: DiagramService,
  options?: {
    ghostStore?: GhostPathStore;
    wsManager?: WebSocketManager;
    breakpointContinueSignals?: Map<string, boolean>;
    sessionStore?: SessionStore;
  },
): void {
  // Tool 1: update_diagram (MCP-02) — all-in-one: diagram + statuses + risks + ghost paths
  server.registerTool(
    'update_diagram',
    {
      description:
        'Create or update a Mermaid diagram (.mmd file) with optional annotations — all in ONE call. ' +
        'Pass nodeStatuses to color nodes (ok=green, problem=red, in-progress=yellow, discarded=gray). ' +
        'Pass riskLevels to flag risky nodes with reasons. ' +
        'Pass ghostPaths to show rejected alternatives as dashed edges. ' +
        'Changes appear in the browser viewer within 100ms via WebSocket.',
      inputSchema: UpdateDiagramInput,
    },
    async ({ filePath, content, nodeStatuses, riskLevels, ghostPaths }) => {
      try {
        // Build annotation maps from the flat input
        const statusMap = nodeStatuses
          ? new Map(Object.entries(nodeStatuses)) as Map<string, import('../diagram/types.js').NodeStatus>
          : undefined;

        const riskMap = riskLevels
          ? new Map(
              Object.entries(riskLevels).map(([nodeId, r]) => [
                nodeId,
                { nodeId, level: r.level as import('../diagram/types.js').RiskLevel, reason: r.reason },
              ]),
            )
          : undefined;

        // Write diagram with all annotations in a single atomic write
        await service.writeDiagram(filePath, content, undefined, statusMap, undefined, riskMap);

        // Process ghost paths (in-memory store, broadcast via WebSocket)
        const ghostStore = options?.ghostStore;
        if (ghostPaths && ghostPaths.length > 0 && ghostStore) {
          for (const gp of ghostPaths) {
            ghostStore.add(filePath, {
              fromNodeId: gp.from,
              toNodeId: gp.to,
              label: gp.label,
              timestamp: Date.now(),
            });
          }
          if (options?.wsManager) {
            const allPaths = ghostStore.get(filePath);
            options.wsManager.broadcastAll({
              type: 'ghost:update',
              file: filePath,
              ghostPaths: allPaths.map((p) => ({
                fromNodeId: p.fromNodeId,
                toNodeId: p.toNodeId,
                label: p.label,
              })),
            });
          }
        }

        // Build summary response
        const parts = [`Diagram updated: ${filePath}`];
        if (statusMap && statusMap.size > 0) parts.push(`${statusMap.size} node statuses set`);
        if (riskMap && riskMap.size > 0) parts.push(`${riskMap.size} risk levels set`);
        if (ghostPaths && ghostPaths.length > 0) parts.push(`${ghostPaths.length} ghost paths recorded`);

        return {
          content: [{ type: 'text' as const, text: parts.join('. ') + '.' }],
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

  // Tool 5: get_correction_context (AI-02, AI-03)
  server.registerTool(
    'get_correction_context',
    {
      description:
        'Get structured correction context for a flagged diagram node. Returns the flag message, node context (statuses, other flags), the full diagram content, and a natural language instruction for making corrections. Use this when a developer has flagged a node for correction.',
      inputSchema: GetCorrectionContextInput,
    },
    async ({ filePath, nodeId }) => {
      try {
        const diagram = await service.readDiagram(filePath);
        const flag = diagram.flags.get(nodeId);

        if (!flag) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `No flag found on node "${nodeId}" in ${filePath}`,
              },
            ],
            isError: true,
          };
        }

        const context = {
          correction: {
            nodeId: flag.nodeId,
            flagMessage: flag.message,
          },
          diagramState: {
            filePath,
            mermaidContent: diagram.mermaidContent,
            allFlags: Array.from(diagram.flags.values()).map((f) => ({
              nodeId: f.nodeId,
              message: f.message,
            })),
            statuses: Object.fromEntries(diagram.statuses),
          },
          instruction: `The developer flagged node "${nodeId}" with the message: "${flag.message}". Review the diagram and update it to address this feedback. Use the update_diagram tool to write the corrected Mermaid content.`,
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

  // Tool 6: check_breakpoints (Phase 15)
  server.registerTool(
    'check_breakpoints',
    {
      description:
        'Check if the current node has a breakpoint set. Returns "pause" if a breakpoint exists and no continue signal is pending, "continue" otherwise. The AI should respect the pause signal by waiting and re-checking.',
      inputSchema: CheckBreakpointsInput,
    },
    async ({ filePath, currentNodeId }) => {
      try {
        const breakpoints = await service.getBreakpoints(filePath);

        if (breakpoints.has(currentNodeId)) {
          const signalKey = `${filePath}:${currentNodeId}`;
          const continueSignals = options?.breakpointContinueSignals;

          if (continueSignals && continueSignals.has(signalKey)) {
            // One-time consumption of continue signal
            continueSignals.delete(signalKey);
            if (options?.wsManager) {
              options.wsManager.broadcastAll({
                type: 'breakpoint:continue',
                file: filePath,
                nodeId: currentNodeId,
              });
            }
            return {
              content: [{ type: 'text' as const, text: 'continue' }],
            };
          }

          // Breakpoint exists, no continue signal
          if (options?.wsManager) {
            options.wsManager.broadcastAll({
              type: 'breakpoint:hit',
              file: filePath,
              nodeId: currentNodeId,
            });
          }
          return {
            content: [{ type: 'text' as const, text: 'pause' }],
          };
        }

        // No breakpoint on this node
        return {
          content: [{ type: 'text' as const, text: 'continue' }],
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

  // Tool 7: record_ghost_path (Phase 15)
  server.registerTool(
    'record_ghost_path',
    {
      description:
        'Record a discarded reasoning branch as a ghost path. Ghost paths are displayed as dashed translucent edges in the browser viewer.',
      inputSchema: RecordGhostPathInput,
    },
    async ({ filePath, fromNodeId, toNodeId, label }) => {
      try {
        const ghostStore = options?.ghostStore;

        if (ghostStore) {
          ghostStore.add(filePath, {
            fromNodeId,
            toNodeId,
            label,
            timestamp: Date.now(),
          });

          if (options?.wsManager) {
            const allPaths = ghostStore.get(filePath);
            options.wsManager.broadcastAll({
              type: 'ghost:update',
              file: filePath,
              ghostPaths: allPaths.map((p) => ({
                fromNodeId: p.fromNodeId,
                toNodeId: p.toNodeId,
                label: p.label,
              })),
            });
          }

          return {
            content: [
              {
                type: 'text' as const,
                text: `Ghost path recorded: ${fromNodeId} -> ${toNodeId}`,
              },
            ],
          };
        }

        // MCP-only mode without --serve
        return {
          content: [
            {
              type: 'text' as const,
              text: `Ghost path recorded: ${fromNodeId} -> ${toNodeId} (browser visualization unavailable without --serve mode)`,
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

  // Tools 8-11: Session recording + risk annotation (Phase 16)
  registerSessionTools(server, service, {
    sessionStore: options?.sessionStore,
    wsManager: options?.wsManager,
  });
}
