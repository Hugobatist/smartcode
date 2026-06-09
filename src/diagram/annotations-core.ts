/**
 * Single source of truth for SmartCode annotation parsing/serialization.
 *
 * This module is shared verbatim by the backend (src/diagram/annotations.ts)
 * and the browser viewer (static/annotations.js, via the tsup-built IIFE bundle
 * static/vendor/annotations-core.js exposing window.SmartCodeAnnotationsCore).
 *
 * It MUST stay free of any runtime dependency on Node or the DOM so the same
 * code runs in both environments. Type-only imports are erased at build time.
 */
import type { Flag, GhostPathAnnotation, NodeStatus, RiskAnnotation, RiskLevel } from './types.js';

export const ANNOTATION_START = '%% --- ANNOTATIONS (auto-managed by SmartCode) ---';
/** Legacy start marker, kept for backward compat with older .mmd files. */
export const ANNOTATION_START_LEGACY = '%% --- ANNOTATIONS (auto-managed by SmartB Diagrams) ---';
export const ANNOTATION_END = '%% --- END ANNOTATIONS ---';

/** True if the line is either the current or the legacy annotation start marker. */
export function isAnnotationStart(line: string): boolean {
  return line === ANNOTATION_START || line === ANNOTATION_START_LEGACY;
}

export const FLAG_REGEX = /^%%\s*@flag\s+(\S+)\s+"([^"]*)"$/;
export const STATUS_REGEX = /^%%\s*@status\s+(\S+)\s+(\S+)$/;
export const BREAKPOINT_REGEX = /^%%\s*@breakpoint\s+(\S+)$/;
export const RISK_REGEX = /^%%\s*@risk\s+(\S+)\s+(high|medium|low)\s+"([^"]*)"$/;
export const GHOST_REGEX = /^%%\s*@ghost\s+(\S+)\s+(\S+)\s+"([^"]*)"$/;

export const VALID_STATUSES: readonly string[] = ['ok', 'problem', 'in-progress', 'discarded'];

/** Result of parsing all annotation types in a single pass. */
export interface AllAnnotations {
  flags: Map<string, Flag>;
  statuses: Map<string, NodeStatus>;
  breakpoints: Set<string>;
  risks: Map<string, RiskAnnotation>;
  ghosts: GhostPathAnnotation[];
}

/** Annotations accepted when serializing a block. Only `flags` is required. */
export interface AnnotationInput {
  flags: Map<string, Flag>;
  statuses?: Map<string, NodeStatus>;
  breakpoints?: Set<string>;
  risks?: Map<string, RiskAnnotation>;
  ghosts?: GhostPathAnnotation[];
}

/** Optional hook invoked for each in-block line that matched no annotation regex. */
export type OnUnrecognized = (line: string) => void;

/**
 * Parse every annotation type (flags, statuses, breakpoints, risks, ghosts) in a
 * single pass. Recognizes both the current and legacy start markers. Invalid
 * status values are discarded.
 */
export function parseAllAnnotations(content: string, onUnrecognized?: OnUnrecognized): AllAnnotations {
  const flags = new Map<string, Flag>();
  const statuses = new Map<string, NodeStatus>();
  const breakpoints = new Set<string>();
  const risks = new Map<string, RiskAnnotation>();
  const ghosts: GhostPathAnnotation[] = [];
  const lines = content.split('\n');

  let inBlock = false;
  for (const line of lines) {
    const trimmed = line.trim();

    if (isAnnotationStart(trimmed)) {
      inBlock = true;
      continue;
    }
    if (trimmed === ANNOTATION_END) {
      inBlock = false;
      continue;
    }
    if (!inBlock || trimmed === '') continue;

    let match = FLAG_REGEX.exec(trimmed);
    if (match) {
      flags.set(match[1]!, { nodeId: match[1]!, message: match[2]! });
      continue;
    }

    match = STATUS_REGEX.exec(trimmed);
    if (match) {
      const statusValue = match[2]!;
      if (VALID_STATUSES.includes(statusValue)) {
        statuses.set(match[1]!, statusValue as NodeStatus);
      }
      continue;
    }

    match = BREAKPOINT_REGEX.exec(trimmed);
    if (match) {
      breakpoints.add(match[1]!);
      continue;
    }

    match = RISK_REGEX.exec(trimmed);
    if (match) {
      risks.set(match[1]!, { nodeId: match[1]!, level: match[2]! as RiskLevel, reason: match[3]! });
      continue;
    }

    match = GHOST_REGEX.exec(trimmed);
    if (match) {
      ghosts.push({ fromNodeId: match[1]!, toNodeId: match[2]!, label: match[3]! });
      continue;
    }

    onUnrecognized?.(trimmed);
  }

  return { flags, statuses, breakpoints, risks, ghosts };
}

/**
 * Remove the entire annotation block (current or legacy marker) and any trailing
 * blank lines. Returns pure Mermaid content with a single trailing newline.
 */
export function stripAnnotations(content: string): string {
  const lines = content.split('\n');
  const result: string[] = [];

  let inBlock = false;
  for (const line of lines) {
    const trimmed = line.trim();

    if (isAnnotationStart(trimmed)) {
      inBlock = true;
      continue;
    }
    if (trimmed === ANNOTATION_END) {
      inBlock = false;
      continue;
    }
    if (!inBlock) {
      result.push(line);
    }
  }

  while (result.length > 0 && result[result.length - 1]!.trim() === '') {
    result.pop();
  }

  return result.join('\n') + '\n';
}

/**
 * Strip existing annotations, then append a fresh annotation block at the end.
 * Returns clean content (no block) when no annotations are present.
 * Double quotes inside messages/reasons/labels are escaped as two single quotes.
 */
export function injectAnnotations(content: string, ann: AnnotationInput): string {
  const clean = stripAnnotations(content);

  const { flags, statuses, breakpoints, risks, ghosts } = ann;
  const hasFlags = flags.size > 0;
  const hasStatuses = statuses !== undefined && statuses.size > 0;
  const hasBreakpoints = breakpoints !== undefined && breakpoints.size > 0;
  const hasRisks = risks !== undefined && risks.size > 0;
  const hasGhosts = ghosts !== undefined && ghosts.length > 0;

  if (!hasFlags && !hasStatuses && !hasBreakpoints && !hasRisks && !hasGhosts) {
    return clean;
  }

  const lines: string[] = ['', ANNOTATION_START];

  for (const [nodeId, flag] of flags) {
    lines.push(`%% @flag ${nodeId} "${flag.message.replace(/"/g, "''")}"`);
  }
  if (hasStatuses) {
    for (const [nodeId, status] of statuses!) {
      lines.push(`%% @status ${nodeId} ${status}`);
    }
  }
  if (hasBreakpoints) {
    for (const nodeId of breakpoints!) {
      lines.push(`%% @breakpoint ${nodeId}`);
    }
  }
  if (hasRisks) {
    for (const [nodeId, risk] of risks!) {
      lines.push(`%% @risk ${nodeId} ${risk.level} "${risk.reason.replace(/"/g, "''")}"`);
    }
  }
  if (hasGhosts) {
    for (const ghost of ghosts!) {
      lines.push(`%% @ghost ${ghost.fromNodeId} ${ghost.toNodeId} "${ghost.label.replace(/"/g, "''")}"`);
    }
  }

  lines.push(ANNOTATION_END);
  lines.push('');

  return clean.trimEnd() + '\n' + lines.join('\n');
}
