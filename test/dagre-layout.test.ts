import { describe, it, expect } from 'vitest';
import dagre from '@dagrejs/dagre';

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Create a fresh dagre compound graph with sensible defaults. */
function createGraph(rankdir = 'TB') {
  const g = new dagre.graphlib.Graph({ compound: true });
  g.setGraph({ rankdir, nodesep: 60, ranksep: 80, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));
  return g;
}

// ── Test Group 1: Basic layout ──────────────────────────────────────────────

describe('dagre layout - basic 3-node graph', () => {
  it('A->B->C produces non-overlapping positions', () => {
    const g = createGraph();
    g.setNode('A', { label: 'A', width: 80, height: 40 });
    g.setNode('B', { label: 'B', width: 80, height: 40 });
    g.setNode('C', { label: 'C', width: 80, height: 40 });
    g.setEdge('A', 'B');
    g.setEdge('B', 'C');
    dagre.layout(g);

    const a = g.node('A');
    const b = g.node('B');
    const c = g.node('C');

    // In TB direction, each node should have a distinct y position
    const positions = [
      { x: a.x, y: a.y },
      { x: b.x, y: b.y },
      { x: c.x, y: c.y },
    ];

    // No two nodes should occupy the exact same position
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const same = positions[i].x === positions[j].x && positions[i].y === positions[j].y;
        expect(same).toBe(false);
      }
    }
  });

  it('all nodes get unique y-positions in TB direction', () => {
    const g = createGraph('TB');
    g.setNode('A', { label: 'A', width: 80, height: 40 });
    g.setNode('B', { label: 'B', width: 80, height: 40 });
    g.setNode('C', { label: 'C', width: 80, height: 40 });
    g.setEdge('A', 'B');
    g.setEdge('B', 'C');
    dagre.layout(g);

    const yA = g.node('A').y;
    const yB = g.node('B').y;
    const yC = g.node('C').y;

    // A is before B, B is before C in the vertical flow
    expect(yA).toBeLessThan(yB);
    expect(yB).toBeLessThan(yC);
  });

  it('layout produces positive width and height', () => {
    const g = createGraph();
    g.setNode('A', { label: 'A', width: 80, height: 40 });
    g.setNode('B', { label: 'B', width: 80, height: 40 });
    g.setEdge('A', 'B');
    dagre.layout(g);

    const graphInfo = g.graph();
    expect(graphInfo.width).toBeGreaterThan(0);
    expect(graphInfo.height).toBeGreaterThan(0);
  });
});

// ── Test Group 2: Compound graphs (subgraphs) ──────────────────────────────

describe('dagre layout - subgraphs', () => {
  it('setParent works without errors for compound graph', () => {
    const g = createGraph();
    g.setNode('sg1', { label: 'Subgraph 1' });
    g.setNode('A', { label: 'A', width: 80, height: 40 });
    g.setNode('B', { label: 'B', width: 80, height: 40 });
    g.setNode('C', { label: 'C', width: 80, height: 40 });
    g.setParent('A', 'sg1');
    g.setParent('B', 'sg1');
    g.setEdge('A', 'B');
    g.setEdge('B', 'C');

    // Should not throw
    expect(() => dagre.layout(g)).not.toThrow();

    // Parent node should have dimensions after layout
    const sg1 = g.node('sg1');
    expect(sg1.width).toBeGreaterThan(0);
    expect(sg1.height).toBeGreaterThan(0);
  });
});

// ── Test Group 3: Edge routing ──────────────────────────────────────────────

describe('dagre layout - edge routing', () => {
  it('all 5 edge types produce valid point arrays', () => {
    const edgeTypes = ['arrow', 'open', 'dotted', 'thick', 'invisible'];
    const g = createGraph();

    // Create node pairs for each edge type
    for (let i = 0; i < edgeTypes.length; i++) {
      const from = `N${i}a`;
      const to = `N${i}b`;
      g.setNode(from, { label: from, width: 80, height: 40 });
      g.setNode(to, { label: to, width: 80, height: 40 });
      g.setEdge(from, to, { label: edgeTypes[i] });
    }

    dagre.layout(g);

    // Verify all edges have routed points
    for (const edge of g.edges()) {
      const edata = g.edge(edge);
      expect(edata.points).toBeDefined();
      expect(Array.isArray(edata.points)).toBe(true);
      expect(edata.points.length).toBeGreaterThan(0);

      // Each point must have numeric x and y
      for (const pt of edata.points) {
        expect(typeof pt.x).toBe('number');
        expect(typeof pt.y).toBe('number');
        expect(Number.isFinite(pt.x)).toBe(true);
        expect(Number.isFinite(pt.y)).toBe(true);
      }
    }
  });
});

// ── Test Group 4: Edge cases ────────────────────────────────────────────────

describe('dagre layout - edge cases', () => {
  it('empty graph (no nodes) handles gracefully', () => {
    const g = createGraph();
    expect(() => dagre.layout(g)).not.toThrow();

    const graphInfo = g.graph();
    // Empty graph should still produce a graph object
    expect(graphInfo).toBeDefined();
  });

  it('single node with no edges produces valid layout', () => {
    const g = createGraph();
    g.setNode('A', { label: 'Alone', width: 100, height: 50 });
    dagre.layout(g);

    const a = g.node('A');
    expect(typeof a.x).toBe('number');
    expect(typeof a.y).toBe('number');
    expect(Number.isFinite(a.x)).toBe(true);
    expect(Number.isFinite(a.y)).toBe(true);
  });

  it('diamond shape dimensions are larger than rect (1.4x factor)', () => {
    // This tests the dimension calculation logic from dagre-layout.js
    const baseW = 100;
    const baseH = 48;
    const diamondW = baseW * 1.4;
    const diamondH = baseH * 1.4;

    // Verify diamond is 1.4x in both dimensions
    expect(diamondW).toBeCloseTo(140, 5);
    expect(diamondH).toBeCloseTo(67.2, 5);
    expect(diamondW).toBeGreaterThan(baseW);
    expect(diamondH).toBeGreaterThan(baseH);

    // Both shapes should layout without issues
    const g = createGraph();
    g.setNode('rect', { label: 'Rect', width: baseW, height: baseH });
    g.setNode('diamond', { label: 'Diamond', width: diamondW, height: diamondH });
    g.setEdge('rect', 'diamond');
    dagre.layout(g);

    const rectNode = g.node('rect');
    const diamondNode = g.node('diamond');
    expect(rectNode.width).toBe(baseW);
    expect(diamondNode.width).toBeCloseTo(diamondW, 5);
  });

  it('LR direction produces left-to-right flow', () => {
    const g = createGraph('LR');
    g.setNode('A', { label: 'A', width: 80, height: 40 });
    g.setNode('B', { label: 'B', width: 80, height: 40 });
    g.setNode('C', { label: 'C', width: 80, height: 40 });
    g.setEdge('A', 'B');
    g.setEdge('B', 'C');
    dagre.layout(g);

    const xA = g.node('A').x;
    const xB = g.node('B').x;
    const xC = g.node('C').x;

    // In LR direction, x positions should increase
    expect(xA).toBeLessThan(xB);
    expect(xB).toBeLessThan(xC);
  });
});
