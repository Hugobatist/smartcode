/**
 * SmartB Diagrams — Subgraph Collapse/Expand Module
 * Parses Mermaid subgraph structures and generates collapsed views.
 * Pure functions for transforming diagram content based on collapse state.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SubgraphInfo {
  id: string;
  label: string;
  startLine: number;
  endLine: number;
  nodeIds: string[];        // nodes directly inside this subgraph
  childSubgraphs: string[]; // nested subgraph IDs
  parent: string | null;    // parent subgraph ID or null for root-level
}

export interface CollapseState {
  collapsed: Set<string>;     // subgraph IDs currently collapsed
  focusPath: string[];        // path of subgraph IDs from root to focus
  focusedSubgraph: string | null;  // the subgraph currently in focus
}

export interface CollapseConfig {
  collapsedNodePrefix: string;
  maxVisibleNodes: number;
  autoCollapse: boolean;
}

export interface CollapsedDiagram {
  content: string;
  visibleNodes: number;
  autoCollapsed: string[];
  manualCollapsed: string[];
}

export const DEFAULT_CONFIG: CollapseConfig = {
  collapsedNodePrefix: '__collapsed__',
  maxVisibleNodes: 50,
  autoCollapse: true,
};

// ─── State Factory ───────────────────────────────────────────────────────────

export function createEmptyState(): CollapseState {
  return {
    collapsed: new Set(),
    focusPath: [],
    focusedSubgraph: null,
  };
}

// ─── Parsing ─────────────────────────────────────────────────────────────────

const SUBGRAPH_START = /^\s*subgraph\s+([^\s\[]+)(?:\s*\["([^"]+)"\])?/;
const SUBGRAPH_END = /^\s*end\s*$/;
const NODE_DEF = /^\s*(\w[\w\d_-]*)(?:\s*\[|\s*\(|\s*\{|\s*\[\[|\s*>)/;
const EDGE_LINE = /^\s*(\w[\w\d_-]*)\s*(?:-->|---|-\.-|-.->|==>|-.->)/;

/**
 * Parse Mermaid content to extract subgraph structure.
 */
export function parseSubgraphs(content: string): Map<string, SubgraphInfo> {
  const subgraphs = new Map<string, SubgraphInfo>();
  const lines = content.split('\n');
  const stack: SubgraphInfo[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const startMatch = line.match(SUBGRAPH_START);
    
    if (startMatch) {
      const id = startMatch[1]!;
      const label = startMatch[2] || id;
      const parent = stack.length > 0 ? stack[stack.length - 1]!.id : null;
      
      const info: SubgraphInfo = {
        id,
        label,
        startLine: i,
        endLine: -1,
        nodeIds: [],
        childSubgraphs: [],
        parent,
      };
      
      stack.push(info);
      
      if (parent) {
        const parentInfo = subgraphs.get(parent) || stack.find(s => s.id === parent);
        if (parentInfo) parentInfo.childSubgraphs.push(id);
      }
      continue;
    }

    if (SUBGRAPH_END.test(line) && stack.length > 0) {
      const completed = stack.pop()!;
      completed.endLine = i;
      subgraphs.set(completed.id, completed);
      continue;
    }

    // Track nodes inside current subgraph
    if (stack.length > 0) {
      const current = stack[stack.length - 1]!;
      const nodeMatch = line.match(NODE_DEF);
      const edgeMatch = line.match(EDGE_LINE);
      
      if (nodeMatch && !current.nodeIds.includes(nodeMatch[1]!)) {
        current.nodeIds.push(nodeMatch[1]!);
      } else if (edgeMatch && !current.nodeIds.includes(edgeMatch[1]!)) {
        current.nodeIds.push(edgeMatch[1]!);
      }
    }
  }

  // Handle unclosed subgraphs
  while (stack.length > 0) {
    const incomplete = stack.pop()!;
    incomplete.endLine = lines.length - 1;
    subgraphs.set(incomplete.id, incomplete);
  }

  return subgraphs;
}

// ─── Node Counting ───────────────────────────────────────────────────────────

/**
 * Count all node definitions in Mermaid content.
 */
export function countAllNodes(content: string): number {
  const seen = new Set<string>();
  const lines = content.split('\n');
  
  for (const line of lines) {
    const nodeMatch = line.match(NODE_DEF);
    const edgeMatch = line.match(EDGE_LINE);
    if (nodeMatch) seen.add(nodeMatch[1]!);
    if (edgeMatch) seen.add(edgeMatch[1]!);
  }
  
  return seen.size;
}

/**
 * Count visible nodes after collapse is applied.
 */
