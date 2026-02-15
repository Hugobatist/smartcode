import { describe, it, expect } from 'vitest';
import {
  parseSubgraphs,
  generateCollapsedView,
  toggleSubgraph,
  createEmptyState,
  countVisibleNodes,
  getLeafSubgraphs,
  autoCollapseToLimit,
  findContainingSubgraph,
  getPathToRoot,
  focusOnNode,
  getBreadcrumbs,
  navigateToBreadcrumb,
  exitFocus,
  DEFAULT_CONFIG,
  type CollapseState,
  type CollapseConfig,
} from '../../src/diagram/collapser.js';

const SIMPLE_SUBGRAPH = `flowchart LR
    subgraph Analysis["Analysis Phase"]
        A1[Read Input]
        A2[Parse Data]
        A3[Validate]
        A1 --> A2 --> A3
    end
    Start --> Analysis
    Analysis --> Done`;

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

const MULTIPLE_SUBGRAPHS = `flowchart LR
    subgraph GroupA["Group A"]
        A1[Node A1]
        A2[Node A2]
        A1 --> A2
    end
    subgraph GroupB["Group B"]
        B1[Node B1]
        B2[Node B2]
        B3[Node B3]
        B1 --> B2 --> B3
    end
    Start --> GroupA
    GroupA --> GroupB
    GroupB --> End`;

describe('parseSubgraphs', () => {
  it('extracts simple subgraph with ID, label, and lines', () => {
    const subgraphs = parseSubgraphs(SIMPLE_SUBGRAPH);
    
    expect(subgraphs.size).toBe(1);
    const analysis = subgraphs.get('Analysis');
    expect(analysis).toBeDefined();
    expect(analysis!.label).toBe('Analysis Phase');
    expect(analysis!.startLine).toBe(1);
    expect(analysis!.endLine).toBe(6);
    expect(analysis!.parent).toBeNull();
  });

  it('extracts nodes inside subgraph', () => {
    const subgraphs = parseSubgraphs(SIMPLE_SUBGRAPH);
    const analysis = subgraphs.get('Analysis')!;
    
    expect(analysis.nodeIds).toContain('A1');
    expect(analysis.nodeIds).toContain('A2');
    expect(analysis.nodeIds).toContain('A3');
  });

  it('handles nested subgraphs with parent relationships', () => {
    const subgraphs = parseSubgraphs(NESTED_SUBGRAPH);
    
    expect(subgraphs.size).toBe(2);
    
    const outer = subgraphs.get('Outer')!;
    const inner = subgraphs.get('Inner')!;
    
    expect(outer.parent).toBeNull();
    expect(outer.childSubgraphs).toContain('Inner');
    expect(inner.parent).toBe('Outer');
    expect(inner.childSubgraphs).toHaveLength(0);
  });

  it('handles multiple sibling subgraphs', () => {
    const subgraphs = parseSubgraphs(MULTIPLE_SUBGRAPHS);
    
    expect(subgraphs.size).toBe(2);
    expect(subgraphs.has('GroupA')).toBe(true);
    expect(subgraphs.has('GroupB')).toBe(true);
  });

  it('returns empty map for content without subgraphs', () => {
    const content = 'flowchart LR\n    A --> B --> C';
    const subgraphs = parseSubgraphs(content);
    expect(subgraphs.size).toBe(0);
  });
});

describe('countVisibleNodes', () => {
  it('counts all nodes when nothing collapsed', () => {
    const subgraphs = parseSubgraphs(SIMPLE_SUBGRAPH);
    const state = createEmptyState();
    
    const count = countVisibleNodes(SIMPLE_SUBGRAPH, subgraphs, state);
    // A1, A2, A3, Start, Done = 5 (Analysis is not a node)
    expect(count).toBeGreaterThanOrEqual(3);
  });

  it('subtracts collapsed nodes and adds summary node', () => {
    const subgraphs = parseSubgraphs(SIMPLE_SUBGRAPH);
    const state: CollapseState = {
      collapsed: new Set(['Analysis']),
      focusPath: [],
      focusedSubgraph: null,
    };
    
    const countBefore = countVisibleNodes(SIMPLE_SUBGRAPH, subgraphs, createEmptyState());
    const countAfter = countVisibleNodes(SIMPLE_SUBGRAPH, subgraphs, state);
    
    // Should reduce by (nodes in Analysis - 1 for summary)
    expect(countAfter).toBeLessThan(countBefore);
  });
});

