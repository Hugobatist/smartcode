import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseMermaidToGraph } from '../../src/diagram/graph-parser.js';

const fixturesDir = join(import.meta.dirname, '..', 'fixtures', 'graph');

function loadFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), 'utf-8');
}

// ─── Test Group 1: Direction and diagram type ────────────────────────────────

describe('parseMermaidToGraph - direction and diagram type', () => {
  it('parses basic-flowchart as flowchart LR', () => {
    const model = parseMermaidToGraph(loadFixture('basic-flowchart.mmd'), 'basic-flowchart.mmd');
    expect(model.diagramType).toBe('flowchart');
    expect(model.direction).toBe('LR');
  });

  it('parses graph-keyword as graph with TD normalized to TB', () => {
    const model = parseMermaidToGraph(loadFixture('graph-keyword.mmd'), 'graph-keyword.mmd');
    expect(model.diagramType).toBe('graph');
    expect(model.direction).toBe('TB');
  });

  it('parses direction-variants as flowchart TB', () => {
    const model = parseMermaidToGraph(loadFixture('direction-variants.mmd'), 'direction-variants.mmd');
    expect(model.diagramType).toBe('flowchart');
    expect(model.direction).toBe('TB');
  });
});

// ─── Test Group 2: Node shapes (all 13) ──────────────────────────────────────

describe('parseMermaidToGraph - node shapes', () => {
  it('parses all 13 node shapes from all-node-shapes.mmd', () => {
    const model = parseMermaidToGraph(loadFixture('all-node-shapes.mmd'), 'all-node-shapes.mmd');

    expect(model.nodes.get('A')?.shape).toBe('rect');
    expect(model.nodes.get('A')?.label).toBe('Rectangle');
    expect(model.nodes.get('B')?.shape).toBe('rounded');
    expect(model.nodes.get('B')?.label).toBe('Rounded');
    expect(model.nodes.get('C')?.shape).toBe('stadium');
    expect(model.nodes.get('C')?.label).toBe('Stadium');
    expect(model.nodes.get('D')?.shape).toBe('subroutine');
    expect(model.nodes.get('D')?.label).toBe('Subroutine');
    expect(model.nodes.get('E')?.shape).toBe('cylinder');
    expect(model.nodes.get('E')?.label).toBe('Cylinder');
    expect(model.nodes.get('F')?.shape).toBe('circle');
    expect(model.nodes.get('F')?.label).toBe('Circle');
    expect(model.nodes.get('G')?.shape).toBe('asymmetric');
    expect(model.nodes.get('G')?.label).toBe('Asymmetric');
    expect(model.nodes.get('H')?.shape).toBe('diamond');
    expect(model.nodes.get('H')?.label).toBe('Diamond');
    expect(model.nodes.get('I')?.shape).toBe('hexagon');
    expect(model.nodes.get('I')?.label).toBe('Hexagon');
    expect(model.nodes.get('J')?.shape).toBe('parallelogram');
    expect(model.nodes.get('J')?.label).toBe('Parallelogram');
    expect(model.nodes.get('K')?.shape).toBe('parallelogram-alt');
    expect(model.nodes.get('K')?.label).toBe('Parallelogram Alt');
    expect(model.nodes.get('L')?.shape).toBe('trapezoid');
    expect(model.nodes.get('L')?.label).toBe('Trapezoid');
    expect(model.nodes.get('M')?.shape).toBe('trapezoid-alt');
    expect(model.nodes.get('M')?.label).toBe('Trapezoid Alt');
  });

  it('parses basic-flowchart nodes with rect shape and correct labels', () => {
    const model = parseMermaidToGraph(loadFixture('basic-flowchart.mmd'), 'basic-flowchart.mmd');

    expect(model.nodes.size).toBe(3);
    expect(model.nodes.get('A')?.shape).toBe('rect');
    expect(model.nodes.get('A')?.label).toBe('Start');
    expect(model.nodes.get('B')?.shape).toBe('rect');
    expect(model.nodes.get('B')?.label).toBe('Process');
    expect(model.nodes.get('C')?.shape).toBe('rect');
    expect(model.nodes.get('C')?.label).toBe('End');
  });
});