export function countVisibleNodes(
  content: string,
  subgraphs: Map<string, SubgraphInfo>,
  state: CollapseState
): number {
  let total = countAllNodes(content);
  
  for (const subgraphId of state.collapsed) {
    const info = subgraphs.get(subgraphId);
    if (info) {
      // Subtract nodes in collapsed subgraph
      total -= countNodesInSubgraph(info, subgraphs);
      // Add 1 for the summary node
      total += 1;
    }
  }
  
  return Math.max(0, total);
}

function countNodesInSubgraph(
  info: SubgraphInfo,
  subgraphs: Map<string, SubgraphInfo>
): number {
  let count = info.nodeIds.length;
  
  for (const childId of info.childSubgraphs) {
    const child = subgraphs.get(childId);
    if (child) count += countNodesInSubgraph(child, subgraphs);
  }
  
  return count;
}

// ─── Auto-Collapse ───────────────────────────────────────────────────────────

/**
 * Get leaf subgraphs (those with no children).
 */
export function getLeafSubgraphs(subgraphs: Map<string, SubgraphInfo>): SubgraphInfo[] {
  return [...subgraphs.values()].filter(s => s.childSubgraphs.length === 0);
}

/**
 * Auto-collapse largest leaf subgraphs until under node limit.
 */
export function autoCollapseToLimit(
  content: string,
  subgraphs: Map<string, SubgraphInfo>,
  state: CollapseState,
  config: CollapseConfig
): CollapseState {
  if (!config.autoCollapse) return state;
  
  const newCollapsed = new Set(state.collapsed);
  let visibleNodes = countVisibleNodes(content, subgraphs, { ...state, collapsed: newCollapsed });
  
  while (visibleNodes > config.maxVisibleNodes) {
    // Find uncollapsed leaf subgraphs
    const leaves = getLeafSubgraphs(subgraphs)
      .filter(s => !newCollapsed.has(s.id))
      .sort((a, b) => countNodesInSubgraph(b, subgraphs) - countNodesInSubgraph(a, subgraphs));
    
    if (leaves.length === 0) break;
    
    // Collapse largest leaf
    const largest = leaves[0]!;
    newCollapsed.add(largest.id);
    visibleNodes = countVisibleNodes(content, subgraphs, { ...state, collapsed: newCollapsed });
  }
  
  return { ...state, collapsed: newCollapsed };
}

// ─── State Management ────────────────────────────────────────────────────────

/**
 * Toggle collapse state for a subgraph.
 */
export function toggleSubgraph(
  state: CollapseState,
  subgraphId: string,
  subgraphs: Map<string, SubgraphInfo>
): CollapseState {
  const newCollapsed = new Set(state.collapsed);
  
  if (newCollapsed.has(subgraphId)) {
    // Expanding - also expand all parents
    newCollapsed.delete(subgraphId);
    let current = subgraphs.get(subgraphId);
    while (current?.parent) {
      newCollapsed.delete(current.parent);
      current = subgraphs.get(current.parent);
    }
  } else {
    // Collapsing
    newCollapsed.add(subgraphId);
  }
  
  return { ...state, collapsed: newCollapsed };
}

// ─── Transformation ──────────────────────────────────────────────────────────

/**
 * Generate Mermaid content with collapsed subgraphs replaced by summary nodes.
 */
export function generateCollapsedView(
  content: string,
  subgraphs: Map<string, SubgraphInfo>,
  state: CollapseState,
  config: CollapseConfig = DEFAULT_CONFIG
): CollapsedDiagram {
  // Apply auto-collapse
  const autoState = autoCollapseToLimit(content, subgraphs, state, config);
  const autoCollapsed = [...autoState.collapsed].filter(id => !state.collapsed.has(id));
  const manualCollapsed = [...state.collapsed];
  
  // Apply transformation
  const lines = content.split('\n');
  const result: string[] = [];
  const summaryNodes: string[] = [];
  const edgeRedirects = new Map<string, string>();
  const skipRanges: Array<{ start: number; end: number; id: string }> = [];
  
  // Build skip ranges and edge redirects
  for (const subgraphId of autoState.collapsed) {
    const info = subgraphs.get(subgraphId);
    if (!info) continue;
    
    // Skip if parent is also collapsed
    if (info.parent && autoState.collapsed.has(info.parent)) continue;
    
    skipRanges.push({ start: info.startLine, end: info.endLine, id: subgraphId });
    
    const nodeCount = countNodesInSubgraph(info, subgraphs);
    const summaryId = `${config.collapsedNodePrefix}${subgraphId}`;
    summaryNodes.push(`    ${summaryId}["📁 ${info.label} (${nodeCount} nodes)"]`);
    
    // Redirect edges from nodes inside to summary node
    for (const nodeId of getAllNodesInSubgraph(info, subgraphs)) {
      edgeRedirects.set(nodeId, summaryId);
    }
  }
  
  // Sort ranges by start line
  skipRanges.sort((a, b) => a.start - b.start);
  
  // Build output
  let skipIndex = 0;
  for (let i = 0; i < lines.length; i++) {
    // Check if in skip range
    if (skipIndex < skipRanges.length && i >= skipRanges[skipIndex]!.start) {
      if (i === skipRanges[skipIndex]!.start) {
        // Insert summary node at start of collapsed subgraph
        const range = skipRanges[skipIndex]!;
        const summaryId = `${config.collapsedNodePrefix}${range.id}`;
        const info = subgraphs.get(range.id)!;
        const nodeCount = countNodesInSubgraph(info, subgraphs);
        result.push(`    ${summaryId}["📁 ${info.label} (${nodeCount} nodes)"]`);
      }
      if (i <= skipRanges[skipIndex]!.end) {
        if (i === skipRanges[skipIndex]!.end) skipIndex++;
        continue;
      }
    }
    
    // Redirect edges
    let line = lines[i]!;
    for (const [from, to] of edgeRedirects) {
      const regex = new RegExp(`\\b${from}\\b`, 'g');
      line = line.replace(regex, to);
    }
    
    result.push(line);
  }
  
  const collapsedContent = result.join('\n');
  const visibleNodes = countVisibleNodes(content, subgraphs, autoState);
  
  return {
    content: collapsedContent,
    visibleNodes,
    autoCollapsed,
    manualCollapsed,
  };
}

