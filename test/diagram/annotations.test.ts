import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseFlags,
  parseStatuses,
  stripAnnotations,
  injectAnnotations,
  ANNOTATION_START,
  ANNOTATION_END,
} from '../../src/diagram/annotations.js';
import type { Flag, NodeStatus } from '../../src/diagram/types.js';

const fixturesDir = join(import.meta.dirname, '..', 'fixtures');
const withFlagsContent = readFileSync(join(fixturesDir, 'with-flags.mmd'), 'utf-8');
const validFlowchartContent = readFileSync(join(fixturesDir, 'valid-flowchart.mmd'), 'utf-8');

describe('parseFlags', () => {
  it('extracts flags from content with annotation block', () => {
    const flags = parseFlags(withFlagsContent);
    expect(flags.size).toBe(2);
    expect(flags.get('B')).toEqual({
      nodeId: 'B',
      message: 'This step is too slow, consider batching',
    });
    expect(flags.get('C')).toEqual({
      nodeId: 'C',
      message: 'Output format should be JSON not CSV',
    });
  });

  it('returns empty map for content without flags', () => {
    const flags = parseFlags(validFlowchartContent);
    expect(flags.size).toBe(0);
  });

  it('handles empty messages', () => {
    const content = [
      'flowchart LR',
      '    A --> B',
      '',
      ANNOTATION_START,
      '%% @flag A ""',
      ANNOTATION_END,
    ].join('\n');

    const flags = parseFlags(content);
    expect(flags.size).toBe(1);
    expect(flags.get('A')?.message).toBe('');
  });

  it('skips unrecognized lines in annotation block', () => {
    const content = [
      'flowchart LR',
      '    A --> B',
      '',
      ANNOTATION_START,
      '%% @flag A "valid"',
      '%% this is not a flag annotation',
      '%% @unknown directive',
      ANNOTATION_END,
    ].join('\n');

    const flags = parseFlags(content);
    expect(flags.size).toBe(1);
    expect(flags.get('A')?.message).toBe('valid');
  });
});

describe('stripAnnotations', () => {
  it('removes annotation block completely', () => {
    const stripped = stripAnnotations(withFlagsContent);
    expect(stripped).not.toContain(ANNOTATION_START);
    expect(stripped).not.toContain(ANNOTATION_END);
    expect(stripped).not.toContain('@flag');
  });

  it('preserves Mermaid content exactly', () => {
    const stripped = stripAnnotations(withFlagsContent);
    expect(stripped).toContain('flowchart LR');
    expect(stripped).toContain('A["Load data"] --> B["Process"]');
    expect(stripped).toContain('B --> C["Save results"]');
  });

  it('handles content without annotations (no-op)', () => {
    const stripped = stripAnnotations(validFlowchartContent);
    expect(stripped).toBe(validFlowchartContent);
  });

  it('removes trailing blank lines after stripping', () => {
    const contentWithTrailingBlanks = withFlagsContent + '\n\n\n';
    const stripped = stripAnnotations(contentWithTrailingBlanks);
    expect(stripped).not.toMatch(/\n\n$/);
    expect(stripped).toMatch(/\n$/);
  });
});

describe('injectAnnotations', () => {
  it('adds annotation block to clean content', () => {
    const flags = new Map<string, Flag>([
      ['X', { nodeId: 'X', message: 'test message' }],
    ]);
    const result = injectAnnotations(validFlowchartContent, flags);
    expect(result).toContain(ANNOTATION_START);
    expect(result).toContain(ANNOTATION_END);
    expect(result).toContain('%% @flag X "test message"');
  });

  it('replaces existing annotation block', () => {
    const flags = new Map<string, Flag>([
      ['Z', { nodeId: 'Z', message: 'new flag' }],
    ]);
    const result = injectAnnotations(withFlagsContent, flags);

    // Should have only the new flag, not the old ones
    expect(result).toContain('%% @flag Z "new flag"');
    expect(result).not.toContain('%% @flag B');
    expect(result).not.toContain('%% @flag C');

    // Should have exactly one annotation block
    const startCount = result.split(ANNOTATION_START).length - 1;
    expect(startCount).toBe(1);
  });

  it('handles empty flags map (returns clean content)', () => {
    const result = injectAnnotations(withFlagsContent, new Map());
    expect(result).not.toContain(ANNOTATION_START);
    expect(result).not.toContain(ANNOTATION_END);
    expect(result).toContain('flowchart LR');
  });

  it('escapes double quotes in messages', () => {
    const flags = new Map<string, Flag>([
      ['A', { nodeId: 'A', message: 'says "hello" to world' }],
    ]);
    const result = injectAnnotations(validFlowchartContent, flags);
    expect(result).toContain("%% @flag A \"says ''hello'' to world\"");
  });
});