describe('getLeafSubgraphs', () => {
  it('returns only subgraphs with no children', () => {
    const subgraphs = parseSubgraphs(NESTED_SUBGRAPH);
    const leaves = getLeafSubgraphs(subgraphs);
    
    expect(leaves).toHaveLength(1);
    expect(leaves[0]!.id).toBe('Inner');
  });

  it('returns all subgraphs when none are nested', () => {
    const subgraphs = parseSubgraphs(MULTIPLE_SUBGRAPHS);
    const leaves = getLeafSubgraphs(subgraphs);
    
    expect(leaves).toHaveLength(2);
  });
});

describe('autoCollapseToLimit', () => {
  it('does nothing when under limit', () => {
    const subgraphs = parseSubgraphs(SIMPLE_SUBGRAPH);
    const state = createEmptyState();
    const config: CollapseConfig = { ...DEFAULT_CONFIG, maxVisibleNodes: 100 };
    
    const result = autoCollapseToLimit(SIMPLE_SUBGRAPH, subgraphs, state, config);
    expect(result.collapsed.size).toBe(0);
  });

  it('collapses largest leaf first when over limit', () => {
    const subgraphs = parseSubgraphs(MULTIPLE_SUBGRAPHS);
    const state = createEmptyState();
    const config: CollapseConfig = { ...DEFAULT_CONFIG, maxVisibleNodes: 3 };
    
    const result = autoCollapseToLimit(MULTIPLE_SUBGRAPHS, subgraphs, state, config);
    
    // GroupB has more nodes, should be collapsed first
    expect(result.collapsed.has('GroupB')).toBe(true);
  });

  it('does nothing when autoCollapse is disabled', () => {
    const subgraphs = parseSubgraphs(MULTIPLE_SUBGRAPHS);
    const state = createEmptyState();
    const config: CollapseConfig = { ...DEFAULT_CONFIG, maxVisibleNodes: 1, autoCollapse: false };
    
    const result = autoCollapseToLimit(MULTIPLE_SUBGRAPHS, subgraphs, state, config);
    expect(result.collapsed.size).toBe(0);
  });
});

describe('toggleSubgraph', () => {
  it('adds to collapsed set when collapsing', () => {
    const subgraphs = parseSubgraphs(SIMPLE_SUBGRAPH);
    const state = createEmptyState();
    
    const result = toggleSubgraph(state, 'Analysis', subgraphs);
    expect(result.collapsed.has('Analysis')).toBe(true);
  });

  it('removes from collapsed set when expanding', () => {
    const subgraphs = parseSubgraphs(SIMPLE_SUBGRAPH);
    const state: CollapseState = {
      collapsed: new Set(['Analysis']),
      focusPath: [],
      focusedSubgraph: null,
    };
    
    const result = toggleSubgraph(state, 'Analysis', subgraphs);
    expect(result.collapsed.has('Analysis')).toBe(false);
  });

  it('expands parents when expanding child', () => {
    const subgraphs = parseSubgraphs(NESTED_SUBGRAPH);
    const state: CollapseState = {
      collapsed: new Set(['Outer', 'Inner']),
      focusPath: [],
      focusedSubgraph: null,
    };
    
    const result = toggleSubgraph(state, 'Inner', subgraphs);
    expect(result.collapsed.has('Inner')).toBe(false);
    expect(result.collapsed.has('Outer')).toBe(false);
  });
});

