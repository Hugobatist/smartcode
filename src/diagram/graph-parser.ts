/**
 * SmartB Diagrams - Mermaid to GraphModel Parser
 * Multi-pass parser that converts raw .mmd content into a structured GraphModel.
 */

import type { ValidationResult } from './types.js';
import type {
  GraphModel, GraphNode, GraphEdge, GraphSubgraph, FlowDirection,
} from './graph-types.js';
import { parseFlags, parseStatuses, stripAnnotations } from './annotations.js';
import { validateMermaidSyntax } from './validator.js';
import {
  stripInlineClass, parseNodeShape, extractNodeSegments, parseEdgesFromLine,
} from './graph-edge-parser.js';

// ─── Main Parser ─────────────────────────────────────────────────────────────

/**
 * Parse raw .mmd content into a structured GraphModel.
 * Uses a multi-pass pipeline: preprocessing, direction, styles,
 * subgraphs, nodes, edges, annotations merge, validation.
 */
export function parseMermaidToGraph(rawContent: string, filePath: string): GraphModel {
  // ── Pre-processing ──────────────────────────────────────────────────────
  const flags = parseFlags(rawContent);
  const statuses = parseStatuses(rawContent);
  const mermaidContent = stripAnnotations(rawContent);
  const lines = mermaidContent.split('\n');

  // ── Pass 1: Parse direction line ────────────────────────────────────────
  let diagramType: 'flowchart' | 'graph' = 'flowchart';
  let direction: FlowDirection = 'TB';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('%%')) continue;

    const dirMatch = /^(flowchart|graph)\s+(TB|TD|BT|LR|RL)/.exec(trimmed);
    if (dirMatch) {
      diagramType = dirMatch[1] as 'flowchart' | 'graph';
      const rawDir = dirMatch[2]!;
      direction = rawDir === 'TD' ? 'TB' : rawDir as FlowDirection;
    }
    break; // Only check the first non-empty, non-comment line
  }

  // ── Pass 2: Extract style directives ────────────────────────────────────
  const classDefs = new Map<string, string>();
  const nodeStyles = new Map<string, string>();
  const linkStyles = new Map<number, string>();
  const classAssignments = new Map<string, string>();
  const directiveLineIndices = new Set<number>();

  parseStyleDirectives(
    lines, classDefs, nodeStyles, linkStyles, classAssignments, directiveLineIndices,
  );

  // ── Pass 3: Parse subgraph structure ────────────────────────────────────
  const subgraphs = new Map<string, GraphSubgraph>();
  const lineToSubgraph = new Map<number, string>();
  const subgraphLineIndices = new Set<number>();

  parseSubgraphStructure(lines, subgraphs, lineToSubgraph, subgraphLineIndices);

  // ── Pass 4: Parse node definitions ──────────────────────────────────────
  const nodes = new Map<string, GraphNode>();

  parseNodeDefinitions(
    lines, nodes, classAssignments, lineToSubgraph,
    directiveLineIndices, subgraphLineIndices,
  );

  // ── Pass 5: Parse edge definitions ──────────────────────────────────────
  const edges: GraphEdge[] = [];

  parseEdgeDefinitions(
    lines, edges, nodes, subgraphs, lineToSubgraph,
    directiveLineIndices, subgraphLineIndices,
  );

  // ── Pass 6: Merge annotations into nodes ────────────────────────────────
  for (const [nodeId, flag] of flags) {
    const node = nodes.get(nodeId);
    if (node) node.flag = flag;
  }

  for (const [nodeId, status] of statuses) {
    const node = nodes.get(nodeId);
    if (node) node.status = status;
  }

  // ── Pass 7: Validate ───────────────────────────────────────────────────
  const validation: ValidationResult = validateMermaidSyntax(mermaidContent);

  // ── Assemble and return ─────────────────────────────────────────────────
  return {
    diagramType,
    direction,
    nodes,
    edges,
    subgraphs,
    classDefs,
    nodeStyles,
    linkStyles,
    classAssignments,
    filePath,
    flags,
    statuses,
    validation,
  };
}

