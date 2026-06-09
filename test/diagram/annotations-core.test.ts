import { describe, it, expect } from 'vitest';
import {
  parseAllAnnotations,
  stripAnnotations,
  injectAnnotations,
  ANNOTATION_START,
  ANNOTATION_END,
} from '../../src/diagram/annotations-core.js';

/**
 * Contract tests for the single source-of-truth annotation parser shared by the
 * backend (annotations.ts) and the browser viewer (static/annotations.js).
 *
 * Several cases below encode the historical divergences between the two parsers
 * (see numbered "bug #N" markers) — the unified core must handle all of them.
 */

/** Marker written by versions before the rename to "SmartCode". */
const LEGACY_START = '%% --- ANNOTATIONS (auto-managed by SmartB Diagrams) ---';

function build(body: string[]): string {
  return ['flowchart LR', '    A --> B', '    B --> C', '', ...body].join('\n');
}

describe('annotations-core: parseAllAnnotations', () => {
  it('parses a flag into {nodeId, message} keyed by node id', () => {
    const content = build([ANNOTATION_START, '%% @flag B "too slow"', ANNOTATION_END]);
    const { flags } = parseAllAnnotations(content);
    expect(flags.size).toBe(1);
    expect(flags.get('B')).toEqual({ nodeId: 'B', message: 'too slow' });
  });

  it('parses every annotation type in a single pass', () => {
    const content = build([
      ANNOTATION_START,
      '%% @flag B "slow"',
      '%% @status A ok',
      '%% @breakpoint C',
      '%% @risk B high "race condition"',
      '%% @ghost A C "skip"',
      ANNOTATION_END,
    ]);
    const r = parseAllAnnotations(content);
    expect(r.flags.get('B')).toEqual({ nodeId: 'B', message: 'slow' });
    expect(r.statuses.get('A')).toBe('ok');
    expect(r.breakpoints.has('C')).toBe(true);
    expect(r.risks.get('B')).toEqual({ nodeId: 'B', level: 'high', reason: 'race condition' });
    expect(r.ghosts).toEqual([{ fromNodeId: 'A', toNodeId: 'C', label: 'skip' }]);
  });

  it('recognizes the legacy "SmartB Diagrams" annotation marker (bug #1)', () => {
    const content = build([LEGACY_START, '%% @flag B "legacy"', ANNOTATION_END]);
    const { flags } = parseAllAnnotations(content);
    expect(flags.get('B')).toEqual({ nodeId: 'B', message: 'legacy' });
  });

  it('discards invalid status values (bug #3)', () => {
    const content = build([ANNOTATION_START, '%% @status A bogus', ANNOTATION_END]);
    const { statuses } = parseAllAnnotations(content);
    expect(statuses.has('A')).toBe(false);
  });

  it('ignores annotation-looking lines outside the block', () => {
    const content = build(['%% @flag B "outside the block"']);
    const { flags } = parseAllAnnotations(content);
    expect(flags.size).toBe(0);
  });
});

describe('annotations-core: stripAnnotations', () => {
  it('removes the annotation block and ends with a single trailing newline', () => {
    const content = build([ANNOTATION_START, '%% @flag B "x"', ANNOTATION_END]);
    const stripped = stripAnnotations(content);
    expect(stripped).not.toContain('@flag');
    expect(stripped).not.toContain(ANNOTATION_START);
    expect(stripped.endsWith('\n')).toBe(true);
    expect(stripped.endsWith('\n\n')).toBe(false);
  });

  it('also strips a legacy-marked block', () => {
    const content = build([LEGACY_START, '%% @flag B "x"', ANNOTATION_END]);
    expect(stripAnnotations(content)).not.toContain('@flag');
  });
});

describe('annotations-core: injectAnnotations', () => {
  it('round-trips: parse -> strip -> inject -> parse is stable', () => {
    const original = build([
      ANNOTATION_START,
      '%% @flag B "slow"',
      '%% @status A ok',
      '%% @breakpoint C',
      '%% @risk B high "race"',
      '%% @ghost A C "skip"',
      ANNOTATION_END,
    ]);
    const a = parseAllAnnotations(original);
    const injected = injectAnnotations(stripAnnotations(original), a);
    const b = parseAllAnnotations(injected);
    expect(b.flags).toEqual(a.flags);
    expect(b.statuses).toEqual(a.statuses);
    expect([...b.breakpoints]).toEqual([...a.breakpoints]);
    expect(b.risks).toEqual(a.risks);
    expect(b.ghosts).toEqual(a.ghosts);
  });

  it('ends output with a single trailing newline (bug #2)', () => {
    const flags = new Map([['B', { nodeId: 'B', message: 'x' }]]);
    const out = injectAnnotations(build([]), { flags });
    expect(out.endsWith('\n')).toBe(true);
    expect(out.endsWith('\n\n')).toBe(false);
  });

  it('returns clean content with no block when there are no annotations', () => {
    const out = injectAnnotations(build([]), { flags: new Map() });
    expect(out).not.toContain(ANNOTATION_START);
  });

  it('survives double quotes in flag messages without breaking the parser', () => {
    const flags = new Map([['B', { nodeId: 'B', message: 'say "hi" now' }]]);
    const out = injectAnnotations(build([]), { flags });
    const reparsed = parseAllAnnotations(out);
    expect(reparsed.flags.size).toBe(1);
  });
});