// ─── Test Group 3: Edge types (all 5) ────────────────────────────────────────

describe('parseMermaidToGraph - edge types', () => {
  it('parses all 5 edge types from all-edge-types.mmd', () => {
    const model = parseMermaidToGraph(loadFixture('all-edge-types.mmd'), 'all-edge-types.mmd');

    expect(model.edges.length).toBe(5);
    expect(model.edges[0]?.type).toBe('arrow');
    expect(model.edges[0]?.from).toBe('A');
    expect(model.edges[0]?.to).toBe('B');
    expect(model.edges[1]?.type).toBe('open');
    expect(model.edges[2]?.type).toBe('dotted');
    expect(model.edges[3]?.type).toBe('thick');
    expect(model.edges[4]?.type).toBe('invisible');
  });

  it('parses chained edges: A-->B-->C produces 2 edges', () => {
    const model = parseMermaidToGraph(loadFixture('chained-edges.mmd'), 'chained-edges.mmd');

    // Line 1: A --> B --> C --> D = 3 edges
    // Line 2: E --> F --> G = 2 edges
    expect(model.edges.length).toBe(5);
    expect(model.edges[0]?.from).toBe('A');
    expect(model.edges[0]?.to).toBe('B');
    expect(model.edges[1]?.from).toBe('B');
    expect(model.edges[1]?.to).toBe('C');
    expect(model.edges[2]?.from).toBe('C');
    expect(model.edges[2]?.to).toBe('D');
  });

  it('parses edge labels from both pipe and inline syntax', () => {
    const model = parseMermaidToGraph(loadFixture('mixed-edge-labels.mmd'), 'mixed-edge-labels.mmd');

    expect(model.edges.length).toBe(3);
    expect(model.edges[0]?.label).toBe('pipe label');
    expect(model.edges[1]?.label).toBe('inline label');
    expect(model.edges[2]?.label).toBe('another');
  });

  it('parses bidirectional edges', () => {
    const model = parseMermaidToGraph(loadFixture('bidirectional-edges.mmd'), 'bidirectional-edges.mmd');

    expect(model.edges.length).toBe(2);
    expect(model.edges[0]?.bidirectional).toBe(true);
    expect(model.edges[0]?.type).toBe('arrow');
    expect(model.edges[1]?.bidirectional).toBe(true);
    expect(model.edges[1]?.type).toBe('dotted');
  });
});

// ─── Test Group 4: Subgraphs ─────────────────────────────────────────────────

describe('parseMermaidToGraph - subgraphs', () => {
  it('parses nested subgraphs with parentId, nodeIds, childSubgraphIds', () => {
    const model = parseMermaidToGraph(loadFixture('nested-subgraphs.mmd'), 'nested-subgraphs.mmd');

    expect(model.subgraphs.size).toBe(2);

    const outer = model.subgraphs.get('Outer');
    expect(outer).toBeDefined();
    expect(outer!.label).toBe('Outer Group');
    expect(outer!.parentId).toBeNull();
    expect(outer!.childSubgraphIds).toContain('Inner');
    expect(outer!.nodeIds).toContain('C');

    const inner = model.subgraphs.get('Inner');
    expect(inner).toBeDefined();
    expect(inner!.label).toBe('Inner Group');
    expect(inner!.parentId).toBe('Outer');
    expect(inner!.nodeIds).toContain('A');
    expect(inner!.nodeIds).toContain('B');
  });

  it('parses empty subgraph with no nodes', () => {
    const model = parseMermaidToGraph(loadFixture('empty-subgraph.mmd'), 'empty-subgraph.mmd');

    const empty = model.subgraphs.get('Empty');
    expect(empty).toBeDefined();
    expect(empty!.nodeIds).toEqual([]);
  });

  it('parses edges to/from subgraph IDs', () => {
    const model = parseMermaidToGraph(loadFixture('subgraph-edges.mmd'), 'subgraph-edges.mmd');

    // C --> SG and SG --> D
    const toSubgraph = model.edges.find(e => e.to === 'SG');
    expect(toSubgraph).toBeDefined();
    expect(toSubgraph!.from).toBe('C');

    const fromSubgraph = model.edges.find(e => e.from === 'SG');
    expect(fromSubgraph).toBeDefined();
    expect(fromSubgraph!.to).toBe('D');
  });
});

