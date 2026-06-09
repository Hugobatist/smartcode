import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import * as core from '../../src/diagram/annotations-core.js';

/**
 * Guards the committed browser bundle (static/vendor/annotations-core.js) against
 * drifting from its TypeScript source (src/diagram/annotations-core.ts).
 *
 * The bundle is what the viewer actually runs in the browser. If it ever goes
 * stale, the viewer and backend would silently diverge again — exactly the
 * failure mode this whole change eliminates. When this test fails, the fix is:
 * run `npm run build` to regenerate the bundle, then commit it.
 */
const bundleSrc = readFileSync(
  join(import.meta.dirname, '..', '..', 'static', 'vendor', 'annotations-core.js'),
  'utf-8',
);

function loadBundle(): any {
  const sandbox: Record<string, unknown> = {};
  runInNewContext(bundleSrc, sandbox);
  return sandbox.SmartCodeAnnotationsCore;
}

const S = core.ANNOTATION_START;
const E = core.ANNOTATION_END;
const LEGACY = '%% --- ANNOTATIONS (auto-managed by SmartB Diagrams) ---';

const samples = [
  ['flowchart LR', 'A --> B', '', S, '%% @flag B "x"', E].join('\n'),
  ['flowchart TD', 'A --> B', 'B --> C', '', S, '%% @status A ok', '%% @breakpoint C', '%% @risk B high "r"', '%% @ghost A C "g"', E].join('\n'),
  ['flowchart LR', 'A --> B'].join('\n'),
  ['flowchart LR', 'X --> Y', '', LEGACY, '%% @flag Y "legacy"', E].join('\n'),
];

describe('vendor/annotations-core.js bundle', () => {
  const bundled = loadBundle();

  it('exposes the core API as the SmartCodeAnnotationsCore global', () => {
    expect(typeof bundled.parseAllAnnotations).toBe('function');
    expect(typeof bundled.stripAnnotations).toBe('function');
    expect(typeof bundled.injectAnnotations).toBe('function');
    expect(bundled.ANNOTATION_START).toBe(core.ANNOTATION_START);
    expect(bundled.ANNOTATION_END).toBe(core.ANNOTATION_END);
  });

  it('parses and strips identically to the ESM source for every sample', () => {
    for (const sample of samples) {
      const b = bundled.parseAllAnnotations(sample);
      const c = core.parseAllAnnotations(sample);
      expect([...b.flags]).toEqual([...c.flags]);
      expect([...b.statuses]).toEqual([...c.statuses]);
      expect([...b.breakpoints]).toEqual([...c.breakpoints]);
      expect([...b.risks]).toEqual([...c.risks]);
      expect(b.ghosts).toEqual(c.ghosts);
      expect(bundled.stripAnnotations(sample)).toBe(core.stripAnnotations(sample));
    }
  });

  it('injects identically to the ESM source for every sample', () => {
    for (const sample of samples) {
      const ann = core.parseAllAnnotations(sample);
      const stripped = core.stripAnnotations(sample);
      expect(bundled.injectAnnotations(stripped, ann)).toBe(core.injectAnnotations(stripped, ann));
    }
  });
});
