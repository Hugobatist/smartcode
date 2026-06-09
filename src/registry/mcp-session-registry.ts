/**
 * MCP Session Registry -- tracks active MCP/AI sessions via filesystem manifests.
 *
 * Supports MULTIPLE sessions per MCP process (one per conversation).
 * Each session writes a JSON manifest to .smartcode/mcp-sessions/<sessionId>.json.
 * Any HTTP server can read these files to discover which AI sessions are active
 * and which diagrams each session has touched.
 *
 * Uses atomic write (write to temp + rename) and PID liveness checks,
 * following the same pattern as workspace-registry.ts.
 */
import { readFile, writeFile, readdir, mkdir, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes, randomUUID } from 'node:crypto';
import { log } from '../utils/logger.js';

/**
 * TTL para sessões VAZIAS (zero diagramas). Sessões sem nenhum diagrama
 * que fiquem ociosas mais que este tempo são removidas automaticamente na
 * leitura (listActive). Sessões com >= 1 diagrama NUNCA expiram por idade.
 */
export const EMPTY_SESSION_TTL_MS = 45 * 60 * 1000; // 45 minutos

/** A single diagram tracked within an MCP session */
export interface DiagramEntry {
  filePath: string;
  firstSeen: number;
  lastUpdated: number;
}

/** Manifest written to disk for each MCP session */
export interface McpSessionManifest {
  sessionId: string;
  pid: number;
  startedAt: number;
  label: string;
  diagrams: DiagramEntry[];
}

/** Internal session data held in memory */
interface SessionData {
  sessionId: string;
  label: string;
  startedAt: number;
  diagrams: Map<string, DiagramEntry>;
}

/**
 * Registry for MCP sessions within a single process.
 * Supports N sessions with one "active" session at a time.
 * Backward-compatible: trackDiagram() auto-creates a default session if none exists.
 */
