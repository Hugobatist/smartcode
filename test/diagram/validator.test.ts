import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateMermaidSyntax } from '../../src/diagram/validator.js';

const fixturesDir = join(import.meta.dirname, '..', 'fixtures');
const validFlowchartContent = readFileSync(join(fixturesDir, 'valid-flowchart.mmd'), 'utf-8');
const malformedContent = readFileSync(join(fixturesDir, 'malformed.mmd'), 'utf-8');

describe('validateMermaidSyntax', () => {
  it('valid flowchart returns valid: true with empty errors', () => {
    const result = validateMermaidSyntax(validFlowchartContent);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.diagramType).toBe('flowchart');
  });

  it('malformed content returns valid: false with at least one error', () => {
    const result = validateMermaidSyntax(malformedContent);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('error objects have a message field that is a non-empty string', () => {
    const result = validateMermaidSyntax(malformedContent);
    for (const error of result.errors) {
      expect(typeof error.message).toBe('string');
      expect(error.message.length).toBeGreaterThan(0);
    }
  });

  it('empty content returns invalid', () => {
    const result = validateMermaidSyntax('');
    expect(result.valid).toBe(false);
    expect(result.errors[0]?.message).toBe('Empty diagram content');
  });

  it('unknown diagram type returns invalid', () => {
    const result = validateMermaidSyntax('notADiagram\n    A --> B');
    expect(result.valid).toBe(false);
    expect(result.errors[0]?.message).toContain('Unknown diagram type');
  });

  it('detects unclosed brackets', () => {
    const content = 'flowchart LR\n    A["unclosed --> B';
    const result = validateMermaidSyntax(content);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('Unclosed'))).toBe(true);
  });

  it('detects dangling arrows', () => {
    const content = 'flowchart LR\n    A -->\n    B --> C';
    const result = validateMermaidSyntax(content);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('Dangling arrow'))).toBe(true);
  });

  it('valid sequenceDiagram passes validation', () => {
    const content = 'sequenceDiagram\n    Alice->>Bob: Hello';
    const result = validateMermaidSyntax(content);
    expect(result.valid).toBe(true);
    expect(result.diagramType).toBe('sequenceDiagram');
  });
});
