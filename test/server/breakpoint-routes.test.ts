import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { request } from 'node:http';
import path from 'node:path';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHttpServer, type ServerInstance } from '../../src/server/server.js';

/** Make an HTTP request and return { status, body } */
function httpRequest(
  port: number,
  method: string,
  urlPath: string,
  body?: string,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string | number> = {};
    if (body) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(body);
    }
    const req = request(
      { hostname: 'localhost', port, method, path: urlPath, headers },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf-8'),
          });
        });
      },
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

const DIAGRAM_CONTENT = [
  'flowchart LR',
  '    A["Start"] --> B["Process"]',
  '    B --> C["End"]',
  '',
].join('\n');

describe('Breakpoint Routes', { timeout: 10_000 }, () => {
  let tmpDir: string;
  let instance: ServerInstance;
  let port: number;

  beforeAll(async () => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'smartb-bp-routes-'));
    writeFileSync(path.join(tmpDir, 'test.mmd'), DIAGRAM_CONTENT, 'utf-8');

    instance = createHttpServer(tmpDir);
    await new Promise<void>((resolve) => {
      instance.httpServer.listen(0, () => resolve());
    });
    const addr = instance.httpServer.address();
    if (typeof addr === 'object' && addr) {
      port = addr.port;
    }
  });

  afterAll(async () => {
    await instance.fileWatcher.close();
    instance.wsManager.close();
    await new Promise<void>((resolve, reject) => {
      instance.httpServer.close((err) => (err ? reject(err) : resolve()));
    });
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('GET /api/breakpoints/:file returns empty breakpoints initially', async () => {
    const res = await httpRequest(port, 'GET', '/api/breakpoints/test.mmd');
    expect(res.status).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.breakpoints).toEqual([]);
  });

  it('POST /api/breakpoints/:file sets a breakpoint', async () => {
    const res = await httpRequest(port, 'POST', '/api/breakpoints/test.mmd', JSON.stringify({
      nodeId: 'B',
      action: 'set',
    }));
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true });

    // Verify the breakpoint was persisted in the file
    const content = readFileSync(path.join(tmpDir, 'test.mmd'), 'utf-8');
    expect(content).toContain('@breakpoint B');
  });

  it('GET /api/breakpoints/:file returns the set breakpoint', async () => {
    const res = await httpRequest(port, 'GET', '/api/breakpoints/test.mmd');
    expect(res.status).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.breakpoints).toContain('B');
  });

  it('POST /api/breakpoints/:file removes a breakpoint', async () => {
    const res = await httpRequest(port, 'POST', '/api/breakpoints/test.mmd', JSON.stringify({
      nodeId: 'B',
      action: 'remove',
    }));
    expect(res.status).toBe(200);

    // Verify breakpoint was removed
    const getRes = await httpRequest(port, 'GET', '/api/breakpoints/test.mmd');
    const data = JSON.parse(getRes.body);
    expect(data.breakpoints).not.toContain('B');
  });

  it('POST /api/breakpoints/:file returns 400 when nodeId missing', async () => {
    const res = await httpRequest(port, 'POST', '/api/breakpoints/test.mmd', JSON.stringify({
      action: 'set',
    }));
    expect(res.status).toBe(400);
  });

  it('POST /api/breakpoints/:file returns 400 when action missing', async () => {
    const res = await httpRequest(port, 'POST', '/api/breakpoints/test.mmd', JSON.stringify({
      nodeId: 'A',
    }));
    expect(res.status).toBe(400);
  });

  it('GET /api/breakpoints/:file returns 404 for nonexistent file', async () => {
    const res = await httpRequest(port, 'GET', '/api/breakpoints/nonexistent.mmd');
    expect(res.status).toBe(404);
  });

  it('POST /api/breakpoints/:file/continue sets a continue signal', async () => {
    const res = await httpRequest(
      port, 'POST', '/api/breakpoints/test.mmd/continue',
      JSON.stringify({ nodeId: 'A' }),
    );
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true });

    // Verify the continue signal is stored
    expect(instance.breakpointContinueSignals.get('test.mmd:A')).toBe(true);
  });

  it('POST /api/breakpoints/:file/continue returns 400 when nodeId missing', async () => {
    const res = await httpRequest(
      port, 'POST', '/api/breakpoints/test.mmd/continue',
      JSON.stringify({}),
    );
    expect(res.status).toBe(400);
  });
});
