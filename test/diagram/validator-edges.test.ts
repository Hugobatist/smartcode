import { describe, it, expect } from 'vitest';
import { validateMermaidSyntax } from '../../src/diagram/validator.js';

/**
 * Edge validation tests. The original heuristic validator only caught a dangling
 * `-->` at end of line and balanced brackets. These exercise the stronger
 * validation that reuses the real edge parser (EDGE_OPS + parseEdgesFromLine):
 * a line carrying an edge operator that yields no parseable edge is flagged —
 * the same edges the renderer would fail to draw.
 *
 * The "accepts ..." cases guard against false positives: valid edges of every
 * supported operator must stay valid (a noisy validator erodes trust since it
 * is surfaced to the developer and the AI, even though it never blocks saving).
 */
describe('validateMermaidSyntax - edge validation', () => {
  it('flags a dangling dotted arrow (-.->) at end of line', () => {
    const r = validateMermaidSyntax('flowchart LR\n    A -.->');
    expect(r.valid).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it('flags a dangling thick arrow (==>) at end of line', () => {
    const r = validateMermaidSyntax('flowchart LR\n    A ==>');
    expect(r.valid).toBe(false);
  });

  it('flags a dangling open link (---) at end of line', () => {
    const r = validateMermaidSyntax('flowchart LR\n    A ---');
    expect(r.valid).toBe(false);
  });

  it('flags an edge with no source node', () => {
    const r = validateMermaidSyntax('flowchart LR\n    --> B');
    expect(r.valid).toBe(false);
  });

  it('still flags a dangling --> with a "Dangling arrow" message', () => {
    const r = validateMermaidSyntax('flowchart LR\n    A -->\n    B --> C');
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.message.includes('Dangling arrow'))).toBe(true);
  });

  // ── Anti-false-positive: valid edges of every supported operator stay valid ──
  it('accepts a valid open link (---)', () => {
    expect(validateMermaidSyntax('flowchart LR\n    A --- B').valid).toBe(true);
  });

  it('accepts a valid dotted arrow (-.->)', () => {
    expect(validateMermaidSyntax('flowchart LR\n    A -.-> B').valid).toBe(true);
  });

  it('accepts a valid thick arrow (==>)', () => {
    expect(validateMermaidSyntax('flowchart LR\n    A ==> B').valid).toBe(true);
  });

  it('accepts a pipe-labeled edge (-->|label|)', () => {
    expect(validateMermaidSyntax('flowchart LR\n    A -->|yes| B').valid).toBe(true);
  });

  it('accepts a bidirectional arrow (<-->)', () => {
    expect(validateMermaidSyntax('flowchart LR\n    A <--> B').valid).toBe(true);
  });

  it('accepts an arrow inside a quoted node label without flagging it as an edge', () => {
    expect(validateMermaidSyntax('flowchart LR\n    A["go --> here"] --> B').valid).toBe(true);
  });

  it('accepts a chained edge (A --> B --> C)', () => {
    expect(validateMermaidSyntax('flowchart LR\n    A --> B --> C').valid).toBe(true);
  });
});
