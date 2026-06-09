import type { ValidationResult } from './types.js';
import { parseDiagramType } from './parser.js';
import { KNOWN_DIAGRAM_TYPES } from './constants.js';
import { EDGE_OPS, parseEdgesFromLine } from './graph-edge-parser.js';

/**
 * Validate Mermaid syntax.
 *
 * For flow diagrams (the project's primary type), edge structure is validated by
 * reusing the production edge parser (EDGE_OPS + parseEdgesFromLine): a line that
 * carries an edge operator but yields no parseable edge is flagged. This matches
 * exactly what the renderer can draw, so it adds no false positives. Bracket
 * balance is checked for all types. Anything subtler is left to browser-side
 * Mermaid.js at render time — the validator is advisory and never blocks saving.
 */
const FLOW_DIAGRAM_TYPES = new Set(['flowchart', 'graph']);

export function validateMermaidSyntax(content: string): ValidationResult {
  const errors: ValidationResult['errors'] = [];
  const trimmedContent = content.trim();

  if (trimmedContent === '') {
    return { valid: false, errors: [{ message: 'Empty diagram content' }] };
  }

  // Detect diagram type from first meaningful line
  const diagramType = parseDiagramType(content);

  if (!diagramType) {
    const firstLine = trimmedContent.split('\n')[0]?.trim() ?? '';
    errors.push({
      message: `Unknown diagram type. First line: "${firstLine}". Expected one of: ${KNOWN_DIAGRAM_TYPES.join(', ')}`,
      line: 1,
    });
    return { valid: false, errors, diagramType: undefined };
  }

  errors.push(...checkBracketMatching(content));

  if (FLOW_DIAGRAM_TYPES.has(diagramType)) {
    errors.push(...checkEdgeSyntax(content));
  }

  return {
    valid: errors.length === 0,
    errors,
    diagramType,
  };
}

/**
 * Check for unmatched brackets in the content.
 */
function checkBracketMatching(content: string): ValidationResult['errors'] {
  const errors: ValidationResult['errors'] = [];
  const lines = content.split('\n');

  const pairs: Array<[string, string]> = [['[', ']'], ['(', ')'], ['{', '}']];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const lineNum = i + 1;

    // Skip comment lines
    if (line.trim().startsWith('%%')) continue;

    for (const [open, close] of pairs) {
      let depth = 0;
      for (const char of line) {
        if (char === open) depth++;
        if (char === close) depth--;
        if (depth < 0) {
          errors.push({
            message: `Unexpected closing '${close}' without matching '${open}'`,
            line: lineNum,
          });
          break;
        }
      }
      if (depth > 0) {
        errors.push({
          message: `Unclosed '${open}' -- missing '${close}'`,
          line: lineNum,
        });
      }
    }
  }

  return errors;
}

/**
 * Flag lines that carry an edge operator the project supports but produce no
 * parseable edge: dangling arrows, a missing source/target, or otherwise
 * malformed links. Uses the same parser the renderer relies on, so a valid edge
 * of any supported operator is never flagged.
 */
function checkEdgeSyntax(content: string): ValidationResult['errors'] {
  const errors: ValidationResult['errors'] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]!.trim();
    if (trimmed === '' || trimmed.startsWith('%%')) continue;

    if (!hasEdgeOperator(trimmed)) continue;
    if (parseEdgesFromLine(trimmed).length > 0) continue;

    errors.push({ message: classifyBadEdge(trimmed), line: i + 1 });
  }

  return errors;
}

/** True if the line contains any supported edge operator. */
function hasEdgeOperator(line: string): boolean {
  return EDGE_OPS.some((op) => op.pattern.test(line));
}

/** Produce a specific message for an edge-bearing line that did not parse. */
function classifyBadEdge(line: string): string {
  for (const op of EDGE_OPS) {
    const match = op.pattern.exec(line);
    if (!match) continue;

    // Operator sits at the end of the line — nothing follows it.
    if (match.index + match[0].length >= line.length) {
      return `Dangling arrow -- "${line}" ends with an edge operator but has no target node`;
    }
    // Operator sits at the start of the line — nothing precedes it.
    if (line.slice(0, match.index).trim() === '') {
      return `Edge without a source -- "${line}" starts with an edge operator`;
    }
    break;
  }
  return `Malformed edge -- "${line}" has an edge operator but no valid endpoints`;
}
