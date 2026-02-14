import { statSync } from 'node:fs';
import { DiagramService } from '../diagram/service.js';

/**
 * ProjectManager managing multiple project directories.
 * Each project gets its own DiagramService with independent path security.
 */
export class ProjectManager {
  private projects = new Map<string, DiagramService>();

  /**
   * Register a project directory and return its DiagramService.
   * If the directory is already registered, returns the existing service.
   * Throws if the directory does not exist.
   */
  addProject(rootDir: string): DiagramService {
    const existing = this.projects.get(rootDir);
    if (existing) {
      return existing;
    }

    // Validate that the directory exists
    const stat = statSync(rootDir);
    if (!stat.isDirectory()) {
      throw new Error(`Not a directory: ${rootDir}`);
    }

    const service = new DiagramService(rootDir);
    this.projects.set(rootDir, service);
    return service;
  }

  /**
   * Remove a project from management.
   * Returns true if it was registered, false otherwise.
   */
  removeProject(rootDir: string): boolean {
    return this.projects.delete(rootDir);
  }

  /**
   * Get the DiagramService for a registered project directory.
   * Returns undefined if the directory is not registered.
   */
  getProject(rootDir: string): DiagramService | undefined {
    return this.projects.get(rootDir);
  }

  /**
   * List all registered project root directories.
   */
  listProjects(): string[] {
    return Array.from(this.projects.keys());
  }

  /**
   * Discover .mmd files across all registered projects.
   * Returns a map of rootDir to file lists.
   */
  async discoverAll(): Promise<Map<string, string[]>> {
    const results = new Map<string, string[]>();

    for (const [rootDir, service] of this.projects) {
      const files = await service.listFiles();
      results.set(rootDir, files);
    }

    return results;
  }
}
