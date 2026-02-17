import { describe, it, expect } from 'vitest';
import { KNOWN_DIAGRAM_TYPES, SUBGRAPH_START, SUBGRAPH_END } from '../../src/diagram/constants.js';

describe('KNOWN_DIAGRAM_TYPES', () => {
  it('contains all standard Mermaid diagram types', () => {
    const expected = [
      'flowchart', 'graph', 'sequenceDiagram', 'classDiagram',
      'stateDiagram', 'erDiagram', 'gantt', 'pie', 'gitgraph',
      'mindmap', 'timeline',
    ];
    for (const type of expected) {
      expect(KNOWN_DIAGRAM_TYPES).toContain(type);
    }
  });

  it('is a readonly tuple', () => {
    expect(Array.isArray(KNOWN_DIAGRAM_TYPES)).toBe(true);
    expect(KNOWN_DIAGRAM_TYPES.length).toBeGreaterThan(0);
  });
});

describe('SUBGRAPH_START', () => {
  it('matches simple subgraph with ID only', () => {
    const match = SUBGRAPH_START.exec('  subgraph myGroup');
    expect(match).not.toBeNull();
    expect(match![1]).toBe('myGroup');
  });

  it('matches subgraph with quoted label', () => {
    const match = SUBGRAPH_START.exec('  subgraph sg1["My Label"]');
    expect(match).not.toBeNull();
    expect(match![1]).toBe('sg1');
    expect(match![2]).toBe('My Label');
  });

  it('does not match lines without subgraph keyword', () => {
    expect(SUBGRAPH_START.exec('A --> B')).toBeNull();
    expect(SUBGRAPH_START.exec('end')).toBeNull();
    expect(SUBGRAPH_START.exec('  flowchart LR')).toBeNull();
  });

  it('matches subgraph with leading whitespace', () => {
    const match = SUBGRAPH_START.exec('    subgraph outer');
    expect(match).not.toBeNull();
    expect(match![1]).toBe('outer');
  });
});

describe('SUBGRAPH_END', () => {
  it('matches "end" with optional whitespace', () => {
    expect(SUBGRAPH_END.test('end')).toBe(true);
    expect(SUBGRAPH_END.test('  end')).toBe(true);
    expect(SUBGRAPH_END.test('  end  ')).toBe(true);
  });

  it('does not match lines with content after end', () => {
    expect(SUBGRAPH_END.test('endpoint')).toBe(false);
    expect(SUBGRAPH_END.test('end something')).toBe(false);
  });

  it('does not match non-end lines', () => {
    expect(SUBGRAPH_END.test('A --> B')).toBe(false);
    expect(SUBGRAPH_END.test('subgraph x')).toBe(false);
  });
});
