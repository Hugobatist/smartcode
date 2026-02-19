import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseFlags,
  parseStatuses,
  parseBreakpoints,
  parseRisks,
  parseGhosts,
  stripAnnotations,
  injectAnnotations,
  ANNOTATION_START,
  ANNOTATION_END,
} from '../../src/diagram/annotations.js';
import type { Flag, GhostPathAnnotation, NodeStatus, RiskAnnotation } from '../../src/diagram/types.js';

const fixturesDir = join(import.meta.dirname, '..', 'fixtures');
const validFlowchartContent = readFileSync(join(fixturesDir, 'valid-flowchart.mmd'), 'utf-8');

describe('parseGhosts', () => {
  it('parses single @ghost annotation', () => {
    const content = [
      'flowchart LR',
      '    A --> B --> C',
      '',
      ANNOTATION_START,
      '%% @ghost A C "Skipped: too risky"',
      ANNOTATION_END,
    ].join('\n');

    const ghosts = parseGhosts(content);
    expect(ghosts).toEqual([{ fromNodeId: 'A', toNodeId: 'C', label: 'Skipped: too risky' }]);
  });

  it('parses multiple @ghost annotations preserving order', () => {
    const content = [
      'flowchart LR',
      '    A --> B --> C',
      '',
      ANNOTATION_START,
      '%% @ghost A C "Path 1"',
      '%% @ghost B C "Path 2"',
      '%% @ghost A B "Path 3"',
      ANNOTATION_END,
    ].join('\n');

    const ghosts = parseGhosts(content);
    expect(ghosts.length).toBe(3);
    expect(ghosts[0]).toEqual({ fromNodeId: 'A', toNodeId: 'C', label: 'Path 1' });
    expect(ghosts[1]).toEqual({ fromNodeId: 'B', toNodeId: 'C', label: 'Path 2' });
    expect(ghosts[2]).toEqual({ fromNodeId: 'A', toNodeId: 'B', label: 'Path 3' });
  });

  it('handles empty label', () => {
    const content = [
      'flowchart LR',
      '    A --> B',
      '',
      ANNOTATION_START,
      '%% @ghost A B ""',
      ANNOTATION_END,
    ].join('\n');

    const ghosts = parseGhosts(content);
    expect(ghosts.length).toBe(1);
    expect(ghosts[0]).toEqual({ fromNodeId: 'A', toNodeId: 'B', label: '' });
  });

  it('ignores @ghost outside annotation block', () => {
    const content = [
      'flowchart LR',
      '%% @ghost X Y "Outside"',
      '    A --> B',
    ].join('\n');

    const ghosts = parseGhosts(content);
    expect(ghosts.length).toBe(0);
  });

  it('returns empty array when no ghosts', () => {
    const ghosts = parseGhosts(validFlowchartContent);
    expect(ghosts.length).toBe(0);
  });
});

describe('injectAnnotations with ghosts', () => {
  it('injects ghost paths into annotation block', () => {
    const ghosts: GhostPathAnnotation[] = [
      { fromNodeId: 'A', toNodeId: 'C', label: 'Skipped step' },
    ];
    const result = injectAnnotations(
      validFlowchartContent, new Map(), undefined, undefined, undefined, ghosts,
    );
    expect(result).toContain(ANNOTATION_START);
    expect(result).toContain(ANNOTATION_END);
    expect(result).toContain('%% @ghost A C "Skipped step"');
  });

  it('handles ghosts alongside all other annotation types', () => {
    const flags = new Map<string, Flag>([
      ['A', { nodeId: 'A', message: 'check' }],
    ]);
    const statuses = new Map<string, NodeStatus>([['B', 'ok']]);
    const breakpoints = new Set(['C']);
    const risks = new Map<string, RiskAnnotation>([
      ['D', { nodeId: 'D', level: 'high', reason: 'critical' }],
    ]);
    const ghosts: GhostPathAnnotation[] = [
      { fromNodeId: 'A', toNodeId: 'D', label: 'alternative' },
    ];

    const result = injectAnnotations(validFlowchartContent, flags, statuses, breakpoints, risks, ghosts);
    expect(result).toContain('%% @flag A "check"');
    expect(result).toContain('%% @status B ok');
    expect(result).toContain('%% @breakpoint C');
    expect(result).toContain('%% @risk D high "critical"');
    expect(result).toContain('%% @ghost A D "alternative"');
  });

  it('escapes double quotes in ghost labels', () => {
    const ghosts: GhostPathAnnotation[] = [
      { fromNodeId: 'A', toNodeId: 'B', label: 'says "hello"' },
    ];
    const result = injectAnnotations(
      validFlowchartContent, new Map(), undefined, undefined, undefined, ghosts,
    );
    expect(result).toContain("%% @ghost A B \"says ''hello''\"");
  });

  it('returns clean content when ghosts array is empty', () => {
    const result = injectAnnotations(
      validFlowchartContent, new Map(), undefined, undefined, undefined, [],
    );
    expect(result).not.toContain(ANNOTATION_START);
  });
});

describe('ghost round-trip', () => {
  it('inject then parse preserves ghost paths', () => {
    const ghosts: GhostPathAnnotation[] = [
      { fromNodeId: 'A', toNodeId: 'C', label: 'Skip processing' },
      { fromNodeId: 'B', toNodeId: 'D', label: '' },
    ];
    const injected = injectAnnotations(
      validFlowchartContent, new Map(), undefined, undefined, undefined, ghosts,
    );
    const parsed = parseGhosts(injected);
    expect(parsed).toEqual(ghosts);
  });

  it('all 5 annotation types survive round-trip together', () => {
    const flags = new Map<string, Flag>([
      ['A', { nodeId: 'A', message: 'flag msg' }],
    ]);
    const statuses = new Map<string, NodeStatus>([['B', 'ok']]);
    const breakpoints = new Set(['C']);
    const risks = new Map<string, RiskAnnotation>([
      ['D', { nodeId: 'D', level: 'medium', reason: 'review' }],
    ]);
    const ghosts: GhostPathAnnotation[] = [
      { fromNodeId: 'A', toNodeId: 'D', label: 'ghost label' },
    ];

    const injected = injectAnnotations(validFlowchartContent, flags, statuses, breakpoints, risks, ghosts);

    expect(parseFlags(injected).size).toBe(1);
    expect(parseFlags(injected).get('A')?.message).toBe('flag msg');
    expect(parseStatuses(injected).get('B')).toBe('ok');
    expect(parseBreakpoints(injected).has('C')).toBe(true);
    expect(parseRisks(injected).get('D')).toEqual({ nodeId: 'D', level: 'medium', reason: 'review' });
    expect(parseGhosts(injected)).toEqual([{ fromNodeId: 'A', toNodeId: 'D', label: 'ghost label' }]);

    const stripped = stripAnnotations(injected);
    expect(stripped).toBe(validFlowchartContent);
  });
});