function getAllNodesInSubgraph(
  info: SubgraphInfo,
  subgraphs: Map<string, SubgraphInfo>
): string[] {
  const nodes = [...info.nodeIds];
  for (const childId of info.childSubgraphs) {
    const child = subgraphs.get(childId);
    if (child) nodes.push(...getAllNodesInSubgraph(child, subgraphs));
  }
  return nodes;
}

// ─── Focus Mode ──────────────────────────────────────────────────────────────

/**
 * Find which subgraph contains a given node.
 */
export function findContainingSubgraph(
  nodeId: string,
  subgraphs: Map<string, SubgraphInfo>
): string | null {
  let deepest: SubgraphInfo | null = null;
  
  for (const info of subgraphs.values()) {
    if (info.nodeIds.includes(nodeId)) {
      if (!deepest || (info.parent && info.parent === deepest.id)) {
        deepest = info;
      }
    }
  }
  
  return deepest?.id || null;
}

/**
 * Get path from root to a subgraph.
 */
export function getPathToRoot(
  subgraphId: string,
  subgraphs: Map<string, SubgraphInfo>
): string[] {
  const path: string[] = [];
  let current = subgraphs.get(subgraphId);
  
  while (current) {
    path.unshift(current.id);
    current = current.parent ? subgraphs.get(current.parent) : undefined;
  }
  
  return path;
}

/**
 * Enter focus mode on a specific node.
 */
export function focusOnNode(
  nodeId: string,
  subgraphs: Map<string, SubgraphInfo>,
  currentState: CollapseState
): CollapseState {
  const containingSubgraph = findContainingSubgraph(nodeId, subgraphs);
  if (!containingSubgraph) return currentState;
  
  const focusPath = getPathToRoot(containingSubgraph, subgraphs);
  const newCollapsed = new Set<string>();
  
  // Collapse all subgraphs not in focus path
  for (const info of subgraphs.values()) {
    if (!focusPath.includes(info.id) && info.parent === focusPath[0]) {
      newCollapsed.add(info.id);
    }
  }
  
  return {
    collapsed: newCollapsed,
    focusPath,
    focusedSubgraph: containingSubgraph,
  };
}

/**
 * Navigate to a specific breadcrumb.
 */
export function navigateToBreadcrumb(
  breadcrumbId: string,
  _subgraphs: Map<string, SubgraphInfo>,
  currentState: CollapseState
): CollapseState {
  if (breadcrumbId === 'root') {
    return exitFocus(currentState);
  }
  
  const index = currentState.focusPath.indexOf(breadcrumbId);
  if (index === -1) return currentState;
  
  const newFocusPath = currentState.focusPath.slice(0, index + 1);
  const focusedSubgraph = newFocusPath[newFocusPath.length - 1] || null;
  
  return {
    ...currentState,
    focusPath: newFocusPath,
    focusedSubgraph,
  };
}

/**
 * Exit focus mode.
 */
export function exitFocus(_state: CollapseState): CollapseState {
  return {
    collapsed: new Set(),
    focusPath: [],
    focusedSubgraph: null,
  };
}

/**
 * Get breadcrumb path for current state.
 */
export function getBreadcrumbs(
  state: CollapseState,
  subgraphs: Map<string, SubgraphInfo>
): Array<{ id: string; label: string }> {
  const crumbs: Array<{ id: string; label: string }> = [{ id: 'root', label: 'Overview' }];
  
  for (const id of state.focusPath) {
    const info = subgraphs.get(id);
    if (info) crumbs.push({ id, label: info.label });
  }
  
  return crumbs;
}