export class McpSessionRegistry {
  private readonly manifestDir: string;
  private readonly projectRoot: string;
  private readonly sessions = new Map<string, SessionData>();
  private activeSessionId: string | null = null;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.manifestDir = join(projectRoot, '.smartcode', 'mcp-sessions');
  }

  /**
   * Register the registry by ensuring the manifest directory exists.
   *
   * Default preguiçosa (lazy): NÃO criamos mais uma sessão default vazia no
   * boot. A sessão nasce só sob demanda -- via createSession()
   * (create_mcp_session) ou no 1º trackDiagram(), que já auto-cria. Isso
   * evita o acúmulo de sessões-fantasma "Session <hash> / No diagrams yet".
   */
  async register(): Promise<void> {
    await mkdir(this.manifestDir, { recursive: true });
    log.debug(`MCP session registry registered (pid ${process.pid})`);
  }

  /**
   * Create a new session and make it the active one.
   * Returns the new session ID.
   */
  async createSession(label?: string): Promise<string> {
    await mkdir(this.manifestDir, { recursive: true });
    const sessionId = randomUUID();
    const shortId = sessionId.substring(0, 8);
    const session: SessionData = {
      sessionId,
      label: label || `Session ${shortId}`,
      startedAt: Date.now(),
      diagrams: new Map(),
    };
    this.sessions.set(sessionId, session);
    this.activeSessionId = sessionId;
    await this.writeManifest(session);
    log.debug(`MCP session created: ${sessionId} (label: ${session.label})`);
    return sessionId;
  }

  /** Switch the active session to an existing session ID */
  setActiveSession(sessionId: string): void {
    if (!this.sessions.has(sessionId)) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    this.activeSessionId = sessionId;
  }

  /** Get the current active session ID (or null) */
  getActiveSessionId(): string | null {
    return this.activeSessionId;
  }

  /** Rename a session's label and persist to disk */
  async renameSession(sessionId: string, label: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.label = label;
      await this.writeManifest(session);
    }
    // Also handle sessions from other processes (on-disk only)
    await McpSessionRegistry.renameOnDisk(this.projectRoot, sessionId, label);
  }

  /**
   * Track a diagram file in the active session.
   * Backward-compat: auto-creates a default session if none exists.
   */
  async trackDiagram(filePath: string): Promise<void> {
    if (!this.activeSessionId || !this.sessions.has(this.activeSessionId)) {
      await this.createSession();
    }
    const session = this.sessions.get(this.activeSessionId!)!;
    const now = Date.now();
    const existing = session.diagrams.get(filePath);
    if (existing) {
      existing.lastUpdated = now;
    } else {
      session.diagrams.set(filePath, { filePath, firstSeen: now, lastUpdated: now });
      // Auto-derive label if it's still the default "Session XXXXXXXX"
      if (session.label.startsWith('Session ')) {
        const base = filePath.includes('/') ? filePath.split('/').pop()! : filePath;
        session.label = base.replace('.mmd', '');
      }
    }
    await this.writeManifest(session);
  }

  /** Deregister all sessions owned by this process */
  async deregister(): Promise<void> {
    for (const session of this.sessions.values()) {
      try {
        await unlink(this.manifestPath(session.sessionId));
      } catch {
        // File might already be deleted
      }
    }
    this.sessions.clear();
    this.activeSessionId = null;
    log.debug(`MCP session registry deregistered (pid ${process.pid})`);
  }

  /** List all sessions owned by this process instance */
  listSessions(): McpSessionManifest[] {
    return Array.from(this.sessions.values()).map((s) => this.buildManifest(s));
  }

  // ── Backward-compat getters ──

  /** Get the session ID (returns active session for backward compat) */
  get sessionId(): string {
    return this.activeSessionId ?? '';
  }

  // ── Static methods (read from disk, cross-process) ──

  /**
   * List all active MCP sessions for a project.
   *
   * Faz duas faxinas (best-effort) na leitura:
   *  1. Remove manifestos de PID morto (processo MCP encerrado).
   *  2. Remove manifestos VAZIOS (0 diagramas) e ANTIGOS (idade > TTL),
   *     mesmo de PID vivo -- são sessões-fantasma que nunca renderam nada.
   *
   * Salvaguardas: NUNCA remove sessão com >= 1 diagrama (independente da
   * idade), e nunca remove uma sessão vazia recém-criada (respeita o TTL,
   * usando startedAt como base de idade).
   */
  static async listActive(projectRoot: string): Promise<McpSessionManifest[]> {
    const dir = join(projectRoot, '.smartcode', 'mcp-sessions');
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      return [];
    }

    const now = Date.now();
    const manifests: McpSessionManifest[] = [];
    const stale: string[] = [];

    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue;
      try {
        const raw = await readFile(join(dir, entry), 'utf-8');
        const manifest = JSON.parse(raw) as McpSessionManifest;
        if (!isProcessAlive(manifest.pid)) {
          stale.push(entry);
          continue;
        }
        // Faxina por TTL: vazia (0 diagramas) E ociosa há mais que o TTL.
        // Sessão com diagrama nunca expira; recém-criada também não.
        const isEmpty = !manifest.diagrams || manifest.diagrams.length === 0;
        const age = now - (manifest.startedAt ?? now);
        if (isEmpty && age > EMPTY_SESSION_TTL_MS) {
          stale.push(entry);
          continue;
        }
        manifests.push(manifest);
      } catch {
        stale.push(entry);
      }
    }

    // Clean up stale manifests (best-effort, no await)
    for (const s of stale) {
      unlink(join(dir, s)).catch(() => {});
    }

    return manifests;
  }

  /** Get a specific session manifest by ID */
  static async getSession(projectRoot: string, sessionId: string): Promise<McpSessionManifest | null> {
    const filePath = join(projectRoot, '.smartcode', 'mcp-sessions', `${sessionId}.json`);
    try {
      const raw = await readFile(filePath, 'utf-8');
      const manifest = JSON.parse(raw) as McpSessionManifest;
      return isProcessAlive(manifest.pid) ? manifest : null;
    } catch {
      return null;
    }
  }

  /** Rename a session on disk (works for any process's sessions) */
  static async renameOnDisk(projectRoot: string, sessionId: string, label: string): Promise<boolean> {
    const filePath = join(projectRoot, '.smartcode', 'mcp-sessions', `${sessionId}.json`);
    try {
      const raw = await readFile(filePath, 'utf-8');
      const manifest = JSON.parse(raw) as McpSessionManifest;
      manifest.label = label;
      const data = JSON.stringify(manifest, null, 2);
      const tempPath = join(tmpdir(), `smartcode-mcp-${randomBytes(4).toString('hex')}.json`);
      await writeFile(tempPath, data, 'utf-8');
      try {
        await rename(tempPath, filePath);
      } catch {
        await writeFile(filePath, data, 'utf-8');
        await unlink(tempPath).catch(() => {});
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Apaga o manifesto de uma sessão do disco (funciona para sessões de
   * qualquer processo). Retorna:
   *  - 'deleted' se o arquivo existia e foi removido;
   *  - 'not-found' se o manifesto não existia (id inexistente);
   * Lança o erro original em falha de IO inesperada (ex.: permissão), para
   * a rota poder responder 500.
   */
  static async deleteOnDisk(
    projectRoot: string,
    sessionId: string,
  ): Promise<'deleted' | 'not-found'> {
    const filePath = join(projectRoot, '.smartcode', 'mcp-sessions', `${sessionId}.json`);
    try {
      await unlink(filePath);
      return 'deleted';
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
        return 'not-found';
      }
      throw err;
    }
  }

  // ── Private helpers ──

  private manifestPath(sessionId: string): string {
    return join(this.manifestDir, `${sessionId}.json`);
  }

  private buildManifest(session: SessionData): McpSessionManifest {
    return {
      sessionId: session.sessionId,
      pid: process.pid,
      startedAt: session.startedAt,
      label: session.label,
      diagrams: Array.from(session.diagrams.values()),
    };
  }

  /** Atomically write manifest (temp file + rename) */
  private async writeManifest(session: SessionData): Promise<void> {
    const data = JSON.stringify(this.buildManifest(session), null, 2);
    const tempPath = join(tmpdir(), `smartcode-mcp-${randomBytes(4).toString('hex')}.json`);
    await writeFile(tempPath, data, 'utf-8');
    try {
      await rename(tempPath, this.manifestPath(session.sessionId));
    } catch {
      // rename across filesystems can fail; fall back to write-in-place
      await writeFile(this.manifestPath(session.sessionId), data, 'utf-8');
      await unlink(tempPath).catch(() => {});
    }
  }
}

/** Check if a process with the given PID is still alive */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
