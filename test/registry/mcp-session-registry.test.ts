import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';
import {
  McpSessionRegistry,
  EMPTY_SESSION_TTL_MS,
} from '../../src/registry/mcp-session-registry.js';

/** Reescreve o manifesto de uma sessão no disco com um startedAt customizado
 *  (para simular sessões antigas nos testes de TTL). */
async function backdateManifest(tmpDir: string, sessionId: string, startedAt: number): Promise<void> {
  const filePath = join(tmpDir, '.smartcode', 'mcp-sessions', `${sessionId}.json`);
  const raw = await readFile(filePath, 'utf-8');
  const manifest = JSON.parse(raw);
  manifest.startedAt = startedAt;
  await writeFile(filePath, JSON.stringify(manifest, null, 2), 'utf-8');
}

let tmpDir: string;

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'smartcode-mcp-session-test-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('McpSessionRegistry', () => {
  it('register() does NOT create any session (lazy default)', async () => {
    const registry = new McpSessionRegistry(tmpDir);
    await registry.register();

    // Default preguiçosa: boot não cria sessão-fantasma vazia.
    const dir = join(tmpDir, '.smartcode', 'mcp-sessions');
    const files = await readdir(dir);
    expect(files.length).toBe(0);
    expect(registry.getActiveSessionId()).toBeNull();

    // listActive lida com zero sessões sem quebrar.
    const sessions = await McpSessionRegistry.listActive(tmpDir);
    expect(sessions).toEqual([]);
  });

  it('trackDiagram() adds diagrams to the active session manifest', async () => {
    const registry = new McpSessionRegistry(tmpDir);
    await registry.register();

    await registry.trackDiagram('flow.mmd');
    await registry.trackDiagram('state.mmd');

    const sessions = await McpSessionRegistry.listActive(tmpDir);
    expect(sessions.length).toBe(1);
    expect(sessions[0]!.diagrams.length).toBe(2);
    expect(sessions[0]!.diagrams[0]!.filePath).toBe('flow.mmd');
    expect(sessions[0]!.diagrams[1]!.filePath).toBe('state.mmd');
  });

  it('trackDiagram() updates lastUpdated for existing diagrams', async () => {
    const registry = new McpSessionRegistry(tmpDir);
    await registry.register();

    await registry.trackDiagram('flow.mmd');
    const sessions1 = await McpSessionRegistry.listActive(tmpDir);
    const first = sessions1[0]!.diagrams[0]!.lastUpdated;

    // Small delay to ensure timestamp differs
    await new Promise((r) => setTimeout(r, 10));
    await registry.trackDiagram('flow.mmd');

    const sessions2 = await McpSessionRegistry.listActive(tmpDir);
    expect(sessions2[0]!.diagrams.length).toBe(1);
    expect(sessions2[0]!.diagrams[0]!.lastUpdated).toBeGreaterThanOrEqual(first);
  });

  it('deregister() removes all manifest files for this process', async () => {
    const registry = new McpSessionRegistry(tmpDir);
    await registry.register();
    await registry.createSession('extra');
    await registry.deregister();

    const dir = join(tmpDir, '.smartcode', 'mcp-sessions');
    const files = await readdir(dir);
    expect(files.length).toBe(0);
  });

  it('listActive() returns alive sessions and filters dead ones', async () => {
    const registry = new McpSessionRegistry(tmpDir);
    await registry.register();
    await registry.trackDiagram('test.mmd');

    const sessions = await McpSessionRegistry.listActive(tmpDir);
    expect(sessions.length).toBe(1);
    expect(sessions[0]!.diagrams.length).toBe(1);
  });

  it('listActive() returns empty array when no sessions exist', async () => {
    const sessions = await McpSessionRegistry.listActive(tmpDir);
    expect(sessions).toEqual([]);
  });

  it('getSession() returns a specific session', async () => {
    const registry = new McpSessionRegistry(tmpDir);
    await registry.register();
    await registry.trackDiagram('diagram.mmd');

    const activeId = registry.getActiveSessionId()!;
    const session = await McpSessionRegistry.getSession(tmpDir, activeId);
    expect(session).not.toBeNull();
    expect(session!.diagrams[0]!.filePath).toBe('diagram.mmd');
  });

  it('getSession() returns null for non-existent session', async () => {
    const session = await McpSessionRegistry.getSession(tmpDir, 'nonexistent-id');
    expect(session).toBeNull();
  });

  it('label is auto-derived from first diagram (strips .mmd)', async () => {
    const registry = new McpSessionRegistry(tmpDir);
    await registry.register();
    await registry.trackDiagram('folder/my-diagram.mmd');

    const activeId = registry.getActiveSessionId()!;
    const session = await McpSessionRegistry.getSession(tmpDir, activeId);
    expect(session!.label).toBe('my-diagram');
  });

  // ── Multi-session tests ──

  it('createSession() creates a new session and makes it active', async () => {
    const registry = new McpSessionRegistry(tmpDir);
    await registry.register();

    // Lazy default: após register() não há sessão ativa ainda.
    const firstId = registry.getActiveSessionId();
    expect(firstId).toBeNull();

    const secondId = await registry.createSession('Debug auth');
    expect(secondId).not.toBe(firstId);
    expect(registry.getActiveSessionId()).toBe(secondId);

    const dir = join(tmpDir, '.smartcode', 'mcp-sessions');
    const files = await readdir(dir);
    // register() não cria nada (lazy); só o createSession() gera 1 manifesto.
    expect(files.length).toBe(1);
  });

  it('createSession() with label persists the label', async () => {
    const registry = new McpSessionRegistry(tmpDir);
    const id = await registry.createSession('Refactoring UI');

    const session = await McpSessionRegistry.getSession(tmpDir, id);
    expect(session!.label).toBe('Refactoring UI');
  });

  it('createSession() without label uses auto-generated name', async () => {
    const registry = new McpSessionRegistry(tmpDir);
    const id = await registry.createSession();

    const session = await McpSessionRegistry.getSession(tmpDir, id);
    expect(session!.label).toMatch(/^Session [a-f0-9]{8}$/);
  });

  it('diagrams go to the active session only', async () => {
    const registry = new McpSessionRegistry(tmpDir);
    const id1 = await registry.createSession('Session A');
    await registry.trackDiagram('a.mmd');

    const id2 = await registry.createSession('Session B');
    await registry.trackDiagram('b.mmd');

    const s1 = await McpSessionRegistry.getSession(tmpDir, id1);
    const s2 = await McpSessionRegistry.getSession(tmpDir, id2);
    expect(s1!.diagrams.map((d) => d.filePath)).toEqual(['a.mmd']);
    expect(s2!.diagrams.map((d) => d.filePath)).toEqual(['b.mmd']);
  });

  it('setActiveSession() switches the active session', async () => {
    const registry = new McpSessionRegistry(tmpDir);
    const id1 = await registry.createSession('First');
    await registry.createSession('Second');

    registry.setActiveSession(id1);
    expect(registry.getActiveSessionId()).toBe(id1);

    await registry.trackDiagram('goes-to-first.mmd');
    const s1 = await McpSessionRegistry.getSession(tmpDir, id1);
    expect(s1!.diagrams[0]!.filePath).toBe('goes-to-first.mmd');
  });

  it('setActiveSession() throws for unknown session', () => {
    const registry = new McpSessionRegistry(tmpDir);
    expect(() => registry.setActiveSession('nonexistent')).toThrow('Session not found');
  });

  it('renameSession() updates label on disk', async () => {
    const registry = new McpSessionRegistry(tmpDir);
    const id = await registry.createSession('Original');

    await registry.renameSession(id, 'Renamed');

    const session = await McpSessionRegistry.getSession(tmpDir, id);
    expect(session!.label).toBe('Renamed');
  });

  it('renameOnDisk() works for cross-process rename', async () => {
    const registry = new McpSessionRegistry(tmpDir);
    const id = await registry.createSession('Before');

    const ok = await McpSessionRegistry.renameOnDisk(tmpDir, id, 'After');
    expect(ok).toBe(true);

    const session = await McpSessionRegistry.getSession(tmpDir, id);
    expect(session!.label).toBe('After');
  });

  it('renameOnDisk() returns false for non-existent session', async () => {
    const ok = await McpSessionRegistry.renameOnDisk(tmpDir, 'nonexistent', 'label');
    expect(ok).toBe(false);
  });

  it('listSessions() returns all sessions from this process', async () => {
    const registry = new McpSessionRegistry(tmpDir);
    await registry.createSession('A');
    await registry.createSession('B');
    await registry.createSession('C');

    const local = registry.listSessions();
    expect(local.length).toBe(3);
    expect(local.map((s) => s.label)).toEqual(['A', 'B', 'C']);
  });

  it('backward compat: trackDiagram auto-creates session if none exists', async () => {
    const registry = new McpSessionRegistry(tmpDir);
    // No register() or createSession() call
    await registry.trackDiagram('auto.mmd');

    const sessions = await McpSessionRegistry.listActive(tmpDir);
    expect(sessions.length).toBe(1);
    expect(sessions[0]!.diagrams[0]!.filePath).toBe('auto.mmd');
  });

  it('sessionId getter returns the active session ID', async () => {
    const registry = new McpSessionRegistry(tmpDir);
    const id = await registry.createSession('Test');
    expect(registry.sessionId).toBe(id);
  });

  // ── TTL: auto-limpeza de sessões vazias antigas ──

  it('listActive() removes an OLD EMPTY session (age > TTL)', async () => {
    const registry = new McpSessionRegistry(tmpDir);
    const id = await registry.createSession('Vazia antiga');
    // Backdate para além do TTL.
    await backdateManifest(tmpDir, id, Date.now() - EMPTY_SESSION_TTL_MS - 60_000);

    const sessions = await McpSessionRegistry.listActive(tmpDir);
    expect(sessions.length).toBe(0);

    // Manifesto foi de fato apagado do disco (best-effort), aguarda o unlink.
    await new Promise((r) => setTimeout(r, 20));
    const files = await readdir(join(tmpDir, '.smartcode', 'mcp-sessions'));
    expect(files.length).toBe(0);
  });

  it('listActive() PRESERVES a recent empty session (age < TTL)', async () => {
    const registry = new McpSessionRegistry(tmpDir);
    await registry.createSession('Vazia recente');
    // startedAt = agora, dentro do TTL -- não deve ser removida.

    const sessions = await McpSessionRegistry.listActive(tmpDir);
    expect(sessions.length).toBe(1);
    expect(sessions[0]!.diagrams.length).toBe(0);
  });

  it('listActive() NEVER removes a session with a diagram, even if old', async () => {
    const registry = new McpSessionRegistry(tmpDir);
    const id = await registry.createSession('Com diagrama');
    await registry.trackDiagram('importante.mmd');
    // Backdate bem além do TTL -- mas tem 1 diagrama, então NUNCA expira.
    await backdateManifest(tmpDir, id, Date.now() - EMPTY_SESSION_TTL_MS * 10);

    const sessions = await McpSessionRegistry.listActive(tmpDir);
    expect(sessions.length).toBe(1);
    expect(sessions[0]!.diagrams[0]!.filePath).toBe('importante.mmd');
  });

  // ── deleteOnDisk: exclusão de manifesto ──

  it('deleteOnDisk() removes the manifest and returns "deleted"', async () => {
    const registry = new McpSessionRegistry(tmpDir);
    const id = await registry.createSession('Para apagar');

    const result = await McpSessionRegistry.deleteOnDisk(tmpDir, id);
    expect(result).toBe('deleted');

    const session = await McpSessionRegistry.getSession(tmpDir, id);
    expect(session).toBeNull();
  });

  it('deleteOnDisk() returns "not-found" for a non-existent session', async () => {
    const result = await McpSessionRegistry.deleteOnDisk(tmpDir, 'nonexistent-id');
    expect(result).toBe('not-found');
  });
});