describe('round-trip', () => {
  it('stripAnnotations(injectAnnotations(content, flags)) returns original clean content', () => {
    const flags = new Map<string, Flag>([
      ['A', { nodeId: 'A', message: 'test' }],
      ['B', { nodeId: 'B', message: 'another test' }],
    ]);
    const injected = injectAnnotations(validFlowchartContent, flags);
    const stripped = stripAnnotations(injected);
    expect(stripped).toBe(validFlowchartContent);
  });
});

describe('parseStatuses', () => {
  it('extracts status annotations from content', () => {
    const content = [
      'flowchart LR',
      '    A --> B',
      '',
      ANNOTATION_START,
      '%% @status A ok',
      '%% @status B problem',
      ANNOTATION_END,
    ].join('\n');

    const statuses = parseStatuses(content);
    expect(statuses.size).toBe(2);
    expect(statuses.get('A')).toBe('ok');
    expect(statuses.get('B')).toBe('problem');
  });

  it('returns empty map for content without statuses', () => {
    const statuses = parseStatuses(validFlowchartContent);
    expect(statuses.size).toBe(0);
  });

  it('handles all valid status values', () => {
    const content = [
      'flowchart LR',
      '    A --> B --> C --> D',
      '',
      ANNOTATION_START,
      '%% @status A ok',
      '%% @status B problem',
      '%% @status C in-progress',
      '%% @status D discarded',
      ANNOTATION_END,
    ].join('\n');

    const statuses = parseStatuses(content);
    expect(statuses.size).toBe(4);
    expect(statuses.get('A')).toBe('ok');
    expect(statuses.get('B')).toBe('problem');
    expect(statuses.get('C')).toBe('in-progress');
    expect(statuses.get('D')).toBe('discarded');
  });

  it('skips invalid status values', () => {
    const content = [
      'flowchart LR',
      '    A --> B',
      '',
      ANNOTATION_START,
      '%% @status A ok',
      '%% @status B invalid-status',
      ANNOTATION_END,
    ].join('\n');

    const statuses = parseStatuses(content);
    expect(statuses.size).toBe(1);
    expect(statuses.get('A')).toBe('ok');
  });

  it('ignores flag lines (only parses statuses)', () => {
    const content = [
      'flowchart LR',
      '    A --> B',
      '',
      ANNOTATION_START,
      '%% @flag A "some flag"',
      '%% @status B ok',
      ANNOTATION_END,
    ].join('\n');

    const statuses = parseStatuses(content);
    expect(statuses.size).toBe(1);
    expect(statuses.get('B')).toBe('ok');
  });
});

describe('injectAnnotations with statuses', () => {
  it('injects both flags and statuses into annotation block', () => {
    const flags = new Map<string, Flag>([
      ['A', { nodeId: 'A', message: 'review this' }],
    ]);
    const statuses = new Map<string, NodeStatus>([
      ['B', 'ok'],
      ['C', 'problem'],
    ]);

    const result = injectAnnotations(validFlowchartContent, flags, statuses);
    expect(result).toContain(ANNOTATION_START);
    expect(result).toContain(ANNOTATION_END);
    expect(result).toContain('%% @flag A "review this"');
    expect(result).toContain('%% @status B ok');
    expect(result).toContain('%% @status C problem');
  });

  it('injects statuses only when flags map is empty', () => {
    const flags = new Map<string, Flag>();
    const statuses = new Map<string, NodeStatus>([
      ['A', 'in-progress'],
    ]);

    const result = injectAnnotations(validFlowchartContent, flags, statuses);
    expect(result).toContain(ANNOTATION_START);
    expect(result).toContain('%% @status A in-progress');
    expect(result).not.toContain('@flag');
  });

  it('returns clean content when both maps are empty', () => {
    const result = injectAnnotations(
      validFlowchartContent,
      new Map(),
      new Map(),
    );
    expect(result).not.toContain(ANNOTATION_START);
    expect(result).not.toContain(ANNOTATION_END);
  });
});

describe('status round-trip', () => {
  it('inject statuses then parse them back correctly', () => {
    const flags = new Map<string, Flag>([
      ['A', { nodeId: 'A', message: 'flag on A' }],
    ]);
    const statuses = new Map<string, NodeStatus>([
      ['B', 'ok'],
      ['C', 'in-progress'],
    ]);

    const injected = injectAnnotations(validFlowchartContent, flags, statuses);

    const parsedFlags = parseFlags(injected);
    expect(parsedFlags.size).toBe(1);
    expect(parsedFlags.get('A')?.message).toBe('flag on A');

    const parsedStatuses = parseStatuses(injected);
    expect(parsedStatuses.size).toBe(2);
    expect(parsedStatuses.get('B')).toBe('ok');
    expect(parsedStatuses.get('C')).toBe('in-progress');

    const stripped = stripAnnotations(injected);
    expect(stripped).toBe(validFlowchartContent);
  });
});
