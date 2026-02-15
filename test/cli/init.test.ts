import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { initProject } from '../../src/cli/init.js';

describe('initProject', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), 'smartb-init-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('creates .smartb.json and reasoning.mmd in target directory', async () => {
    await initProject(tempDir);

    const configPath = path.join(tempDir, '.smartb.json');
    const diagramPath = path.join(tempDir, 'reasoning.mmd');

    const configRaw = await readFile(configPath, 'utf-8');
    const diagramRaw = await readFile(diagramPath, 'utf-8');

    expect(configRaw).toBeTruthy();
    expect(diagramRaw).toBeTruthy();
  });

  it('.smartb.json has correct JSON structure', async () => {
    await initProject(tempDir);

    const configPath = path.join(tempDir, '.smartb.json');
    const config = JSON.parse(await readFile(configPath, 'utf-8'));

    expect(config).toEqual({
      version: 1,
      diagramDir: '.',
      port: 3333,
    });
  });

  it('reasoning.mmd contains valid Mermaid flowchart content', async () => {
    await initProject(tempDir);

    const diagramPath = path.join(tempDir, 'reasoning.mmd');
    const content = await readFile(diagramPath, 'utf-8');

    expect(content).toContain('flowchart');
    expect(content).toContain('-->');
  });

  it('throws error when .smartb.json already exists (without --force)', async () => {
    // Create existing config
    await writeFile(path.join(tempDir, '.smartb.json'), '{}', 'utf-8');

    await expect(initProject(tempDir)).rejects.toThrow(
      'Already initialized: .smartb.json exists. Use --force to reinitialize.',
    );
  });

  it('succeeds with --force flag when .smartb.json already exists', async () => {
    // Create existing config with different content
    await writeFile(path.join(tempDir, '.smartb.json'), '{"old": true}', 'utf-8');

    await initProject(tempDir, true);

    const configPath = path.join(tempDir, '.smartb.json');
    const config = JSON.parse(await readFile(configPath, 'utf-8'));

    expect(config).toEqual({
      version: 1,
      diagramDir: '.',
      port: 3333,
    });
  });

  it('does not overwrite existing reasoning.mmd without --force', async () => {
    const customContent = 'flowchart TD\n    A --> B\n';
    await writeFile(path.join(tempDir, 'reasoning.mmd'), customContent, 'utf-8');

    await initProject(tempDir);

    const diagramPath = path.join(tempDir, 'reasoning.mmd');
    const content = await readFile(diagramPath, 'utf-8');

    expect(content).toBe(customContent);
  });
});
