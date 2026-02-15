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