// ─── Pass 2: Style directives ───────────────────────────────────────────────

function parseStyleDirectives(
  lines: string[],
  classDefs: Map<string, string>,
  nodeStyles: Map<string, string>,
  linkStyles: Map<number, string>,
  classAssignments: Map<string, string>,
  directiveLineIndices: Set<number>,
): void {
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]!.trim();

    const classDefMatch = /^classDef\s+(\S+)\s+(.+);?\s*$/.exec(trimmed);
    if (classDefMatch) {
      const name = classDefMatch[1]!;
      classDefs.set(name, classDefMatch[2]!.replace(/;\s*$/, ''));
      directiveLineIndices.add(i);
      continue;
    }

    const styleMatch = /^style\s+(\S+)\s+(.+);?\s*$/.exec(trimmed);
    if (styleMatch) {
      nodeStyles.set(styleMatch[1]!, styleMatch[2]!.replace(/;\s*$/, ''));
      directiveLineIndices.add(i);
      continue;
    }

    const linkStyleMatch = /^linkStyle\s+(\d+)\s+(.+);?\s*$/.exec(trimmed);
    if (linkStyleMatch) {
      linkStyles.set(
        parseInt(linkStyleMatch[1]!, 10),
        linkStyleMatch[2]!.replace(/;\s*$/, ''),
      );
      directiveLineIndices.add(i);
      continue;
    }

    const classDirectiveMatch = /^class\s+(.+?)\s+(\S+);?\s*$/.exec(trimmed);
    if (classDirectiveMatch) {
      const className = classDirectiveMatch[2]!.replace(/;\s*$/, '');
      const nodeIds = classDirectiveMatch[1]!.split(',').map(s => s.trim());
      for (const nid of nodeIds) {
        classAssignments.set(nid, className);
      }
      directiveLineIndices.add(i);
      continue;
    }
  }
}

// ─── Pass 3: Subgraph structure ─────────────────────────────────────────────

function parseSubgraphStructure(
  lines: string[],
  subgraphs: Map<string, GraphSubgraph>,
  lineToSubgraph: Map<number, string>,
  subgraphLineIndices: Set<number>,
): void {
  const subgraphStack: string[] = [];
  const SUBGRAPH_START = /^\s*subgraph\s+([^\s\[]+)(?:\s*\["([^"]+)"\])?/;
  const SUBGRAPH_END = /^\s*end\s*$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const startMatch = SUBGRAPH_START.exec(line);

    if (startMatch) {
      const id = startMatch[1]!;
      const label = startMatch[2] || id;
      const parentId = subgraphStack.length > 0
        ? subgraphStack[subgraphStack.length - 1]!
        : null;

      const sg: GraphSubgraph = {
        id, label, parentId, nodeIds: [], childSubgraphIds: [],
      };

      subgraphs.set(id, sg);
      if (parentId) {
        const parent = subgraphs.get(parentId);
        if (parent) parent.childSubgraphIds.push(id);
      }

      subgraphStack.push(id);
      subgraphLineIndices.add(i);
      continue;
    }

    if (SUBGRAPH_END.test(line) && subgraphStack.length > 0) {
      subgraphStack.pop();
      subgraphLineIndices.add(i);
      continue;
    }

    if (subgraphStack.length > 0) {
      lineToSubgraph.set(i, subgraphStack[subgraphStack.length - 1]!);
    }
  }
}

// ─── Pass 4: Node definitions ───────────────────────────────────────────────

const DIRECTION_LINE = /^(flowchart|graph)\s+(TB|TD|BT|LR|RL)/;

function isSkippableLine(
  trimmed: string,
  lineIdx: number,
  directiveIndices: Set<number>,
  subgraphIndices: Set<number>,
): boolean {
  if (directiveIndices.has(lineIdx)) return true;
  if (subgraphIndices.has(lineIdx)) return true;
  if (!trimmed || trimmed.startsWith('%%')) return true;
  if (DIRECTION_LINE.test(trimmed)) return true;
  return false;
}

