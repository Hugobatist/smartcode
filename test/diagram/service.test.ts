import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, cpSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DiagramService } from '../../src/diagram/service.js';

const fixturesDir = join(import.meta.dirname, '..', 'fixtures');

describe('DiagramService', () => {
  describe('readDiagram', () => {
    const service = new DiagramService(fixturesDir);

    it('reads valid-flowchart.mmd with valid: true, empty flags, and correct mermaidContent', async () => {
      const result = await service.readDiagram('valid-flowchart.mmd');
      expect(result.validation.valid).toBe(true);
      expect(result.flags.size).toBe(0);
      expect(result.mermaidContent).toContain('flowchart LR');
    });

    it('reads with-flags.mmd and extracts 2 flags with correct messages', async () => {
      const result = await service.readDiagram('with-flags.mmd');
      expect(result.flags.size).toBe(2);
      expect(result.flags.get('B')?.message).toBe('This step is too slow, consider batching');
      expect(result.flags.get('C')?.message).toBe('Output format should be JSON not CSV');
    });

    it('reads malformed.mmd with valid: false and at least one error', async () => {
      const result = await service.readDiagram('malformed.mmd');
      expect(result.validation.valid).toBe(false);
      expect(result.validation.errors.length).toBeGreaterThan(0);
    });

    it('rejects path traversal attacks', async () => {
      await expect(service.readDiagram('../../etc/passwd')).rejects.toThrow('Path traversal');
    });
  });

  describe('write and read round-trip', () => {
    let tmpDir: string;
    let service: DiagramService;

    beforeEach(() => {
      tmpDir = mkdtempSync(join(tmpdir(), 'smartb-test-'));
      service = new DiagramService(tmpDir);
    });

    afterEach(() => {
      rmSync(tmpDir, { recursive: true, force: true });
    });

    it('write + read round-trip preserves flags', async () => {
      const flags = new Map([
        ['A', { nodeId: 'A', message: 'test flag' }],
        ['B', { nodeId: 'B', message: 'another flag' }],
      ]);

      await service.writeDiagram('test.mmd', 'flowchart LR\n    A --> B\n', flags);
      const result = await service.readDiagram('test.mmd');

      expect(result.flags.size).toBe(2);
      expect(result.flags.get('A')?.message).toBe('test flag');
      expect(result.flags.get('B')?.message).toBe('another flag');
      expect(result.mermaidContent).toContain('flowchart LR');
    });

    it('creates parent directories when writing', async () => {
      await service.writeDiagram('subdir/nested/diagram.mmd', 'flowchart LR\n    A --> B\n');
      const result = await service.readDiagram('subdir/nested/diagram.mmd');
      expect(result.validation.valid).toBe(true);
    });
  });

  describe('setFlag + getFlags', () => {
    let tmpDir: string;
    let service: DiagramService;

    beforeEach(() => {
      tmpDir = mkdtempSync(join(tmpdir(), 'smartb-test-'));
      service = new DiagramService(tmpDir);
      // Copy a fixture to the tmp dir for modification
      cpSync(join(fixturesDir, 'valid-flowchart.mmd'), join(tmpDir, 'test.mmd'));
    });

    afterEach(() => {
      rmSync(tmpDir, { recursive: true, force: true });
    });

    it('setFlag adds a flag and getFlags retrieves it', async () => {
      await service.setFlag('test.mmd', 'A', 'needs review');
      const flags = await service.getFlags('test.mmd');
      expect(flags.length).toBe(1);
      expect(flags[0]?.nodeId).toBe('A');
      expect(flags[0]?.message).toBe('needs review');
    });

    it('setFlag updates an existing flag', async () => {
      await service.setFlag('test.mmd', 'A', 'first');
      await service.setFlag('test.mmd', 'A', 'updated');
      const flags = await service.getFlags('test.mmd');
      expect(flags.length).toBe(1);
      expect(flags[0]?.message).toBe('updated');
    });
  });

  describe('removeFlag', () => {
    let tmpDir: string;
    let service: DiagramService;

    beforeEach(() => {
      tmpDir = mkdtempSync(join(tmpdir(), 'smartb-test-'));
      service = new DiagramService(tmpDir);
      cpSync(join(fixturesDir, 'with-flags.mmd'), join(tmpDir, 'test.mmd'));
    });

    afterEach(() => {
      rmSync(tmpDir, { recursive: true, force: true });
    });

    it('removes a flag from the file', async () => {
      // Initially should have B and C flags
      let flags = await service.getFlags('test.mmd');
      expect(flags.length).toBe(2);

      await service.removeFlag('test.mmd', 'B');
      flags = await service.getFlags('test.mmd');
      expect(flags.length).toBe(1);
      expect(flags[0]?.nodeId).toBe('C');
    });
  });

  describe('validate', () => {
    const service = new DiagramService(fixturesDir);

    it('returns validation result for a file', async () => {
      const result = await service.validate('valid-flowchart.mmd');
      expect(result.valid).toBe(true);
      expect(result.diagramType).toBe('flowchart');
    });
  });

  describe('listFiles', () => {
    const service = new DiagramService(fixturesDir);

    it('discovers .mmd files in the project', async () => {
      const files = await service.listFiles();
      expect(files.length).toBeGreaterThan(0);
      expect(files).toContain('valid-flowchart.mmd');
      expect(files).toContain('with-flags.mmd');
    });
  });
});
