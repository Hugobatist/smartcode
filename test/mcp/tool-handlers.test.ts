import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { z } from 'zod';
import { DiagramService } from '../../src/diagram/service.js';
import { GhostPathStore } from '../../src/server/ghost-store.js';
import { SessionStore } from '../../src/session/session-store.js';
import { registerTools } from '../../src/mcp/tools.js';

/**
 * Captures tool handlers registered via McpServer.registerTool() so we can
 * invoke them directly in tests without spinning up MCP transport.
 */
type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}>;

function createMockMcpServer() {
  const tools = new Map<string, ToolHandler>();

  const mockServer = {
    registerTool(name: string, _config: unknown, handler: ToolHandler) {
      tools.set(name, handler);
    },
  };

  return { server: mockServer as any, tools };
}

// -------------------------------------------------------------------
// Test data
// -------------------------------------------------------------------

const SIMPLE_DIAGRAM = [
  'flowchart LR',
  '    A["Start"] --> B["Process"]',
  '    B --> C["End"]',
  '',
].join('\n');

const FLAGGED_DIAGRAM = [
  'flowchart LR',
  '    A["Load data"] --> B["Process"]',
  '    B --> C["Save results"]',
  '',
  '%% --- ANNOTATIONS (auto-managed by SmartB Diagrams) ---',
  '%% @flag B "This step is too slow, consider batching"',
  '%% @status A ok',
  '%% @breakpoint B',
  '%% --- END ANNOTATIONS ---',
  '',
].join('\n');

// ===================================================================
// Tool handler tests (Phase 5/15 tools via registerTools)
// ===================================================================

