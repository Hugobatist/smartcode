import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { DiagramContent, Flag, ValidationResult } from './types.js';
import { parseDiagramContent } from './parser.js';
import { injectAnnotations, parseFlags } from './annotations.js';
import { validateMermaidSyntax } from './validator.js';
import { resolveProjectPath } from '../utils/paths.js';
import { discoverMmdFiles } from '../project/discovery.js';

/**
 * DiagramService -- single entry point for all .mmd file operations.
 * Each instance is bound to a project root for path security.
 */
export class DiagramService {
  constructor(private readonly projectRoot: string) {}

  /**
   * Read and parse a .mmd file.
   * Resolves path with traversal protection, parses content, and validates syntax.
   */
  async readDiagram(filePath: string): Promise<DiagramContent> {
    const resolved = this.resolvePath(filePath);
    const raw = await readFile(resolved, 'utf-8');
    const { mermaidContent, flags, diagramType } = parseDiagramContent(raw);
    const validation = validateMermaidSyntax(mermaidContent);

    // Ensure diagramType from parser is reflected in validation result
    if (diagramType && !validation.diagramType) {
      validation.diagramType = diagramType;
    }

    return {
      raw,
      mermaidContent,
      flags,
      validation,
      filePath,
    };
  }

  /**
   * Write a .mmd file. If flags are provided, injects annotation block.
   * Creates parent directories if they don't exist.
   */
  async writeDiagram(filePath: string, content: string, flags?: Map<string, Flag>): Promise<void> {
    const resolved = this.resolvePath(filePath);
    let output = content;

    if (flags) {
      output = injectAnnotations(content, flags);
    }

    await mkdir(dirname(resolved), { recursive: true });
    await writeFile(resolved, output, 'utf-8');
  }

  /**
   * Get all flags from a .mmd file as an array.
   */
  async getFlags(filePath: string): Promise<Flag[]> {
    const diagram = await this.readDiagram(filePath);
    return Array.from(diagram.flags.values());
  }

  /**
   * Set (add or update) a flag on a specific node in a .mmd file.
   */
  async setFlag(filePath: string, nodeId: string, message: string): Promise<void> {
    const resolved = this.resolvePath(filePath);
    const raw = await readFile(resolved, 'utf-8');
    const flags = parseFlags(raw);

    flags.set(nodeId, { nodeId, message });

    const { mermaidContent } = parseDiagramContent(raw);
    await this.writeDiagram(filePath, mermaidContent, flags);
  }

  /**
   * Remove a flag from a specific node in a .mmd file.
   */
  async removeFlag(filePath: string, nodeId: string): Promise<void> {
    const resolved = this.resolvePath(filePath);
    const raw = await readFile(resolved, 'utf-8');
    const flags = parseFlags(raw);

    flags.delete(nodeId);

    const { mermaidContent } = parseDiagramContent(raw);
    await this.writeDiagram(filePath, mermaidContent, flags);
  }

  /**
   * Validate the Mermaid syntax of a .mmd file.
   */
  async validate(filePath: string): Promise<ValidationResult> {
    const diagram = await this.readDiagram(filePath);
    return diagram.validation;
  }

  /**
   * List all .mmd files in the project root.
   */
  async listFiles(): Promise<string[]> {
    return discoverMmdFiles(this.projectRoot);
  }

  /**
   * Resolve a relative file path against the project root.
   * Single chokepoint for path security -- rejects path traversal.
   */
  private resolvePath(filePath: string): string {
    return resolveProjectPath(this.projectRoot, filePath);
  }
}
