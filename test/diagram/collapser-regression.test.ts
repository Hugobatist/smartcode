/**
 * Regression tests for collapser bug fixes:
 * - C1: countVisibleNodes double-counting with parent+child collapsed
 * - C2: focusOnNode only collapsing root-level siblings
 * - Edge cases: empty content, malformed subgraphs
 */
import { describe, it, expect } from 'vitest';
import {
  parseSubgraphs,
  createEmptyState,
  countAllNodes,
  countVisibleNodes,
  focusOnNode,
  type CollapseState,
} from '../../src/diagram/collapser.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const NESTED_SUBGRAPH = `flowchart LR
    subgraph Outer["Outer Group"]
        subgraph Inner["Inner Group"]
            I1[Inner Node 1]
            I2[Inner Node 2]
            I1 --> I2
        end
        O1[Outer Node]
        Inner --> O1
    end
    Start --> Outer
    Outer --> End`;

const DEEP_NESTED = `flowchart LR
    subgraph L1["Level 1"]
        subgraph L2["Level 2"]
            subgraph L3["Level 3"]
                D1[Deep Node 1]
                D2[Deep Node 2]
                D1 --> D2
            end
            M1[Mid Node]
            L3 --> M1
        end
        T1[Top Node]
        L2 --> T1
    end
    subgraph SiblingA["Sibling A"]
        SA1[Sib A Node]
    end
    subgraph SiblingB["Sibling B"]
        SB1[Sib B Node]
    end
    Start --> L1
    L1 --> SiblingA
    SiblingA --> SiblingB`;

// ─── C1: countVisibleNodes double-counting fix ────────────────────────────────

describe('countVisibleNodes — parent+child collapsed (C1 fix)', () => {
  it('does not double-subtract when parent and child are both collapsed', () => {
    const subgraphs = parseSubgraphs(NESTED_SUBGRAPH);

    // Collapse only Outer (parent) — baseline
    const parentOnly: CollapseState = {
      collapsed: new Set(['Outer']),
      focusPath: [],
      focusedSubgraph: null,
    };
    const visibleParentOnly = countVisibleNodes(NESTED_SUBGRAPH, subgraphs, parentOnly);

    // Collapse both Outer AND Inner — should yield same result
    // because Outer already includes Inner's nodes
    const both: CollapseState = {
      collapsed: new Set(['Outer', 'Inner']),
      focusPath: [],
      focusedSubgraph: null,
    };
    const visibleBoth = countVisibleNodes(NESTED_SUBGRAPH, subgraphs, both);

    // Key assertion: collapsing both should equal collapsing only the parent
    expect(visibleBoth).toBe(visibleParentOnly);
    // Visible count must be positive
    expect(visibleBoth).toBeGreaterThan(0);
  });

  it('correctly counts when only child is collapsed (not parent)', () => {
    const subgraphs = parseSubgraphs(NESTED_SUBGRAPH);

    const nothingCollapsed = countVisibleNodes(
      NESTED_SUBGRAPH, subgraphs, createEmptyState()
    );

    // Collapse only Inner
    const state: CollapseState = {
      collapsed: new Set(['Inner']),
      focusPath: [],
      focusedSubgraph: null,
    };
    const visible = countVisibleNodes(NESTED_SUBGRAPH, subgraphs, state);

    // Inner has 2 direct nodes (I1, I2), replaced by 1 summary = net -1
    expect(visible).toBe(nothingCollapsed - 1);
  });

  it('handles 3-level nesting with all collapsed', () => {
    const subgraphs = parseSubgraphs(DEEP_NESTED);

    // Collapse only L1 (the root parent) — baseline
    const l1Only: CollapseState = {
      collapsed: new Set(['L1']),
      focusPath: [],
      focusedSubgraph: null,
    };
    const visibleL1Only = countVisibleNodes(DEEP_NESTED, subgraphs, l1Only);

    // Collapse all three levels L1, L2, L3
    const allThree: CollapseState = {
      collapsed: new Set(['L1', 'L2', 'L3']),
      focusPath: [],
      focusedSubgraph: null,
    };
    const visibleAll = countVisibleNodes(DEEP_NESTED, subgraphs, allThree);

    // Key assertion: should be same as collapsing only L1
    expect(visibleAll).toBe(visibleL1Only);
    expect(visibleAll).toBeGreaterThan(0);

    // Also verify: collapsing L1+L2 (but not L3) gives same result
    const l1l2: CollapseState = {
      collapsed: new Set(['L1', 'L2']),
      focusPath: [],
      focusedSubgraph: null,
    };
    const visibleL1L2 = countVisibleNodes(DEEP_NESTED, subgraphs, l1l2);
    expect(visibleL1L2).toBe(visibleL1Only);
  });
});

// ─── C2: focusOnNode deep nesting fix ─────────────────────────────────────────

describe('focusOnNode — deep nesting (C2 fix)', () => {
  it('collapses siblings at all levels of the focus path', () => {
    const subgraphs = parseSubgraphs(DEEP_NESTED);
    const state = createEmptyState();

    // Focus on D1 which is inside L3 -> L2 -> L1
    const result = focusOnNode('D1', subgraphs, state);

    expect(result.focusPath).toEqual(['L1', 'L2', 'L3']);
    expect(result.focusedSubgraph).toBe('L3');

    // Root-level siblings of L1 should be collapsed
    expect(result.collapsed.has('SiblingA')).toBe(true);
    expect(result.collapsed.has('SiblingB')).toBe(true);

    // Focus path subgraphs should NOT be collapsed
    expect(result.collapsed.has('L1')).toBe(false);
    expect(result.collapsed.has('L2')).toBe(false);
    expect(result.collapsed.has('L3')).toBe(false);
  });

  it('collapses deeper siblings when focusing mid-level', () => {
    const content = `flowchart LR
    subgraph Parent["Parent"]
        subgraph ChildA["Child A"]
            CA1[CA Node]
        end
        subgraph ChildB["Child B"]
            CB1[CB Node]
        end
    end
    Start --> Parent`;

    const subgraphs = parseSubgraphs(content);
    const state = createEmptyState();

    // Focus on CA1 (inside ChildA -> Parent)
    const result = focusOnNode('CA1', subgraphs, state);

    expect(result.focusPath).toEqual(['Parent', 'ChildA']);

    // ChildB is a sibling of ChildA (parent: Parent), should be collapsed
    expect(result.collapsed.has('ChildB')).toBe(true);

    // ChildA and Parent are on the focus path, should NOT be collapsed
    expect(result.collapsed.has('ChildA')).toBe(false);
    expect(result.collapsed.has('Parent')).toBe(false);
  });
});

// ─── Edge Cases ───────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('handles empty content', () => {
    const subgraphs = parseSubgraphs('');
    expect(subgraphs.size).toBe(0);

    const nodes = countAllNodes('');
    expect(nodes).toBe(0);

    const state = createEmptyState();
    const visible = countVisibleNodes('', subgraphs, state);
    expect(visible).toBe(0);
  });

  it('handles content with only a direction declaration', () => {
    const content = 'flowchart LR';
    const subgraphs = parseSubgraphs(content);
    expect(subgraphs.size).toBe(0);
    expect(countAllNodes(content)).toBe(0);
  });

  it('handles malformed subgraph without end', () => {
    const content = `flowchart LR
    subgraph Broken["No End"]
        B1[Node 1]
        B2[Node 2]`;

    const subgraphs = parseSubgraphs(content);

    // Should still parse the subgraph (unclosed handler)
    expect(subgraphs.size).toBe(1);
    const broken = subgraphs.get('Broken');
    expect(broken).toBeDefined();
    expect(broken!.label).toBe('No End');
    expect(broken!.nodeIds).toContain('B1');
    expect(broken!.nodeIds).toContain('B2');
    // endLine should be set to last line of content
    expect(broken!.endLine).toBe(3);
  });

  it('handles malformed nested subgraph with missing inner end', () => {
    const content = `flowchart LR
    subgraph Outer["Outer"]
        subgraph Inner["Inner"]
            I1[Node]
    end`;

    const subgraphs = parseSubgraphs(content);

    // The single "end" closes Inner, Outer remains unclosed
    expect(subgraphs.has('Inner')).toBe(true);
    expect(subgraphs.has('Outer')).toBe(true);
  });
});