describe('generateCollapsedView', () => {
  it('produces valid Mermaid with summary node', () => {
    const subgraphs = parseSubgraphs(SIMPLE_SUBGRAPH);
    const state: CollapseState = {
      collapsed: new Set(['Analysis']),
      focusPath: [],
      focusedSubgraph: null,
    };
    const config: CollapseConfig = { ...DEFAULT_CONFIG, autoCollapse: false };
    
    const result = generateCollapsedView(SIMPLE_SUBGRAPH, subgraphs, state, config);
    
    expect(result.content).toContain('__collapsed__Analysis');
    expect(result.content).toContain('[+]Analysis Phase');
    expect(result.content).toContain('3 nodes');
    expect(result.manualCollapsed).toContain('Analysis');
  });

  it('redirects edges to summary node', () => {
    const subgraphs = parseSubgraphs(SIMPLE_SUBGRAPH);
    const state: CollapseState = {
      collapsed: new Set(['Analysis']),
      focusPath: [],
      focusedSubgraph: null,
    };
    const config: CollapseConfig = { ...DEFAULT_CONFIG, autoCollapse: false };
    
    const result = generateCollapsedView(SIMPLE_SUBGRAPH, subgraphs, state, config);
    
    // Edges should point to the summary node
    expect(result.content).toContain('__collapsed__Analysis');
  });

  it('returns auto-collapsed list when auto-collapse triggers', () => {
    const subgraphs = parseSubgraphs(MULTIPLE_SUBGRAPHS);
    const state = createEmptyState();
    const config: CollapseConfig = { ...DEFAULT_CONFIG, maxVisibleNodes: 3 };
    
    const result = generateCollapsedView(MULTIPLE_SUBGRAPHS, subgraphs, state, config);
    
    expect(result.autoCollapsed.length).toBeGreaterThan(0);
  });
});

describe('findContainingSubgraph', () => {
  it('finds correct subgraph for node', () => {
    const subgraphs = parseSubgraphs(SIMPLE_SUBGRAPH);
    const containing = findContainingSubgraph('A1', subgraphs);
    expect(containing).toBe('Analysis');
  });

  it('returns null for root-level node', () => {
    const subgraphs = parseSubgraphs(SIMPLE_SUBGRAPH);
    const containing = findContainingSubgraph('Start', subgraphs);
    expect(containing).toBeNull();
  });

  it('finds innermost subgraph for nested node', () => {
    const subgraphs = parseSubgraphs(NESTED_SUBGRAPH);
    const containing = findContainingSubgraph('I1', subgraphs);
    expect(containing).toBe('Inner');
  });
});

describe('getPathToRoot', () => {
  it('returns single-element path for root subgraph', () => {
    const subgraphs = parseSubgraphs(SIMPLE_SUBGRAPH);
    const path = getPathToRoot('Analysis', subgraphs);
    expect(path).toEqual(['Analysis']);
  });

  it('returns full path for nested subgraph', () => {
    const subgraphs = parseSubgraphs(NESTED_SUBGRAPH);
    const path = getPathToRoot('Inner', subgraphs);
    expect(path).toEqual(['Outer', 'Inner']);
  });
});

describe('focusOnNode', () => {
  it('sets focusPath correctly', () => {
    const subgraphs = parseSubgraphs(NESTED_SUBGRAPH);
    const state = createEmptyState();
    
    const result = focusOnNode('I1', subgraphs, state);
    
    expect(result.focusPath).toContain('Outer');
    expect(result.focusPath).toContain('Inner');
    expect(result.focusedSubgraph).toBe('Inner');
  });

  it('returns unchanged state for root-level node', () => {
    const subgraphs = parseSubgraphs(SIMPLE_SUBGRAPH);
    const state = createEmptyState();

    const result = focusOnNode('Start', subgraphs, state);
    expect(result).toEqual(state);
  });

  it('collapses sibling subgraphs not in focus path', () => {
    const subgraphs = parseSubgraphs(MULTIPLE_SUBGRAPHS);
    const state = createEmptyState();

    const result = focusOnNode('A1', subgraphs, state);

    expect(result.focusedSubgraph).toBe('GroupA');
    expect(result.focusPath).toEqual(['GroupA']);
    // GroupB is a sibling at root level, should be collapsed
    expect(result.collapsed.has('GroupB')).toBe(true);
    // GroupA (focused) should NOT be collapsed
    expect(result.collapsed.has('GroupA')).toBe(false);
  });

  it('keeps ancestors expanded in nested focus', () => {
    const subgraphs = parseSubgraphs(NESTED_SUBGRAPH);
    const state = createEmptyState();

    const result = focusOnNode('I1', subgraphs, state);

    // Outer is ancestor, should NOT be collapsed
    expect(result.collapsed.has('Outer')).toBe(false);
    // Inner is the focused subgraph, should NOT be collapsed
    expect(result.collapsed.has('Inner')).toBe(false);
    expect(result.focusPath).toEqual(['Outer', 'Inner']);
  });
});

