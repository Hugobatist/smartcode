import type { Flag, NodeStatus } from './types.js';
import { log } from '../utils/logger.js';

export const ANNOTATION_START = '%% --- ANNOTATIONS (auto-managed by SmartB Diagrams) ---';
export const ANNOTATION_END = '%% --- END ANNOTATIONS ---';
const FLAG_REGEX = /^%%\s*@flag\s+(\S+)\s+"([^"]*)"$/;
const STATUS_REGEX = /^%%\s*@status\s+(\S+)\s+(\S+)$/;

/**
 * Parse all `%% @flag` lines from within the annotation block.
 * Unrecognized lines are skipped with a debug warning.
 * Returns a Map keyed by nodeId.
 */
export function parseFlags(content: string): Map<string, Flag> {
  const flags = new Map<string, Flag>();
  const lines = content.split('\n');

  let inBlock = false;
  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === ANNOTATION_START) {
      inBlock = true;
      continue;
    }

    if (trimmed === ANNOTATION_END) {
      inBlock = false;
      continue;
    }

    if (!inBlock) continue;

    // Skip empty lines inside the block
    if (trimmed === '') continue;

    const match = FLAG_REGEX.exec(trimmed);
    if (match) {
      const nodeId = match[1]!;
      const message = match[2]!;
      flags.set(nodeId, { nodeId, message });
    } else if (!STATUS_REGEX.test(trimmed)) {
      log.debug(`Skipping unrecognized annotation line: ${trimmed}`);
    }
  }

  return flags;
}

const VALID_STATUSES: readonly string[] = ['ok', 'problem', 'in-progress', 'discarded'];

/**
 * Parse all `%% @status` lines from within the annotation block.
 * Returns a Map keyed by nodeId with NodeStatus values.
 */
export function parseStatuses(content: string): Map<string, NodeStatus> {
  const statuses = new Map<string, NodeStatus>();
  const lines = content.split('\n');

  let inBlock = false;
  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === ANNOTATION_START) {
      inBlock = true;
      continue;
    }

    if (trimmed === ANNOTATION_END) {
      inBlock = false;
      continue;
    }

    if (!inBlock) continue;

    if (trimmed === '') continue;

    const match = STATUS_REGEX.exec(trimmed);
    if (match) {
      const nodeId = match[1]!;
      const statusValue = match[2]!;
      if (VALID_STATUSES.includes(statusValue)) {
        statuses.set(nodeId, statusValue as NodeStatus);
      } else {
        log.debug(`Skipping invalid status value: ${statusValue}`);
      }
    }
    // Non-status lines (flags, etc.) are silently skipped here
  }

  return statuses;
}

/**
 * Remove the entire annotation block (from ANNOTATION_START to ANNOTATION_END inclusive)
 * and any trailing blank lines. Returns pure Mermaid content.
 */
export function stripAnnotations(content: string): string {
  const lines = content.split('\n');
  const result: string[] = [];

  let inBlock = false;
  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === ANNOTATION_START) {
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

  // Remove trailing blank lines
  while (result.length > 0 && result[result.length - 1]!.trim() === '') {
    result.pop();
  }

  // Ensure single trailing newline
  return result.join('\n') + '\n';
}

/**
 * Strip existing annotations, then append a new annotation block at the end.
 * If both flags and statuses maps are empty, returns content with no annotation block.
 * Escapes double quotes in flag messages by replacing " with ''.
 */
export function injectAnnotations(
  content: string,
  flags: Map<string, Flag>,
  statuses?: Map<string, NodeStatus>,
): string {
  const clean = stripAnnotations(content);

  const hasFlags = flags.size > 0;
  const hasStatuses = statuses !== undefined && statuses.size > 0;

  if (!hasFlags && !hasStatuses) {
    return clean;
  }

  const lines: string[] = [
    '',
    ANNOTATION_START,
  ];

  for (const [nodeId, flag] of flags) {
    const escapedMessage = flag.message.replace(/"/g, "''");
    lines.push(`%% @flag ${nodeId} "${escapedMessage}"`);
  }

  if (hasStatuses) {
    for (const [nodeId, status] of statuses!) {
      lines.push(`%% @status ${nodeId} ${status}`);
    }
  }

  lines.push(ANNOTATION_END);
  lines.push('');

  return clean.trimEnd() + '\n' + lines.join('\n');
}
