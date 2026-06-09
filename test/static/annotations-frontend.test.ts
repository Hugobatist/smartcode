import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import * as core from '../../src/diagram/annotations-core.js';

/**
 * Integration test for the browser viewer module static/annotations.js.
 *
 * It loads the REAL viewer source in a fresh VM context with the shared core
 * injected as window.SmartCodeAnnotationsCore, then exercises the parsing
 * primitives through the public window.SmartCodeAnnotations API. The primitives
 * under test (parse/strip/merge) touch no DOM, so a tiny document stub suffices.
 *
 * Asserts the CANONICAL behavior — these fail against a viewer that keeps its
 * own divergent parser, and pass once it delegates to the core.
 */
const annotationsSrc = readFileSync(
  join(import.meta.dirname, '..', '..', 'static', 'annotations.js'),
  'utf-8',
);

function loadViewerAnnotations(): any {
  const win: any = { SmartCodeAnnotationsCore: core };
  const sandbox: Record<string, unknown> = {
    window: win,
    document: { getElementById: () => null, addEventListener: () => {} },
  };
  // The script is this repo's own versioned viewer source (not untrusted input).
  runInNewContext(annotationsSrc, sandbox);
  return win.SmartCodeAnnotations;
}

const ANNOTATION_START = core.ANNOTATION_START;
const ANNOTATION_END = core.ANNOTATION_END;
const LEGACY_START = '%% --- ANNOTATIONS (auto-managed by SmartB Diagrams) ---';

function build(body: string[]): string {
  return ['flowchart LR', '    A --> B', '    B --> C', '', ...body].join('\n');
}

describe('static/annotations.js delegates to the shared core', () => {
  it('parseAnnotations extracts every annotation type', () => {
    const api = loadViewerAnnotations();
    const content = build([
      ANNOTATION_START,
      '%% @flag B "slow"',
      '%% @status A ok',
      '%% @breakpoint C',
      '%% @risk B high "race"',
      '%% @ghost A C "skip"',
      ANNOTATION_END,
    ]);
    const r = api.parseAnnotations(content);
    expect(r.flags.get('B').message).toBe('slow');
    expect(r.statuses.get('A')).toBe('ok');
    expect(r.breakpoints.has('C')).toBe(true);
    expect(r.risks.get('B').level).toBe('high');
    expect(r.ghosts).toEqual([{ fromNodeId: 'A', toNodeId: 'C', label: 'skip' }]);
  });

  it('recognizes the legacy "SmartB Diagrams" marker (was viewer bug #1)', () => {
    const api = loadViewerAnnotations();
    const content = build([LEGACY_START, '%% @flag B "legacy"', ANNOTATION_END]);
    const r = api.parseAnnotations(content);
    expect(r.flags.get('B')?.message).toBe('legacy');
  });

  it('getCleanContent strips the block and ends with a trailing newline (was viewer bug #2)', () => {
    const api = loadViewerAnnotations();
    const content = build([ANNOTATION_START, '%% @flag B "x"', ANNOTATION_END]);
    const clean = api.getCleanContent(content);
    expect(clean).not.toContain('@flag');
    expect(clean.endsWith('\n')).toBe(true);
  });

  it('mergeIncomingContent stays round-trip parseable', () => {
    const api = loadViewerAnnotations();
    const incoming = build([ANNOTATION_START, '%% @flag B "from-file"', ANNOTATION_END]);
    const merged = api.mergeIncomingContent(incoming);
    const r = api.parseAnnotations(merged);
    expect(r.flags.get('B')?.message).toBe('from-file');
  });
});
