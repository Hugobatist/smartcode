import { writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import pc from 'picocolors';
import { log } from '../utils/logger.js';

/** Default project config for .smartb.json */
const DEFAULT_CONFIG = {
  version: 1,
  diagramDir: '.',
  port: 3333,
};

/** Sample reasoning.mmd content for new projects */
const SAMPLE_DIAGRAM = `flowchart LR
    Start["Problem Statement"] --> Analyze["Analyze Requirements"]
    Analyze --> Plan["Create Plan"]
    Plan --> Implement["Implement Solution"]
    Implement --> Verify["Verify Results"]
    Verify --> Done["Complete"]
`;

/**
 * Initialize a SmartB Diagrams project in the given directory.
 * Creates .smartb.json config and a sample reasoning.mmd file.
 *
 * @param dir - Directory to initialize (default: current directory)
 * @param force - Overwrite existing .smartb.json if present
 */
export async function initProject(dir: string, force?: boolean): Promise<void> {
  const resolvedDir = path.resolve(dir);
  const configPath = path.join(resolvedDir, '.smartb.json');
  const diagramPath = path.join(resolvedDir, 'reasoning.mmd');

  // Check if already initialized
  const exists = await access(configPath).then(() => true).catch(() => false);
  if (exists && !force) {
    throw new Error(
      'Already initialized: .smartb.json exists. Use --force to reinitialize.',
    );
  }

  // Write .smartb.json
  await writeFile(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n', 'utf-8');

  // Write reasoning.mmd (only if missing or force)
  const diagramExists = await access(diagramPath).then(() => true).catch(() => false);
  if (!diagramExists || force) {
    await writeFile(diagramPath, SAMPLE_DIAGRAM, 'utf-8');
  }

  log.info(pc.green('Initialized SmartB Diagrams'));
  log.info(pc.dim(`  ${configPath}`));
  log.info(pc.dim(`  ${diagramPath}`));
  log.info(`Run ${pc.cyan('smartb serve')} to start the viewer`);
}
