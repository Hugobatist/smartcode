import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { request, type IncomingMessage } from 'node:http';
import type { Server } from 'node:http';
import path from 'node:path';
import { createHttpServer } from '../../src/server/server.js';

const fixturesDir = path.resolve(import.meta.dirname, '../fixtures');

/** Make an HTTP request and return { status, headers, body } */
function httpRequest(
  port: number,
  method: string,
  urlPath: string,
  body?: string,
): Promise<{ status: number; headers: IncomingMessage['headers']; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: 'localhost',
        port,
        method,
        path: urlPath,
        headers: body
          ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
          : undefined,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
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

describe('HTTP Server Integration', { timeout: 10_000 }, () => {
  let server: Server;
  let port: number;

  beforeAll(async () => {
    server = createHttpServer(fixturesDir);
    await new Promise<void>((resolve) => {
      server.listen(0, () => resolve());
    });
    const addr = server.address();
    if (typeof addr === 'object' && addr) {
      port = addr.port;
    }
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it('GET / returns live.html', async () => {
    const res = await httpRequest(port, 'GET', '/');
    expect(res.status).toBe(200);
    expect(res.body).toContain('SmartB');
  });

  it('GET /tree.json returns file tree', async () => {
    const res = await httpRequest(port, 'GET', '/tree.json');
    expect(res.status).toBe(200);
    const tree = JSON.parse(res.body);
    expect(Array.isArray(tree)).toBe(true);
    expect(tree.length).toBeGreaterThan(0);
    // Each entry should have type and name
    const first = tree[0];
    expect(first).toHaveProperty('type');
    expect(first).toHaveProperty('name');
  });

  it('GET /api/diagrams lists files', async () => {
    const res = await httpRequest(port, 'GET', '/api/diagrams');
    expect(res.status).toBe(200);
    const data = JSON.parse(res.body);
    expect(Array.isArray(data.files)).toBe(true);
    expect(data.files).toContain('valid-flowchart.mmd');
  });

  it('GET /api/diagrams/:file returns diagram content', async () => {
    const res = await httpRequest(port, 'GET', '/api/diagrams/valid-flowchart.mmd');
    expect(res.status).toBe(200);
    const data = JSON.parse(res.body);
    expect(typeof data.mermaidContent).toBe('string');
    expect(data.mermaidContent).toContain('flowchart');
    expect(typeof data.flags).toBe('object');
    expect(data.validation).toBeDefined();
    expect(typeof data.validation.valid).toBe('boolean');
  });

  it('GET /api/diagrams/:file returns 404 for missing file', async () => {
    const res = await httpRequest(port, 'GET', '/api/diagrams/nonexistent.mmd');
    expect(res.status).toBe(404);
  });

  it('CORS headers present on API responses', async () => {
    const res = await httpRequest(port, 'GET', '/api/diagrams');
    expect(res.headers['access-control-allow-origin']).toBe('*');
  });

  it('OPTIONS preflight returns 204 with CORS headers', async () => {
    const res = await httpRequest(port, 'OPTIONS', '/api/diagrams');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.headers['access-control-allow-methods']).toContain('GET');
  });
});