// ─── Test Group 5: Style directives ──────────────────────────────────────────

describe('parseMermaidToGraph - style directives', () => {
  it('parses classDef definitions', () => {
    const model = parseMermaidToGraph(loadFixture('with-classdefs.mmd'), 'with-classdefs.mmd');

    expect(model.classDefs.get('okStyle')).toBe('fill:#22c55e,stroke:#16a34a');
    expect(model.classDefs.get('errorStyle')).toBe('fill:#ef4444,stroke:#dc2626');
  });

  it('parses style directives on individual nodes', () => {
    const model = parseMermaidToGraph(loadFixture('with-styles.mmd'), 'with-styles.mmd');

    expect(model.nodeStyles.get('A')).toBe('fill:#f9f,stroke:#333,stroke-width:2px');
    expect(model.nodeStyles.get('B')).toBe('fill:#bbf,stroke:#33f,stroke-width:4px');
  });

  it('parses inline :::className assignments', () => {
    const model = parseMermaidToGraph(loadFixture('inline-class-assignment.mmd'), 'inline-class-assignment.mmd');

    expect(model.classAssignments.get('A')).toBe('myClass');
    expect(model.classAssignments.get('B')).toBe('otherClass');
  });

  it('parses class directive assigning class to multiple nodes', () => {
    const model = parseMermaidToGraph(loadFixture('class-directive.mmd'), 'class-directive.mmd');

    expect(model.classAssignments.get('A')).toBe('highlight');
    expect(model.classAssignments.get('B')).toBe('highlight');
    expect(model.classAssignments.get('C')).toBe('highlight');
  });

  it('parses linkStyle directives', () => {
    const model = parseMermaidToGraph(loadFixture('link-styles.mmd'), 'link-styles.mmd');

    expect(model.linkStyles.get(0)).toBe('stroke:#ff3,stroke-width:4px');
    expect(model.linkStyles.get(1)).toBe('stroke:blue');
  });

  it('sets cssClass field on nodes with inline class assignment', () => {
    const model = parseMermaidToGraph(loadFixture('inline-class-assignment.mmd'), 'inline-class-assignment.mmd');

    expect(model.nodes.get('A')?.cssClass).toBe('myClass');
    expect(model.nodes.get('B')?.cssClass).toBe('otherClass');
  });
});

// ─── Test Group 6: Annotations integration ───────────────────────────────────

describe('parseMermaidToGraph - annotations integration', () => {
  it('parses flags and statuses from annotation block', () => {
    const model = parseMermaidToGraph(loadFixture('with-flags-and-statuses.mmd'), 'with-flags-and-statuses.mmd');

    expect(model.flags.size).toBe(2);
    expect(model.flags.get('A')?.message).toBe('needs security review');
    expect(model.flags.get('C')?.message).toBe('performance bottleneck');

    expect(model.statuses.size).toBe(2);
    expect(model.statuses.get('A')).toBe('ok');
    expect(model.statuses.get('B')).toBe('in-progress');
  });

  it('populates flag and status fields on node objects', () => {
    const model = parseMermaidToGraph(loadFixture('with-flags-and-statuses.mmd'), 'with-flags-and-statuses.mmd');

    expect(model.nodes.get('A')?.flag).toEqual({ nodeId: 'A', message: 'needs security review' });
    expect(model.nodes.get('A')?.status).toBe('ok');
    expect(model.nodes.get('B')?.status).toBe('in-progress');
    expect(model.nodes.get('C')?.flag).toEqual({ nodeId: 'C', message: 'performance bottleneck' });
  });
});