describe('getBreadcrumbs', () => {
  it('returns Overview when no focus', () => {
    const subgraphs = parseSubgraphs(SIMPLE_SUBGRAPH);
    const state = createEmptyState();
    
    const crumbs = getBreadcrumbs(state, subgraphs);
    
    expect(crumbs).toHaveLength(1);
    expect(crumbs[0]!.id).toBe('root');
    expect(crumbs[0]!.label).toBe('Overview');
  });

  it('returns full path when focused', () => {
    const subgraphs = parseSubgraphs(NESTED_SUBGRAPH);
    const state: CollapseState = {
      collapsed: new Set(),
      focusPath: ['Outer', 'Inner'],
      focusedSubgraph: 'Inner',
    };
    
    const crumbs = getBreadcrumbs(state, subgraphs);
    
    expect(crumbs).toHaveLength(3);
    expect(crumbs[0]!.label).toBe('Overview');
    expect(crumbs[1]!.label).toBe('Outer Group');
    expect(crumbs[2]!.label).toBe('Inner Group');
  });
});

describe('navigateToBreadcrumb', () => {
  it('exits focus when navigating to root', () => {
    const subgraphs = parseSubgraphs(NESTED_SUBGRAPH);
    const state: CollapseState = {
      collapsed: new Set(),
      focusPath: ['Outer', 'Inner'],
      focusedSubgraph: 'Inner',
    };
    
    const result = navigateToBreadcrumb('root', subgraphs, state);
    
    expect(result.focusPath).toHaveLength(0);
    expect(result.focusedSubgraph).toBeNull();
  });

  it('truncates path when navigating to intermediate breadcrumb', () => {
    const subgraphs = parseSubgraphs(NESTED_SUBGRAPH);
    const state: CollapseState = {
      collapsed: new Set(),
      focusPath: ['Outer', 'Inner'],
      focusedSubgraph: 'Inner',
    };

    const result = navigateToBreadcrumb('Outer', subgraphs, state);

    expect(result.focusPath).toEqual(['Outer']);
    expect(result.focusedSubgraph).toBe('Outer');
  });

  it('returns unchanged state for unknown breadcrumb ID', () => {
    const subgraphs = parseSubgraphs(NESTED_SUBGRAPH);
    const state: CollapseState = {
      collapsed: new Set(),
      focusPath: ['Outer', 'Inner'],
      focusedSubgraph: 'Inner',
    };

    const result = navigateToBreadcrumb('NonExistent', subgraphs, state);

    // State should be unchanged since the ID is not in focusPath
    expect(result.focusPath).toEqual(['Outer', 'Inner']);
    expect(result.focusedSubgraph).toBe('Inner');
  });
});

describe('exitFocus', () => {
  it('clears focus state', () => {
    const state: CollapseState = {
      collapsed: new Set(['A']),
      focusPath: ['Outer', 'Inner'],
      focusedSubgraph: 'Inner',
    };

    const result = exitFocus(state);

    expect(result.focusPath).toHaveLength(0);
    expect(result.focusedSubgraph).toBeNull();
    expect(result.collapsed.size).toBe(0);
  });
});

