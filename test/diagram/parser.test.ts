import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDiagramType, parseDiagramContent } from '../../src/diagram/parser.js';

const fixturesDir = join(import.meta.dirname, '..', 'fixtures');
const validFlowchartContent = readFileSync(join(fixturesDir, 'valid-flowchart.mmd'), 'utf-8');
const withFlagsContent = readFileSync(join(fixturesDir, 'with-flags.mmd'), 'utf-8');

describe('parseDiagramType', () => {
  it('detects flowchart', () => {
    expect(parseDiagramType('flowchart LR\n    A --> B')).toBe('flowchart');
  });

  it('detects graph', () => {
    expect(parseDiagramType('graph TD\n    A --> B')).toBe('graph');
  });

  it('detects sequenceDiagram', () => {
    expect(parseDiagramType('sequenceDiagram\n    Alice->>Bob: Hello')).toBe('sequenceDiagram');
  });

  it('returns undefined for gibberish', () => {
    expect(parseDiagramType('not a diagram type\n    A --> B')).toBeUndefined();
  });

  it('returns undefined for empty content', () => {
    expect(parseDiagramType('')).toBeUndefined();
  });

  it('skips comment lines to find diagram type', () => {
    const content = '%% A comment\n%% Another comment\nflowchart LR\n    A --> B';
    expect(parseDiagramType(content)).toBe('flowchart');
  });
});

describe('parseDiagramContent', () => {
  it('correctly splits Mermaid content from flags', () => {
    const result = parseDiagramContent(withFlagsContent);

    // Mermaid content should not contain annotations
    expect(result.mermaidContent).not.toContain('@flag');

    // Flags should be extracted
    expect(result.flags.size).toBe(2);
    expect(result.flags.get('B')?.message).toBe('This step is too slow, consider batching');
    expect(result.flags.get('C')?.message).toBe('Output format should be JSON not CSV');
  });

  it('detects diagram type', () => {
    const result = parseDiagramContent(validFlowchartContent);
    expect(result.diagramType).toBe('flowchart');
  });

  it('returns empty flags for clean content', () => {
    const result = parseDiagramContent(validFlowchartContent);
    expect(result.flags.size).toBe(0);
  });
});
