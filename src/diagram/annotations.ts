/**
 * Backend annotation API — a thin facade over the shared annotations-core module.
 *
 * The parsing/serialization logic lives in annotations-core.ts (shared verbatim
 * with the browser viewer via the tsup IIFE bundle). This file keeps the
 * historical positional injectAnnotations signature used by existing callers and
 * adds debug logging for unrecognized in-block lines.
 */
import type { Flag, GhostPathAnnotation, NodeStatus, RiskAnnotation } from './types.js';
import { log } from '../utils/logger.js';
import {
  parseAllAnnotations as coreParseAllAnnotations,
  injectAnnotations as coreInjectAnnotations,
  stripAnnotations,
  ANNOTATION_START,
  ANNOTATION_END,
  BREAKPOINT_REGEX,
  RISK_REGEX,
  GHOST_REGEX,
  type AllAnnotations,
} from './annotations-core.js';

export {
  stripAnnotations,
  ANNOTATION_START,
  ANNOTATION_END,
  BREAKPOINT_REGEX,
  RISK_REGEX,
  GHOST_REGEX,
};
export type { AllAnnotations };

/**
 * Parse all annotation types (flags, statuses, breakpoints, risks, ghosts).
 * Unrecognized lines inside the annotation block are logged at debug level.
 */
export function parseAllAnnotations(content: string): AllAnnotations {
  return coreParseAllAnnotations(content, (line) => {
    log.debug(`Skipping unrecognized annotation line: ${line}`);
  });
}

/** Parse all `%% @flag` lines. Delegates to parseAllAnnotations. */
export function parseFlags(content: string): Map<string, Flag> {
  return parseAllAnnotations(content).flags;
}

/** Parse all `%% @status` lines. Delegates to parseAllAnnotations. */
export function parseStatuses(content: string): Map<string, NodeStatus> {
  return parseAllAnnotations(content).statuses;
}

/** Parse all `%% @breakpoint` lines. Delegates to parseAllAnnotations. */
export function parseBreakpoints(content: string): Set<string> {
  return parseAllAnnotations(content).breakpoints;
}

/** Parse all `%% @risk` lines. Delegates to parseAllAnnotations. */
export function parseRisks(content: string): Map<string, RiskAnnotation> {
  return parseAllAnnotations(content).risks;
}

/** Parse all `%% @ghost` lines. Delegates to parseAllAnnotations. */
export function parseGhosts(content: string): GhostPathAnnotation[] {
  return parseAllAnnotations(content).ghosts;
}

/**
 * Strip existing annotations, then append a new annotation block at the end.
 * Positional signature kept for backward compatibility with existing callers
 * (delegates to the object-based annotations-core implementation).
 */
export function injectAnnotations(
  content: string,
  flags: Map<string, Flag>,
  statuses?: Map<string, NodeStatus>,
  breakpoints?: Set<string>,
  risks?: Map<string, RiskAnnotation>,
  ghosts?: GhostPathAnnotation[],
): string {
  return coreInjectAnnotations(content, { flags, statuses, breakpoints, risks, ghosts });
}
