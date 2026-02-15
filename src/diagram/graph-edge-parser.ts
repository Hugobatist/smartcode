/**
 * SmartB Diagrams - Graph Edge Parser Helpers
 * Extracts edge definitions and node ID references from Mermaid lines.
 * Used by graph-parser.ts as part of the multi-pass pipeline.
 */

import type { NodeShape, EdgeType } from './graph-types.js';
import { SHAPE_PATTERNS } from './graph-types.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SimpleEdge {
  from: string;
  to: string;
  type: EdgeType;
  label?: string;
  bidirectional: boolean;
}

// ─── Edge parsing patterns ──────────────────────────────────────────────────

/**
 * All edge operator patterns, ordered by specificity (longest first).
 */
export const EDGE_OPS: Array<{
  pattern: RegExp;
  type: EdgeType;
  bidirectional: boolean;
}> = [
  // Bidirectional variants (must come before unidirectional)
  { pattern: /\s*<==>\s*/, type: 'thick', bidirectional: true },
  { pattern: /\s*<-\.->\s*/, type: 'dotted', bidirectional: true },
  { pattern: /\s*<-->\s*/, type: 'arrow', bidirectional: true },
  // Labeled edges: pipe syntax  -->|"label"|  or  -->|label|
  { pattern: /\s*-->\|"([^"]*)"\|\s*/, type: 'arrow', bidirectional: false },
  { pattern: /\s*-->\|([^|]*)\|\s*/, type: 'arrow', bidirectional: false },
  // Labeled edges: inline syntax  -- "label" -->
  { pattern: /\s*--\s*"([^"]*)"\s*-->\s*/, type: 'arrow', bidirectional: false },
  // Unlabeled operators (order: longest first)
  { pattern: /\s*~~~\s*/, type: 'invisible', bidirectional: false },
  { pattern: /\s*==>\s*/, type: 'thick', bidirectional: false },
  { pattern: /\s*-\.->\s*/, type: 'dotted', bidirectional: false },
  { pattern: /\s*---\s*/, type: 'open', bidirectional: false },
  { pattern: /\s*-->\s*/, type: 'arrow', bidirectional: false },
];

// ─── Inline class stripping ─────────────────────────────────────────────────

export function stripInlineClass(ref: string): { id: string; className?: string } {
  const classIdx = ref.indexOf(':::');
  if (classIdx === -1) return { id: ref };
  return {
    id: ref.substring(0, classIdx),
    className: ref.substring(classIdx + 3),
  };
}

// ─── Node shape parsing ─────────────────────────────────────────────────────

export function parseNodeShape(definition: string): {
  id: string;
  label: string;
  shape: NodeShape;
  className?: string;
} | null {
  const trimmed = definition.trim();
  if (!trimmed) return null;

  const { id: withShape, className } = stripInlineClass(trimmed);

  for (const sp of SHAPE_PATTERNS) {
    const openIdx = withShape.indexOf(sp.open);
    if (openIdx === -1) continue;

    const nodeId = withShape.substring(0, openIdx).trim();
    if (!nodeId || !/^[\w][\w\d_-]*$/.test(nodeId)) continue;

    const afterOpen = withShape.substring(openIdx + sp.open.length);
    if (!afterOpen.endsWith(sp.close)) continue;

    const labelRaw = afterOpen.substring(0, afterOpen.length - sp.close.length);

    let label = labelRaw;
    if (label.startsWith('"') && label.endsWith('"')) {
      label = label.substring(1, label.length - 1);
    }

    return { id: nodeId, label, shape: sp.shape, className };
  }

  return null;
}

// ─── Node segment extraction ────────────────────────────────────────────────

/**
 * Split a line into segments around edge operators.
 * E.g., `A["Start"] --> B["End"]` yields `['A["Start"]', 'B["End"]']`
 */
export function extractNodeSegments(line: string): string[] {
  let work = line;

  for (const op of EDGE_OPS) {
    work = work.replace(op.pattern, ' \x00 ');
  }

  return work.split('\x00').map(s => s.trim()).filter(Boolean);
}

// ─── Edge parsing ───────────────────────────────────────────────────────────

/**
 * Parse all edges from a line, handling chained edges like A-->B-->C.
 */
export function parseEdgesFromLine(line: string): SimpleEdge[] {
  const result: SimpleEdge[] = [];
  let remaining = line;
  let lastNode: string | null = null;

  while (remaining.trim()) {
    let earliest: {
      index: number;
      matchLen: number;
      type: EdgeType;
      bidirectional: boolean;
      label?: string;
    } | null = null;

    for (const op of EDGE_OPS) {
      const match = op.pattern.exec(remaining);
      if (match && (earliest === null || match.index < earliest.index)) {
        earliest = {
          index: match.index,
          matchLen: match[0].length,
          type: op.type,
          bidirectional: op.bidirectional,
          label: match[1],
        };
      }
    }

    if (!earliest) break;

    const beforeOp = remaining.substring(0, earliest.index).trim();
    remaining = remaining.substring(earliest.index + earliest.matchLen);

    if (lastNode === null) {
      lastNode = extractNodeId(beforeOp);
      if (!lastNode) break;
    }

    const afterTrimmed = remaining.trim();
    const nextNodeId = extractNodeId(afterTrimmed, 'left');
    if (!nextNodeId) break;

    result.push({
      from: lastNode,
      to: nextNodeId,
      type: earliest.type,
      label: earliest.label,
      bidirectional: earliest.bidirectional,
    });

    lastNode = nextNodeId;
    remaining = advancePastNode(remaining.trim(), nextNodeId);
  }

  return result;
}

// ─── Internal helpers ───────────────────────────────────────────────────────

/**
 * Extract a node ID from text.
 */
function extractNodeId(
  text: string,
  direction: 'right' | 'left' = 'right',
): string | null {
  if (!text.trim()) return null;

  const { id } = stripInlineClass(text.trim());

  const shaped = parseNodeShape(text.trim());
  if (shaped) return shaped.id;

  if (direction === 'left') {
    const match = /^([\w][\w\d_-]*)/.exec(id);
    return match ? match[1]! : null;
  }

  const match = /([\w][\w\d_-]*)$/.exec(id);
  return match ? match[1]! : null;
}

/**
 * Advance past a node definition in text (including any shape brackets).
 */
function advancePastNode(text: string, nodeId: string): string {
  const { id: cleanText } = stripInlineClass(text);

  for (const sp of SHAPE_PATTERNS) {
    const expectedStart = nodeId + sp.open;
    if (cleanText.startsWith(expectedStart)) {
      const closeIdx = cleanText.indexOf(sp.close, expectedStart.length);
      if (closeIdx !== -1) {
        const afterClose = closeIdx + sp.close.length;
        const afterWithClass = text.substring(afterClose);
        const classMatch = /^:::\S+/.exec(afterWithClass);
        return classMatch
          ? afterWithClass.substring(classMatch[0].length)
          : afterWithClass;
      }
    }
  }

  const safeId = regexSafe(nodeId);
  const simplePattern = new RegExp(`^${safeId}(?::::\\S+)?`);
  const simpleMatch = simplePattern.exec(text);
  if (simpleMatch) {
    return text.substring(simpleMatch[0].length);
  }

  return text.substring(nodeId.length);
}

/** Escape special regex characters in a string */
function regexSafe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
