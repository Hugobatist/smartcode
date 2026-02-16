import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { DiagramContent, Flag, NodeStatus, RiskAnnotation, RiskLevel, ValidationResult } from './types.js';
import type { GraphModel } from './graph-types.js';
import { parseDiagramContent } from './parser.js';
import { injectAnnotations, parseFlags, parseStatuses, parseBreakpoints, parseRisks } from './annotations.js';
import { validateMermaidSyntax } from './validator.js';
import { parseMermaidToGraph } from './graph-parser.js';
import { resolveProjectPath } from '../utils/paths.js';
import { discoverMmdFiles } from '../project/discovery.js';

/**
 * DiagramService -- single entry point for all .mmd file operations.
 * Each instance is bound to a project root for path security.
 */
export class DiagramService {
  /** Per-file write locks to serialize concurrent write operations */
  private writeLocks = new Map<string, Promise<void>>();

  /**
   * Serialize write operations on a given file path.
   * Each call waits for the previous write on the same file to finish before running.
   */
  private async withWriteLock<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.writeLocks.get(filePath) ?? Promise.resolve();
    const current = prev.then(fn, fn); // run fn after previous completes (even if it failed)
    this.writeLocks.set(filePath, current.then(() => {}, () => {})); // swallow errors for the lock chain
    return current;
  }

  constructor(private readonly projectRoot: string) {}

  /**
   * Read and parse a .mmd file.
   * Resolves path with traversal protection, parses content, and validates syntax.
   */
  async readDiagram(filePath: string): Promise<DiagramContent> {
    const resolved = this.resolvePath(filePath);
    const raw = await readFile(resolved, 'utf-8');
    const { mermaidContent, flags, diagramType } = parseDiagramContent(raw);
    const statuses = parseStatuses(raw);
    const validation = validateMermaidSyntax(mermaidContent);

    // Ensure diagramType from parser is reflected in validation result
    if (diagramType && !validation.diagramType) {
      validation.diagramType = diagramType;
    }

    return {
      raw,
      mermaidContent,
      flags,
      statuses,
      validation,
      filePath,
    };
  }

  /**
   * Read a .mmd file and parse it into a structured GraphModel.
   * Combines readDiagram + parseMermaidToGraph in one call.
   */
  async readGraph(filePath: string): Promise<GraphModel> {
    const resolved = this.resolvePath(filePath);
    const raw = await readFile(resolved, 'utf-8');
    return parseMermaidToGraph(raw, filePath);
  }

  /**
   * Write a .mmd file. If flags or statuses are provided, injects annotation block.
   * Creates parent directories if they don't exist.
   */
  async writeDiagram(
    filePath: string,
    content: string,
    flags?: Map<string, Flag>,
    statuses?: Map<string, NodeStatus>,
    breakpoints?: Set<string>,
    risks?: Map<string, RiskAnnotation>,
  ): Promise<void> {
    const resolved = this.resolvePath(filePath);
    let output = content;

    if (flags || statuses || breakpoints || risks) {
      output = injectAnnotations(
        content,
        flags ?? new Map(),
        statuses,
        breakpoints,
        risks,
      );
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
   * Uses a per-file write lock to prevent race conditions.
   */
  async setFlag(filePath: string, nodeId: string, message: string): Promise<void> {
    return this.withWriteLock(filePath, async () => {
      const resolved = this.resolvePath(filePath);
      const raw = await readFile(resolved, 'utf-8');
      const flags = parseFlags(raw);
      const statuses = parseStatuses(raw);
      const breakpoints = parseBreakpoints(raw);
      const risks = parseRisks(raw);

      flags.set(nodeId, { nodeId, message });

      const { mermaidContent } = parseDiagramContent(raw);
      await this.writeDiagram(filePath, mermaidContent, flags, statuses, breakpoints, risks);
    });
  }

  /**
   * Remove a flag from a specific node in a .mmd file.
   * Uses a per-file write lock to prevent race conditions.
   */
  async removeFlag(filePath: string, nodeId: string): Promise<void> {
    return this.withWriteLock(filePath, async () => {
      const resolved = this.resolvePath(filePath);
      const raw = await readFile(resolved, 'utf-8');
      const flags = parseFlags(raw);
      const statuses = parseStatuses(raw);
      const breakpoints = parseBreakpoints(raw);
      const risks = parseRisks(raw);

      flags.delete(nodeId);

      const { mermaidContent } = parseDiagramContent(raw);
      await this.writeDiagram(filePath, mermaidContent, flags, statuses, breakpoints, risks);
    });
  }

  /**
   * Get all statuses from a .mmd file.
   */
  async getStatuses(filePath: string): Promise<Map<string, NodeStatus>> {
    const diagram = await this.readDiagram(filePath);
    return diagram.statuses;
  }

  /**
   * Set (add or update) a status on a specific node in a .mmd file.
   * Uses a per-file write lock to prevent race conditions.
   */
  async setStatus(filePath: string, nodeId: string, status: NodeStatus): Promise<void> {
    return this.withWriteLock(filePath, async () => {
      const resolved = this.resolvePath(filePath);
      const raw = await readFile(resolved, 'utf-8');
      const flags = parseFlags(raw);
      const statuses = parseStatuses(raw);
      const breakpoints = parseBreakpoints(raw);
      const risks = parseRisks(raw);

      statuses.set(nodeId, status);

      const { mermaidContent } = parseDiagramContent(raw);
      await this.writeDiagram(filePath, mermaidContent, flags, statuses, breakpoints, risks);
    });
  }

  /**
   * Remove a status from a specific node in a .mmd file.
   * Uses a per-file write lock to prevent race conditions.
   */
  async removeStatus(filePath: string, nodeId: string): Promise<void> {
    return this.withWriteLock(filePath, async () => {
      const resolved = this.resolvePath(filePath);
      const raw = await readFile(resolved, 'utf-8');
      const flags = parseFlags(raw);
      const statuses = parseStatuses(raw);
      const breakpoints = parseBreakpoints(raw);
      const risks = parseRisks(raw);

      statuses.delete(nodeId);

      const { mermaidContent } = parseDiagramContent(raw);
      await this.writeDiagram(filePath, mermaidContent, flags, statuses, breakpoints, risks);
    });
  }

  /**
   * Get all breakpoints from a .mmd file.
   */
  async getBreakpoints(filePath: string): Promise<Set<string>> {
    const resolved = this.resolvePath(filePath);
    const raw = await readFile(resolved, 'utf-8');
    return parseBreakpoints(raw);
  }

  /**
   * Set (add) a breakpoint on a specific node in a .mmd file.
   * Uses a per-file write lock to prevent race conditions.
   */
  async setBreakpoint(filePath: string, nodeId: string): Promise<void> {
    return this.withWriteLock(filePath, async () => {
      const resolved = this.resolvePath(filePath);
      const raw = await readFile(resolved, 'utf-8');
      const flags = parseFlags(raw);
      const statuses = parseStatuses(raw);
      const breakpoints = parseBreakpoints(raw);
      const risks = parseRisks(raw);

      breakpoints.add(nodeId);

      const { mermaidContent } = parseDiagramContent(raw);
      await this.writeDiagram(filePath, mermaidContent, flags, statuses, breakpoints, risks);
    });
  }

  /**
   * Remove a breakpoint from a specific node in a .mmd file.
   * Uses a per-file write lock to prevent race conditions.
   */
  async removeBreakpoint(filePath: string, nodeId: string): Promise<void> {
    return this.withWriteLock(filePath, async () => {
      const resolved = this.resolvePath(filePath);
      const raw = await readFile(resolved, 'utf-8');
      const flags = parseFlags(raw);
      const statuses = parseStatuses(raw);
      const breakpoints = parseBreakpoints(raw);
      const risks = parseRisks(raw);

      breakpoints.delete(nodeId);

      const { mermaidContent } = parseDiagramContent(raw);
      await this.writeDiagram(filePath, mermaidContent, flags, statuses, breakpoints, risks);
    });
  }

  /**
   * Get all risk annotations from a .mmd file.
   */
  async getRisks(filePath: string): Promise<Map<string, RiskAnnotation>> {
    const resolved = this.resolvePath(filePath);
    const raw = await readFile(resolved, 'utf-8');
    return parseRisks(raw);
  }

  /**
   * Set (add or update) a risk annotation on a specific node in a .mmd file.
   * Uses a per-file write lock to prevent race conditions.
   */
  async setRisk(filePath: string, nodeId: string, level: RiskLevel, reason: string): Promise<void> {
    return this.withWriteLock(filePath, async () => {
      const resolved = this.resolvePath(filePath);
      const raw = await readFile(resolved, 'utf-8');
      const flags = parseFlags(raw);
      const statuses = parseStatuses(raw);
      const breakpoints = parseBreakpoints(raw);
      const risks = parseRisks(raw);

      risks.set(nodeId, { nodeId, level, reason });

      const { mermaidContent } = parseDiagramContent(raw);
      await this.writeDiagram(filePath, mermaidContent, flags, statuses, breakpoints, risks);
    });
  }

  /**
   * Remove a risk annotation from a specific node in a .mmd file.
   * Uses a per-file write lock to prevent race conditions.
   */
  async removeRisk(filePath: string, nodeId: string): Promise<void> {
    return this.withWriteLock(filePath, async () => {
      const resolved = this.resolvePath(filePath);
      const raw = await readFile(resolved, 'utf-8');
      const flags = parseFlags(raw);
      const statuses = parseStatuses(raw);
      const breakpoints = parseBreakpoints(raw);
      const risks = parseRisks(raw);

      risks.delete(nodeId);

      const { mermaidContent } = parseDiagramContent(raw);
      await this.writeDiagram(filePath, mermaidContent, flags, statuses, breakpoints, risks);
    });
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
