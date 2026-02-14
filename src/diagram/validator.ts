import type { ValidationResult } from './types.js';
import { parseDiagramType } from './parser.js';

const KNOWN_DIAGRAM_TYPES = [
  'flowchart',
  'graph',
  'sequenceDiagram',
  'classDiagram',
  'stateDiagram',
  'erDiagram',
  'gantt',
  'pie',
  'gitgraph',
  'mindmap',
  'timeline',
];

/**
 * Validate Mermaid syntax using a regex-based heuristic approach.
 *
 * The @mermaid-js/parser package (v0.6) only supports a limited set of diagram types
 * (info, packet, pie, architecture, gitGraph, radar) and does NOT support flowchart,
 * which is the primary diagram type for SmartB. We use a heuristic validator that
 * catches obvious syntax errors. Browser-side Mermaid.js catches the rest at render time.
 */
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

  // Check bracket matching
  const bracketErrors = checkBracketMatching(content);
  errors.push(...bracketErrors);

  // Check for dangling arrows (lines ending with --> with nothing after)
  const danglingErrors = checkDanglingArrows(content);
  errors.push(...danglingErrors);

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
 * Check for dangling arrows (lines ending with an arrow operator and nothing after).
 */
function checkDanglingArrows(content: string): ValidationResult['errors'] {
  const errors: ValidationResult['errors'] = [];
  const lines = content.split('\n');

  const danglingArrowPattern = /-->\s*$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const lineNum = i + 1;
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (trimmed === '' || trimmed.startsWith('%%')) continue;

    if (danglingArrowPattern.test(trimmed)) {
      errors.push({
        message: `Dangling arrow -- line ends with '-->' but no target node`,
        line: lineNum,
      });
    }
  }

  return errors;
}
