import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
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

// ===================================================================
// Annotation preservation tests (Phase 17, Plan 01)
// ===================================================================

describe('annotation preservation (writeDiagramPreserving)', () => {
  let tmpDir: string;
  let service: DiagramService;
  let tools: Map<string, ToolHandler>;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'smartb-annot-preserve-'));
    service = new DiagramService(tmpDir);
    const ghostStore = new GhostPathStore();
    const sessionStore = new SessionStore(tmpDir);

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
  // Test 1: update_diagram preserves existing flags
  // -------------------------------------------------------------------

  it('preserves existing flags when update_diagram is called', async () => {
    // Create initial diagram with a flag
    await service.writeDiagram('preserve-flags.mmd', SIMPLE_DIAGRAM);
    await service.setFlag('preserve-flags.mmd', 'B', 'This step needs review');

    // Verify flag exists before update
    const flagsBefore = await service.getFlags('preserve-flags.mmd');
    expect(flagsBefore).toHaveLength(1);
    expect(flagsBefore[0]!.nodeId).toBe('B');

    // Call update_diagram with new statuses but NO flags
    const handler = tools.get('update_diagram')!;
    const result = await handler({
      filePath: 'preserve-flags.mmd',
      content: SIMPLE_DIAGRAM,
      nodeStatuses: { A: 'ok', B: 'in-progress' },
    });

    expect(result.isError).toBeUndefined();

    // Flags should still be present
    const flagsAfter = await service.getFlags('preserve-flags.mmd');
    expect(flagsAfter).toHaveLength(1);
    expect(flagsAfter[0]!.nodeId).toBe('B');
    expect(flagsAfter[0]!.message).toBe('This step needs review');
  });

  // -------------------------------------------------------------------
  // Test 2: update_diagram preserves existing breakpoints
  // -------------------------------------------------------------------

  it('preserves existing breakpoints when update_diagram is called', async () => {
    // Create initial diagram with a breakpoint
    await service.writeDiagram('preserve-bp.mmd', SIMPLE_DIAGRAM);
    await service.setBreakpoint('preserve-bp.mmd', 'B');

    // Verify breakpoint exists before update
    const bpBefore = await service.getBreakpoints('preserve-bp.mmd');
    expect(bpBefore.has('B')).toBe(true);

    // Call update_diagram with new content
    const handler = tools.get('update_diagram')!;
    const result = await handler({
      filePath: 'preserve-bp.mmd',
      content: SIMPLE_DIAGRAM,
      nodeStatuses: { A: 'ok' },
    });

    expect(result.isError).toBeUndefined();

    // Breakpoints should still be present
    const bpAfter = await service.getBreakpoints('preserve-bp.mmd');
    expect(bpAfter.has('B')).toBe(true);
  });

  // -------------------------------------------------------------------
  // Test 3: update_diagram replaces statuses when provided
  // -------------------------------------------------------------------

  it('replaces all statuses when nodeStatuses is provided', async () => {
    // Create initial diagram with statuses
    await service.writeDiagram('replace-status.mmd', SIMPLE_DIAGRAM);
    await service.setStatus('replace-status.mmd', 'A', 'ok');
    await service.setStatus('replace-status.mmd', 'B', 'problem');

    // Verify both statuses exist
    const statusesBefore = await service.getStatuses('replace-status.mmd');
    expect(statusesBefore.get('A')).toBe('ok');
    expect(statusesBefore.get('B')).toBe('problem');

    // Call update_diagram with ONLY nodeA status (full replacement)
    const handler = tools.get('update_diagram')!;
    await handler({
      filePath: 'replace-status.mmd',
      content: SIMPLE_DIAGRAM,
      nodeStatuses: { A: 'in-progress' },
    });

    // A should be replaced, B should NOT exist (full replacement semantics)
    const statusesAfter = await service.getStatuses('replace-status.mmd');
    expect(statusesAfter.get('A')).toBe('in-progress');
    expect(statusesAfter.has('B')).toBe(false);
  });

  // -------------------------------------------------------------------
  // Test 4: update_diagram preserves statuses when not provided
  // -------------------------------------------------------------------

  it('preserves existing statuses when nodeStatuses is not provided', async () => {
    // Create initial diagram with statuses
    await service.writeDiagram('keep-status.mmd', SIMPLE_DIAGRAM);
    await service.setStatus('keep-status.mmd', 'A', 'ok');
    await service.setStatus('keep-status.mmd', 'B', 'problem');

    // Call update_diagram WITHOUT nodeStatuses (undefined)
    const handler = tools.get('update_diagram')!;
    await handler({
      filePath: 'keep-status.mmd',
      content: SIMPLE_DIAGRAM,
      // no nodeStatuses
    });

    // Original statuses should be preserved
    const statusesAfter = await service.getStatuses('keep-status.mmd');
    expect(statusesAfter.get('A')).toBe('ok');
    expect(statusesAfter.get('B')).toBe('problem');
  });

  // -------------------------------------------------------------------
  // Test 5: writeRaw writes under lock (basic test)
  // -------------------------------------------------------------------

  it('writeRaw writes content to file correctly', async () => {
    const rawContent = [
      'flowchart LR',
      '    X["Raw"] --> Y["Content"]',
      '',
      '%% --- ANNOTATIONS (auto-managed by SmartB Diagrams) ---',
      '%% @flag X "manually written"',
      '%% --- END ANNOTATIONS ---',
      '',
    ].join('\n');

    await service.writeRaw('raw-test.mmd', rawContent);

    // Verify file exists and content matches exactly
    const written = readFileSync(join(tmpDir, 'raw-test.mmd'), 'utf-8');
    expect(written).toBe(rawContent);
  });

  // -------------------------------------------------------------------
  // Test 6: Preserves both flags AND breakpoints simultaneously
  // -------------------------------------------------------------------

  it('preserves both flags and breakpoints simultaneously', async () => {
    // Set up diagram with both flags and breakpoints
    await service.writeDiagram('preserve-both.mmd', SIMPLE_DIAGRAM);
    await service.setFlag('preserve-both.mmd', 'A', 'Review this');
    await service.setBreakpoint('preserve-both.mmd', 'C');

    // Call update_diagram
    const handler = tools.get('update_diagram')!;
    await handler({
      filePath: 'preserve-both.mmd',
      content: SIMPLE_DIAGRAM,
      nodeStatuses: { B: 'ok' },
    });

    // Both should survive
    const flags = await service.getFlags('preserve-both.mmd');
    expect(flags).toHaveLength(1);
    expect(flags[0]!.nodeId).toBe('A');

    const breakpoints = await service.getBreakpoints('preserve-both.mmd');
    expect(breakpoints.has('C')).toBe(true);
  });

  // -------------------------------------------------------------------
  // Test 7: writeDiagramPreserving on new file (no existing annotations)
  // -------------------------------------------------------------------

  it('writeDiagramPreserving works on a new file without existing annotations', async () => {
    const handler = tools.get('update_diagram')!;
    const result = await handler({
      filePath: 'brand-new.mmd',
      content: SIMPLE_DIAGRAM,
      nodeStatuses: { A: 'ok' },
    });

    expect(result.isError).toBeUndefined();

    // File should exist with the status
    const statuses = await service.getStatuses('brand-new.mmd');
    expect(statuses.get('A')).toBe('ok');
  });
});