function parseNodeDefinitions(
  lines: string[],
  nodes: Map<string, GraphNode>,
  classAssignments: Map<string, string>,
  lineToSubgraph: Map<number, string>,
  directiveLineIndices: Set<number>,
  subgraphLineIndices: Set<number>,
): void {
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]!.trim();
    if (isSkippableLine(trimmed, i, directiveLineIndices, subgraphLineIndices)) continue;

    const nodeSegments = extractNodeSegments(trimmed);

    for (const segment of nodeSegments) {
      const parsed = parseNodeShape(segment);
      if (parsed && !nodes.has(parsed.id)) {
        const subgraphId = lineToSubgraph.get(i);
        const cssClass = parsed.className || classAssignments.get(parsed.id);

        nodes.set(parsed.id, {
          id: parsed.id,
          label: parsed.label,
          shape: parsed.shape,
          subgraphId,
          cssClass,
        });

        if (parsed.className) {
          classAssignments.set(parsed.id, parsed.className);
        }
      } else if (!parsed) {
        // Handle bare ID:::className (no shape brackets)
        const { id: bareId, className } = stripInlineClass(segment.trim());
        if (className && /^[\w][\w\d_-]*$/.test(bareId)) {
          classAssignments.set(bareId, className);
          if (!nodes.has(bareId)) {
            nodes.set(bareId, {
              id: bareId,
              label: bareId,
              shape: 'rect',
              subgraphId: lineToSubgraph.get(i),
              cssClass: className,
            });
          } else {
            nodes.get(bareId)!.cssClass = className;
          }
        }
      }
    }
  }
}

// ─── Pass 5: Edge definitions ───────────────────────────────────────────────

function parseEdgeDefinitions(
  lines: string[],
  edges: GraphEdge[],
  nodes: Map<string, GraphNode>,
  subgraphs: Map<string, GraphSubgraph>,
  lineToSubgraph: Map<number, string>,
  directiveLineIndices: Set<number>,
  subgraphLineIndices: Set<number>,
): void {
  const edgeIdCounts = new Map<string, number>();

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]!.trim();
    if (isSkippableLine(trimmed, i, directiveLineIndices, subgraphLineIndices)) continue;

    const lineEdges = parseEdgesFromLine(trimmed);

    for (const edgeInfo of lineEdges) {
      const { id: fromId } = stripInlineClass(edgeInfo.from);
      const { id: toId } = stripInlineClass(edgeInfo.to);

      ensureNode(nodes, fromId, lineToSubgraph.get(i));
      ensureNode(nodes, toId, lineToSubgraph.get(i));

      // Track nodes inside subgraphs
      const sgId = lineToSubgraph.get(i);
      if (sgId) {
        const sg = subgraphs.get(sgId);
        if (sg) {
          if (!sg.nodeIds.includes(fromId) && !subgraphs.has(fromId)) {
            sg.nodeIds.push(fromId);
          }
          if (!sg.nodeIds.includes(toId) && !subgraphs.has(toId)) {
            sg.nodeIds.push(toId);
          }
        }
      }

      const baseId = `${fromId}->${toId}`;
      const count = edgeIdCounts.get(baseId) || 0;
      const edgeId = count === 0 ? baseId : `${baseId}#${count}`;
      edgeIdCounts.set(baseId, count + 1);

      edges.push({
        id: edgeId,
        from: fromId,
        to: toId,
        type: edgeInfo.type,
        label: edgeInfo.label,
        bidirectional: edgeInfo.bidirectional || undefined,
      });
    }
  }
}

// ─── Helper: ensure a node exists in the map ────────────────────────────────

function ensureNode(
  nodes: Map<string, GraphNode>,
  id: string,
  subgraphId?: string,
): void {
  if (nodes.has(id)) return;
  nodes.set(id, { id, label: id, shape: 'rect', subgraphId });
}