// ─── Test Group 7: Edge cases ────────────────────────────────────────────────

describe('parseMermaidToGraph - edge cases', () => {
  it('creates implicit nodes for edge-only references', () => {
    const model = parseMermaidToGraph(loadFixture('implicit-nodes.mmd'), 'implicit-nodes.mmd');

    expect(model.nodes.size).toBe(3);
    expect(model.nodes.get('A')?.shape).toBe('rect');
    expect(model.nodes.get('A')?.label).toBe('A');
    expect(model.nodes.get('B')?.shape).toBe('rect');
    expect(model.nodes.get('C')?.shape).toBe('rect');
  });

  it('handles special characters in quoted labels', () => {
    const model = parseMermaidToGraph(loadFixture('special-characters.mmd'), 'special-characters.mmd');

    expect(model.nodes.get('A')?.label).toBe('Load (all) data');
    expect(model.nodes.get('A')?.shape).toBe('rect');
    expect(model.nodes.get('B')?.label).toBe('Process [batch]');
    expect(model.nodes.get('C')?.label).toBe("Check 'status'");
    expect(model.nodes.get('D')?.label).toBe('Result: ok/fail');
  });

  it('handles unicode labels correctly', () => {
    const model = parseMermaidToGraph(loadFixture('unicode-labels.mmd'), 'unicode-labels.mmd');

    expect(model.nodes.get('A')?.label).toBe('Processar dados');
    expect(model.nodes.get('B')?.label).toBe('Verificacao');
    // Note: the fixture uses "Verificacao" without diacritics
  });

  it('skips comment lines and blank lines', () => {
    const model = parseMermaidToGraph(loadFixture('comments-and-blanks.mmd'), 'comments-and-blanks.mmd');

    expect(model.nodes.size).toBe(3);
    expect(model.edges.length).toBe(2);
  });

  it('handles single node with no edges', () => {
    const model = parseMermaidToGraph(loadFixture('single-node.mmd'), 'single-node.mmd');

    expect(model.nodes.size).toBe(1);
    expect(model.nodes.get('A')?.label).toBe('Only node');
    expect(model.edges.length).toBe(0);
  });
});

// ─── Test Group 8: Validation and metadata ───────────────────────────────────

describe('parseMermaidToGraph - validation and metadata', () => {
  it('sets validation.valid to true for valid input', () => {
    const model = parseMermaidToGraph(loadFixture('basic-flowchart.mmd'), 'basic-flowchart.mmd');
    expect(model.validation.valid).toBe(true);
  });

  it('passes through filePath', () => {
    const model = parseMermaidToGraph(loadFixture('basic-flowchart.mmd'), 'my/file.mmd');
    expect(model.filePath).toBe('my/file.mmd');
  });

  it('returns correct node count for all-node-shapes', () => {
    const model = parseMermaidToGraph(loadFixture('all-node-shapes.mmd'), 'all-node-shapes.mmd');
    expect(model.nodes.size).toBe(13);
  });

  it('assigns subgraphId to nodes inside subgraphs', () => {
    const model = parseMermaidToGraph(loadFixture('nested-subgraphs.mmd'), 'nested-subgraphs.mmd');

    expect(model.nodes.get('A')?.subgraphId).toBe('Inner');
    expect(model.nodes.get('B')?.subgraphId).toBe('Inner');
    expect(model.nodes.get('C')?.subgraphId).toBe('Outer');
    expect(model.nodes.get('D')?.subgraphId).toBeUndefined();
  });

  it('generates edge IDs as from->to', () => {
    const model = parseMermaidToGraph(loadFixture('basic-flowchart.mmd'), 'basic-flowchart.mmd');

    expect(model.edges[0]?.id).toBe('A->B');
    expect(model.edges[1]?.id).toBe('B->C');
  });
});
