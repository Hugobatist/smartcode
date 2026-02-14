import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { ProjectManager } from '../../src/project/manager.js';
import { DiagramService } from '../../src/diagram/service.js';

const fixturesDir = join(import.meta.dirname, '..', 'fixtures');
const projectA = join(fixturesDir, 'multi-project', 'project-a');
const projectB = join(fixturesDir, 'multi-project', 'project-b');

describe('ProjectManager', () => {
  it('addProject registers a project and returns a DiagramService', () => {
    const manager = new ProjectManager();
    const service = manager.addProject(projectA);
    expect(service).toBeInstanceOf(DiagramService);
  });

  it('addProject with same dir returns the same service (idempotent)', () => {
    const manager = new ProjectManager();
    const service1 = manager.addProject(projectA);
    const service2 = manager.addProject(projectA);
    expect(service1).toBe(service2);
  });

  it('getProject returns the service for a registered project', () => {
    const manager = new ProjectManager();
    const service = manager.addProject(projectA);
    expect(manager.getProject(projectA)).toBe(service);
  });

  it('getProject returns undefined for unregistered project', () => {
    const manager = new ProjectManager();
    expect(manager.getProject('/nonexistent')).toBeUndefined();
  });

  it('removeProject removes the project', () => {
    const manager = new ProjectManager();
    manager.addProject(projectA);
    expect(manager.removeProject(projectA)).toBe(true);
    expect(manager.getProject(projectA)).toBeUndefined();
  });

  it('removeProject returns false for unregistered project', () => {
    const manager = new ProjectManager();
    expect(manager.removeProject('/nonexistent')).toBe(false);
  });

  it('listProjects returns all registered directories', () => {
    const manager = new ProjectManager();
    manager.addProject(projectA);
    manager.addProject(projectB);
    const projects = manager.listProjects();
    expect(projects).toContain(projectA);
    expect(projects).toContain(projectB);
    expect(projects.length).toBe(2);
  });

  it('discoverAll finds .mmd files in both project directories', async () => {
    const manager = new ProjectManager();
    manager.addProject(projectA);
    manager.addProject(projectB);

    const results = await manager.discoverAll();

    expect(results.get(projectA)).toEqual(['diagram.mmd']);
    expect(results.get(projectB)).toEqual(['diagram.mmd']);
  });
});
