import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { request, type IncomingMessage } from 'node:http';
import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';
import { createHttpServer, type ServerInstance } from '../../src/server/server.js';
import { McpSessionRegistry } from '../../src/registry/mcp-session-registry.js';

/** Make an HTTP request and return { status, body } */
function httpRequest(
  port: number,
  method: string,
  urlPath: string,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request(
      { hostname: 'localhost', port, method, path: urlPath },
      (res: IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf-8') }),
        );
      },
    );
    req.on('error', reject);
    req.end();
  });
}

describe('mcp-session-routes (DELETE)', () => {
  let server: ServerInstance;
  let port: number;
  let projectDir: string;

  beforeEach(async () => {
    projectDir = mkdtempSync(join(tmpdir(), 'smartcode-mcp-routes-'));
    server = createHttpServer(projectDir);
    await new Promise<void>((resolve) => {
      server.httpServer.listen(0, () => {
        const addr = server.httpServer.address();
        port = typeof addr === 'object' && addr ? addr.port : 0;
        resolve();
      });
    });
  });

  afterEach(async () => {
    await server.closeAllWatchers();
    server.wsManager.close();
    await new Promise<void>((resolve) => server.httpServer.close(() => resolve()));
    await rm(projectDir, { recursive: true, force: true });
  });

  it('DELETE /api/mcp-sessions/:id removes the session and returns ok', async () => {
    // Cria um manifesto no disco do projeto.
    const registry = new McpSessionRegistry(projectDir);
    const id = await registry.createSession('Apagar via rota');

    const res = await httpRequest(port, 'DELETE', `/api/mcp-sessions/${id}`);
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ ok: true, sessionId: id });

    // Manifesto sumiu do disco.
    const files = await readdir(join(projectDir, '.smartcode', 'mcp-sessions'));
    expect(files).not.toContain(`${id}.json`);
  });

  it('DELETE /api/mcp-sessions/:id returns 404 for a non-existent id', async () => {
    const res = await httpRequest(port, 'DELETE', '/api/mcp-sessions/nonexistent-id');
    expect(res.status).toBe(404);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'Session not found' });
  });
});
