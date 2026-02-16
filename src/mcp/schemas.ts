import { z } from 'zod';

/**
 * Raw Zod shapes for MCP tool inputs.
 * These are NOT wrapped in z.object() -- the MCP SDK wraps them internally
 * when passed to registerTool()'s inputSchema option.
 */

export const UpdateDiagramInput = {
  filePath: z
    .string()
    .describe(
      'Relative path to the .mmd file (e.g., "architecture.mmd")',
    ),
  content: z
    .string()
    .describe('Full Mermaid diagram content'),
};

export const ReadFlagsInput = {
  filePath: z
    .string()
    .describe(
      'Relative path to the .mmd file to read flags from',
    ),
};

export const GetDiagramContextInput = {
  filePath: z
    .string()
    .describe(
      'Relative path to the .mmd file to get context for',
    ),
};

export const UpdateNodeStatusInput = {
  filePath: z
    .string()
    .describe('Relative path to the .mmd file'),
  nodeId: z
    .string()
    .describe('ID of the node to update status for'),
  status: z
    .enum(['ok', 'problem', 'in-progress', 'discarded'])
    .describe('Status to set on the node'),
};

export const GetCorrectionContextInput = {
  filePath: z
    .string()
    .describe('Relative path to the .mmd file'),
  nodeId: z
    .string()
    .describe('ID of the flagged node to get correction context for'),
};

export const CheckBreakpointsInput = {
  filePath: z
    .string()
    .describe('Relative path to the .mmd file'),
  currentNodeId: z
    .string()
    .describe('Node ID the AI is currently processing'),
};

export const RecordGhostPathInput = {
  filePath: z
    .string()
    .describe('Relative path to the .mmd file'),
  fromNodeId: z
    .string()
    .describe('Source node of the discarded path'),
  toNodeId: z
    .string()
    .describe('Target node of the discarded path'),
  label: z
    .string()
    .optional()
    .describe('Optional reason for discarding this path'),
};

// Phase 16: Session recording + risk annotation schemas

export const StartSessionInput = {
  filePath: z
    .string()
    .describe('Relative path to the .mmd file to record a session for'),
};

export const RecordStepInput = {
  sessionId: z
    .string()
    .describe('ID of the active session to record a step in'),
  nodeId: z
    .string()
    .describe('ID of the node being visited'),
  action: z
    .string()
    .describe('Description of the action taken (e.g., "analyzed", "modified", "flagged")'),
  metadata: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('Optional metadata about this step'),
};

export const EndSessionInput = {
  sessionId: z
    .string()
    .describe('ID of the active session to end'),
};

export const SetRiskLevelInput = {
  filePath: z
    .string()
    .describe('Relative path to the .mmd file'),
  nodeId: z
    .string()
    .describe('ID of the node to set risk level on'),
  level: z
    .enum(['high', 'medium', 'low'])
    .describe('Risk level: high, medium, or low'),
  reason: z
    .string()
    .describe('Reason for the risk assessment'),
};
