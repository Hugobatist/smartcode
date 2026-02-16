import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DiagramService } from '../diagram/service.js';
import type { SessionStore } from '../session/session-store.js';
import type { WebSocketManager } from '../server/websocket.js';
import type { SessionEvent } from '../session/session-types.js';
import {
  StartSessionInput,
  RecordStepInput,
  EndSessionInput,
  SetRiskLevelInput,
} from './schemas.js';

/**
 * Register session recording and risk annotation MCP tools.
 *
 * Tools:
 * - start_session (Tool 8): Start a new JSONL session for a diagram file
 * - record_step (Tool 9): Record a node visit event in an active session
 * - end_session (Tool 10): Close a session and return summary statistics
 * - set_risk_level (Tool 11): Set @risk annotation on a node
 */
export function registerSessionTools(
  server: McpServer,
  service: DiagramService,
  options?: {
    sessionStore?: SessionStore;
    wsManager?: WebSocketManager;
  },
): void {
  // Tool 8: start_session (Phase 16)
  server.registerTool(
    'start_session',
    {
      description:
        'Start a new recording session for a diagram file. Returns a session ID used by record_step and end_session. Sessions are persisted as JSONL files.',
      inputSchema: StartSessionInput,
    },
    async ({ filePath }) => {
      try {
        const sessionStore = options?.sessionStore;

        if (!sessionStore) {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'Session recording unavailable: no session store (requires --serve mode)',
              },
            ],
            isError: true,
          };
        }

        const sessionId = await sessionStore.startSession(filePath);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ sessionId, message: 'Session started' }),
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

  // Tool 9: record_step (Phase 16)
  server.registerTool(
    'record_step',
    {
      description:
        'Record a step in an active session. Each step represents a node visit with an action description. The event is persisted to the session JSONL file and optionally broadcast via WebSocket.',
      inputSchema: RecordStepInput,
    },
    async ({ sessionId, nodeId, action, metadata }) => {
      try {
        const sessionStore = options?.sessionStore;

        if (!sessionStore) {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'Session recording unavailable: no session store (requires --serve mode)',
              },
            ],
            isError: true,
          };
        }

        const event: SessionEvent = {
          ts: Date.now(),
          type: 'node:visited',
          payload: { nodeId, action, ...metadata },
        };

        await sessionStore.recordStep(sessionId, event);

        if (options?.wsManager) {
          options.wsManager.broadcastAll({
            type: 'session:event',
            sessionId,
            event: { ts: event.ts, type: event.type, payload: event.payload } as Record<string, unknown>,
          });
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ recorded: true }),
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

  // Tool 10: end_session (Phase 16)
  server.registerTool(
    'end_session',
    {
      description:
        'End an active recording session. Returns a summary with statistics (duration, nodes visited, edges traversed). If a WebSocket manager is available, broadcasts updated heatmap data.',
      inputSchema: EndSessionInput,
    },
    async ({ sessionId }) => {
      try {
        const sessionStore = options?.sessionStore;

        if (!sessionStore) {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'Session recording unavailable: no session store (requires --serve mode)',
              },
            ],
            isError: true,
          };
        }

        const summary = await sessionStore.endSession(sessionId);

        if (options?.wsManager && summary.diagramFile) {
          const heatmapData = await sessionStore.getHeatmapData(summary.diagramFile);
          options.wsManager.broadcastAll({
            type: 'heatmap:update',
            file: summary.diagramFile,
            data: heatmapData,
          });
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(summary, null, 2),
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

  // Tool 11: set_risk_level (Phase 16)
  server.registerTool(
    'set_risk_level',
    {
      description:
        'Set a risk level annotation on a diagram node. Risk levels (high, medium, low) are persisted as @risk annotations in the .mmd file and rendered in the browser viewer.',
      inputSchema: SetRiskLevelInput,
    },
    async ({ filePath, nodeId, level, reason }) => {
      try {
        await service.setRisk(filePath, nodeId, level, reason);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ set: true, nodeId, level }),
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
