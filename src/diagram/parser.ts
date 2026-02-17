import type { Flag } from './types.js';
import { stripAnnotations, parseFlags } from './annotations.js';
import { KNOWN_DIAGRAM_TYPES } from './constants.js';

/**
 * Extract the diagram type from the first non-empty, non-comment line.
 * Returns the matched type string or undefined if no match.
 */
export function parseDiagramType(content: string): string | undefined {
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and Mermaid comments
    if (trimmed === '' || trimmed.startsWith('%%')) continue;

    // Check if the line starts with a known diagram type keyword
    for (const diagramType of KNOWN_DIAGRAM_TYPES) {
      if (trimmed === diagramType || trimmed.startsWith(diagramType + ' ')) {
        return diagramType;
      }
    }

    // First non-empty, non-comment line didn't match any known type
    return undefined;
  }

  return undefined;
}

/**
 * Convenience function that strips annotations, parses flags, and detects diagram type.
 * Returns all three results together.
 */
export function parseDiagramContent(rawContent: string): {
  mermaidContent: string;
  flags: Map<string, Flag>;
  diagramType?: string;
} {
  const mermaidContent = stripAnnotations(rawContent);
  const flags = parseFlags(rawContent);
  const diagramType = parseDiagramType(mermaidContent);

  return { mermaidContent, flags, diagramType };
}