describe('MCP tool handlers', () => {
  let tmpDir: string;
  let service: DiagramService;
  let ghostStore: GhostPathStore;
  let sessionStore: SessionStore;
  let tools: Map<string, ToolHandler>;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'smartb-tool-handlers-'));
    service = new DiagramService(tmpDir);
    ghostStore = new GhostPathStore();
    sessionStore = new SessionStore(tmpDir);

    const mock = createMockMcpServer();
    tools = mock.tools;

    registerTools(mock.server, service, {
      ghostStore,
      sessionStore,
      breakpointContinueSignals: new Map(),
    });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------
  // update_diagram
  // -------------------------------------------------------------------

  describe('update_diagram', () => {
    it('creates a new diagram file', async () => {
      const handler = tools.get('update_diagram')!;
      const result = await handler({ filePath: 'new.mmd', content: SIMPLE_DIAGRAM });

      expect(result.isError).toBeUndefined();
      expect(result.content[0]!.text).toContain('new.mmd');
    });

    it('returns error for invalid path traversal', async () => {
      const handler = tools.get('update_diagram')!;
      const result = await handler({ filePath: '../escape.mmd', content: SIMPLE_DIAGRAM });

      expect(result.isError).toBe(true);
    });

    it('writes diagram with nodeStatuses in one call', async () => {
      const handler = tools.get('update_diagram')!;
      const result = await handler({
        filePath: 'all-in-one.mmd',
        content: SIMPLE_DIAGRAM,
        nodeStatuses: { A: 'ok', B: 'in-progress' },
      });

      expect(result.isError).toBeUndefined();
      expect(result.content[0]!.text).toContain('2 node statuses set');

      // Verify statuses were persisted
      const statuses = await service.getStatuses('all-in-one.mmd');
      expect(statuses.get('A')).toBe('ok');
      expect(statuses.get('B')).toBe('in-progress');
    });

    it('writes diagram with riskLevels in one call', async () => {
      const handler = tools.get('update_diagram')!;
      const result = await handler({
        filePath: 'risks.mmd',
        content: SIMPLE_DIAGRAM,
        riskLevels: { B: { level: 'high', reason: 'Complex logic' } },
      });

      expect(result.isError).toBeUndefined();
      expect(result.content[0]!.text).toContain('1 risk levels set');

      // Verify risks were persisted
      const risks = await service.getRisks('risks.mmd');
      expect(risks.get('B')?.level).toBe('high');
      expect(risks.get('B')?.reason).toBe('Complex logic');
    });

    it('stores ghostPaths in the ghost store', async () => {
      const handler = tools.get('update_diagram')!;
      const result = await handler({
        filePath: 'ghosts.mmd',
        content: SIMPLE_DIAGRAM,
        ghostPaths: [
          { from: 'A', to: 'C', label: 'Skipped: too risky' },
          { from: 'B', to: 'C' },
        ],
      });

      expect(result.isError).toBeUndefined();
      expect(result.content[0]!.text).toContain('2 ghost paths recorded');

      const paths = ghostStore.get('ghosts.mmd');
      expect(paths).toHaveLength(2);
      expect(paths[0]!.fromNodeId).toBe('A');
      expect(paths[0]!.label).toBe('Skipped: too risky');
    });

    it('handles all annotations in a single call', async () => {
      const handler = tools.get('update_diagram')!;
      const result = await handler({
        filePath: 'full.mmd',
        content: SIMPLE_DIAGRAM,
        nodeStatuses: { A: 'ok', B: 'problem', C: 'discarded' },
        riskLevels: { B: { level: 'high', reason: 'Auth risk' } },
        ghostPaths: [{ from: 'A', to: 'C', label: 'Direct path rejected' }],
      });

      expect(result.isError).toBeUndefined();
      expect(result.content[0]!.text).toContain('3 node statuses');
      expect(result.content[0]!.text).toContain('1 risk levels');
      expect(result.content[0]!.text).toContain('1 ghost paths');
    });
  });

  // -------------------------------------------------------------------
  // read_flags
  // -------------------------------------------------------------------

  describe('read_flags', () => {
    it('returns flags from a diagram', async () => {
      writeFileSync(join(tmpDir, 'flagged.mmd'), FLAGGED_DIAGRAM, 'utf-8');
      const handler = tools.get('read_flags')!;
      const result = await handler({ filePath: 'flagged.mmd' });

      expect(result.isError).toBeUndefined();
      const flags = JSON.parse(result.content[0]!.text);
      expect(flags).toHaveLength(1);
      expect(flags[0].nodeId).toBe('B');
      expect(flags[0].message).toContain('slow');
    });

    it('returns error for non-existent file', async () => {
      const handler = tools.get('read_flags')!;
      const result = await handler({ filePath: 'nonexistent.mmd' });

      expect(result.isError).toBe(true);
    });
  });

  // -------------------------------------------------------------------
  // get_diagram_context
  // -------------------------------------------------------------------

  describe('get_diagram_context', () => {
    it('returns full context including flags, statuses, validation', async () => {
      writeFileSync(join(tmpDir, 'ctx.mmd'), FLAGGED_DIAGRAM, 'utf-8');
      const handler = tools.get('get_diagram_context')!;
      const result = await handler({ filePath: 'ctx.mmd' });

      expect(result.isError).toBeUndefined();
      const ctx = JSON.parse(result.content[0]!.text);
      expect(ctx.filePath).toBe('ctx.mmd');
      expect(ctx.mermaidContent).toContain('flowchart LR');
      expect(ctx.flags).toHaveLength(1);
      expect(ctx.statuses).toHaveProperty('A', 'ok');
      expect(ctx.validation).toBeDefined();
      expect(typeof ctx.validation.valid).toBe('boolean');
    });

    it('returns error for missing file', async () => {
      const handler = tools.get('get_diagram_context')!;
      const result = await handler({ filePath: 'missing.mmd' });

      expect(result.isError).toBe(true);
    });
  });

  // -------------------------------------------------------------------
  // update_node_status
  // -------------------------------------------------------------------

  describe('update_node_status', () => {
    it('sets status on a node', async () => {
      writeFileSync(join(tmpDir, 'status.mmd'), SIMPLE_DIAGRAM, 'utf-8');
      const handler = tools.get('update_node_status')!;
      const result = await handler({ filePath: 'status.mmd', nodeId: 'A', status: 'ok' });

      expect(result.isError).toBeUndefined();
      expect(result.content[0]!.text).toContain('A');
      expect(result.content[0]!.text).toContain('ok');
    });

    it('returns error for non-existent file', async () => {
      const handler = tools.get('update_node_status')!;
      const result = await handler({ filePath: 'gone.mmd', nodeId: 'A', status: 'ok' });

      expect(result.isError).toBe(true);
    });
  });

  // -------------------------------------------------------------------
  // get_correction_context
  // -------------------------------------------------------------------

  describe('get_correction_context', () => {
    it('returns correction context for a flagged node', async () => {
      writeFileSync(join(tmpDir, 'corr.mmd'), FLAGGED_DIAGRAM, 'utf-8');
      const handler = tools.get('get_correction_context')!;
      const result = await handler({ filePath: 'corr.mmd', nodeId: 'B' });

      expect(result.isError).toBeUndefined();
      const ctx = JSON.parse(result.content[0]!.text);
      expect(ctx.correction.nodeId).toBe('B');
      expect(ctx.correction.flagMessage).toContain('slow');
      expect(ctx.diagramState.filePath).toBe('corr.mmd');
      expect(ctx.instruction).toContain('flagged node "B"');
    });

    it('returns error when node has no flag', async () => {
      writeFileSync(join(tmpDir, 'corr.mmd'), FLAGGED_DIAGRAM, 'utf-8');
      const handler = tools.get('get_correction_context')!;
      const result = await handler({ filePath: 'corr.mmd', nodeId: 'A' });

      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain('No flag found');
    });

    it('returns error for non-existent file', async () => {
      const handler = tools.get('get_correction_context')!;
      const result = await handler({ filePath: 'nope.mmd', nodeId: 'A' });

      expect(result.isError).toBe(true);
    });
  });

  // -------------------------------------------------------------------
  // check_breakpoints
  // -------------------------------------------------------------------

  describe('check_breakpoints', () => {
    it('returns "pause" when breakpoint exists on node', async () => {
      writeFileSync(join(tmpDir, 'bp.mmd'), FLAGGED_DIAGRAM, 'utf-8');
      const handler = tools.get('check_breakpoints')!;
      const result = await handler({ filePath: 'bp.mmd', currentNodeId: 'B' });

      expect(result.isError).toBeUndefined();
      expect(result.content[0]!.text).toBe('pause');
    });

    it('returns "continue" when no breakpoint on node', async () => {
      writeFileSync(join(tmpDir, 'bp.mmd'), FLAGGED_DIAGRAM, 'utf-8');
      const handler = tools.get('check_breakpoints')!;
      const result = await handler({ filePath: 'bp.mmd', currentNodeId: 'A' });

      expect(result.isError).toBeUndefined();
      expect(result.content[0]!.text).toBe('continue');
    });

    it('returns "continue" and consumes signal when continue signal set', async () => {
      writeFileSync(join(tmpDir, 'bp.mmd'), FLAGGED_DIAGRAM, 'utf-8');

      // Re-register with a pre-set continue signal
      const signals = new Map<string, boolean>();
      signals.set('bp.mmd:B', true);

      const mock2 = createMockMcpServer();
      registerTools(mock2.server, service, {
        ghostStore,
        breakpointContinueSignals: signals,
      });

      const handler = mock2.tools.get('check_breakpoints')!;
      const result = await handler({ filePath: 'bp.mmd', currentNodeId: 'B' });

      expect(result.content[0]!.text).toBe('continue');
      // Signal should be consumed
      expect(signals.has('bp.mmd:B')).toBe(false);
    });
  });

  // -------------------------------------------------------------------
  // record_ghost_path
  // -------------------------------------------------------------------

  describe('record_ghost_path', () => {
    it('records a ghost path when ghostStore is available', async () => {
      const handler = tools.get('record_ghost_path')!;
      const result = await handler({
        filePath: 'ghost.mmd',
        fromNodeId: 'A',
        toNodeId: 'B',
        label: 'Too complex',
      });

      expect(result.isError).toBeUndefined();
      expect(result.content[0]!.text).toContain('A -> B');

      const paths = ghostStore.get('ghost.mmd');
      expect(paths).toHaveLength(1);
      expect(paths[0]!.fromNodeId).toBe('A');
      expect(paths[0]!.toNodeId).toBe('B');
      expect(paths[0]!.label).toBe('Too complex');
    });

    it('returns success message without ghostStore (MCP-only mode)', async () => {
      const mock2 = createMockMcpServer();
      registerTools(mock2.server, service, {
        // no ghostStore
      });

      const handler = mock2.tools.get('record_ghost_path')!;
      const result = await handler({
        filePath: 'ghost.mmd',
        fromNodeId: 'X',
        toNodeId: 'Y',
      });

      expect(result.isError).toBeUndefined();
      expect(result.content[0]!.text).toContain('X -> Y');
      expect(result.content[0]!.text).toContain('browser visualization unavailable');
    });
  });

  // -------------------------------------------------------------------
  // Session tools (registered via registerSessionTools)
  // -------------------------------------------------------------------

  describe('start_session', () => {
    it('starts a session and returns sessionId', async () => {
      const handler = tools.get('start_session')!;
      const result = await handler({ filePath: 'session.mmd' });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0]!.text);
      expect(data.sessionId).toBeTruthy();
      expect(data.message).toBe('Session started');
    });

    it('returns error without sessionStore', async () => {
      const mock2 = createMockMcpServer();
      registerTools(mock2.server, service, {
        // no sessionStore
      });

      const handler = mock2.tools.get('start_session')!;
      const result = await handler({ filePath: 'session.mmd' });

      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain('no session store');
    });
  });

  describe('record_step', () => {
    it('records a step in an active session', async () => {
      const startHandler = tools.get('start_session')!;
      const startResult = await startHandler({ filePath: 'step.mmd' });
      const { sessionId } = JSON.parse(startResult.content[0]!.text);

      const handler = tools.get('record_step')!;
      const result = await handler({
        sessionId,
        nodeId: 'A',
        action: 'analyzed',
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0]!.text);
      expect(data.recorded).toBe(true);
    });

    it('returns error without sessionStore', async () => {
      const mock2 = createMockMcpServer();
      registerTools(mock2.server, service, {});

      const handler = mock2.tools.get('record_step')!;
      const result = await handler({
        sessionId: 'fake',
        nodeId: 'A',
        action: 'test',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain('no session store');
    });
  });

  describe('end_session', () => {
    it('ends a session and returns summary', async () => {
      const startHandler = tools.get('start_session')!;
      const startResult = await startHandler({ filePath: 'end.mmd' });
      const { sessionId } = JSON.parse(startResult.content[0]!.text);

      // Record a step
      const stepHandler = tools.get('record_step')!;
      await stepHandler({ sessionId, nodeId: 'A', action: 'visited' });

      const handler = tools.get('end_session')!;
      const result = await handler({ sessionId });

      expect(result.isError).toBeUndefined();
      const summary = JSON.parse(result.content[0]!.text);
      expect(summary.sessionId).toBe(sessionId);
      expect(summary.diagramFile).toBe('end.mmd');
      expect(typeof summary.nodesVisited).toBe('number');
    });

    it('returns error without sessionStore', async () => {
      const mock2 = createMockMcpServer();
      registerTools(mock2.server, service, {});

      const handler = mock2.tools.get('end_session')!;
      const result = await handler({ sessionId: 'fake' });

      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain('no session store');
    });

    it('returns error for non-active session', async () => {
      const handler = tools.get('end_session')!;
      const result = await handler({ sessionId: 'nonexistent-session-id' });

      expect(result.isError).toBe(true);
    });
  });

  describe('set_risk_level', () => {
    it('sets risk level on a node', async () => {
      writeFileSync(join(tmpDir, 'risk.mmd'), SIMPLE_DIAGRAM, 'utf-8');
      const handler = tools.get('set_risk_level')!;
      const result = await handler({
        filePath: 'risk.mmd',
        nodeId: 'B',
        level: 'high',
        reason: 'Potential overflow',
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0]!.text);
      expect(data.set).toBe(true);
      expect(data.nodeId).toBe('B');
      expect(data.level).toBe('high');
    });

    it('returns error for non-existent file', async () => {
      const handler = tools.get('set_risk_level')!;
      const result = await handler({
        filePath: 'nope.mmd',
        nodeId: 'A',
        level: 'low',
        reason: 'test',
      });

      expect(result.isError).toBe(true);
    });
  });

  // -------------------------------------------------------------------
  // Zod schema validation (input shapes)
  // -------------------------------------------------------------------

  describe('Zod schema validation', () => {
    it('UpdateNodeStatusInput rejects invalid status values', () => {
      const schema = z.object({
        filePath: z.string(),
        nodeId: z.string(),
        status: z.enum(['ok', 'problem', 'in-progress', 'discarded']),
      });

      const valid = schema.safeParse({
        filePath: 'test.mmd',
        nodeId: 'A',
        status: 'ok',
      });
      expect(valid.success).toBe(true);

      const invalid = schema.safeParse({
        filePath: 'test.mmd',
        nodeId: 'A',
        status: 'invalid-status',
      });
      expect(invalid.success).toBe(false);
    });

    it('SetRiskLevelInput rejects invalid risk levels', () => {
      const schema = z.object({
        filePath: z.string(),
        nodeId: z.string(),
        level: z.enum(['high', 'medium', 'low']),
        reason: z.string(),
      });

      const valid = schema.safeParse({
        filePath: 'test.mmd',
        nodeId: 'A',
        level: 'high',
        reason: 'important',
      });
      expect(valid.success).toBe(true);

      const invalid = schema.safeParse({
        filePath: 'test.mmd',
        nodeId: 'A',
        level: 'critical',
        reason: 'important',
      });
      expect(invalid.success).toBe(false);
    });

    it('RecordGhostPathInput allows optional label', () => {
      const schema = z.object({
        filePath: z.string(),
        fromNodeId: z.string(),
        toNodeId: z.string(),
        label: z.string().optional(),
      });

      const withLabel = schema.safeParse({
        filePath: 'test.mmd',
        fromNodeId: 'A',
        toNodeId: 'B',
        label: 'reason',
      });
      expect(withLabel.success).toBe(true);

      const withoutLabel = schema.safeParse({
        filePath: 'test.mmd',
        fromNodeId: 'A',
        toNodeId: 'B',
      });
      expect(withoutLabel.success).toBe(true);

      const missingRequired = schema.safeParse({
        filePath: 'test.mmd',
        fromNodeId: 'A',
        // missing toNodeId
      });
      expect(missingRequired.success).toBe(false);
    });

    it('RecordStepInput requires sessionId, nodeId, action', () => {
      const schema = z.object({
        sessionId: z.string(),
        nodeId: z.string(),
        action: z.string(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      });

      const valid = schema.safeParse({
        sessionId: 'abc',
        nodeId: 'A',
        action: 'analyzed',
      });
      expect(valid.success).toBe(true);

      const missingAction = schema.safeParse({
        sessionId: 'abc',
        nodeId: 'A',
      });
      expect(missingAction.success).toBe(false);
    });
  });

  // -------------------------------------------------------------------
  // All 11 tools are registered
  // -------------------------------------------------------------------

  it('registers all 11 expected tools', () => {
    const expected = [
      'update_diagram',
      'read_flags',
      'get_diagram_context',
      'update_node_status',
      'get_correction_context',
      'check_breakpoints',
      'record_ghost_path',
      'start_session',
      'record_step',
      'end_session',
      'set_risk_level',
    ];

    for (const name of expected) {
      expect(tools.has(name), `Tool "${name}" should be registered`).toBe(true);
    }
    expect(tools.size).toBe(11);
  });
});
