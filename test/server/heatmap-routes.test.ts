import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { request, type IncomingMessage } from 'node:http';
import path from 'node:path';
import { createHttpServer, type ServerInstance } from '../../src/server/server.js';

const fixturesDir = path.resolve(import.meta.dirname, '../fixtures');

/** Make an HTTP request and return { status, headers, body } */
function httpRequest(
  port: number,
  method: string,
  urlPath: string,
  body?: string,
  extraHeaders?: Record<string, string>,
): Promise<{ status: number; headers: IncomingMessage['headers']; body: string }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string | number> = { ...extraHeaders };
    if (body) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(body);
    }
    const req = request(
      {
        hostname: 'localhost',
        port,
        method,
        path: urlPath,
        headers,
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

describe('heatmap-routes', () => {
  let server: ServerInstance;
  let port: number;

  beforeAll(async () => {
    server = createHttpServer(fixturesDir);
    await new Promise<void>((resolve) => {
      server.httpServer.listen(0, () => {
        const addr = server.httpServer.address();
        port = typeof addr === 'object' && addr ? addr.port : 0;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await server.closeAllWatchers();
    server.wsManager.close();
    await new Promise<void>((resolve) => server.httpServer.close(() => resolve()));
  });

  beforeEach(() => {
    // Clear heatmap store between tests
    server.heatmapStore.clearAll();
  });

  it('GET /api/heatmap/:file returns empty object when no data', async () => {
    const res = await httpRequest(port, 'GET', '/api/heatmap/test.mmd');
    expect(res.status).toBe(200);
    const data = JSON.parse(res.body);
    expect(data).toEqual({});
  });

  it('POST /api/heatmap/:file/increment adds counts', async () => {
    const res = await httpRequest(
      port,
      'POST',
      '/api/heatmap/test.mmd/increment',
      JSON.stringify({ counts: { A: 3, B: 1 } }),
    );
    expect(res.status).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.ok).toBe(true);
  });

  it('GET returns counts after POST', async () => {
    await httpRequest(
      port,
      'POST',
      '/api/heatmap/test.mmd/increment',
      JSON.stringify({ counts: { A: 2, B: 5 } }),
    );

    const res = await httpRequest(port, 'GET', '/api/heatmap/test.mmd');
    expect(res.status).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.A).toBe(2);
    expect(data.B).toBe(5);
  });

  it('multiple POSTs accumulate counts', async () => {
    await httpRequest(
      port,
      'POST',
      '/api/heatmap/test.mmd/increment',
      JSON.stringify({ counts: { A: 3 } }),
    );
    await httpRequest(
      port,
      'POST',
      '/api/heatmap/test.mmd/increment',
      JSON.stringify({ counts: { A: 2, C: 1 } }),
    );

    const res = await httpRequest(port, 'GET', '/api/heatmap/test.mmd');
    const data = JSON.parse(res.body);
    expect(data.A).toBe(5);
    expect(data.C).toBe(1);
  });

  it('POST with missing counts field returns 400', async () => {
    const res = await httpRequest(
      port,
      'POST',
      '/api/heatmap/test.mmd/increment',
      JSON.stringify({ data: { A: 1 } }),
    );
    expect(res.status).toBe(400);
  });

  it('POST with invalid JSON returns 400', async () => {
    const res = await httpRequest(
      port,
      'POST',
      '/api/heatmap/test.mmd/increment',
      'not json',
    );
    expect(res.status).toBe(400);
  });

  it('different files have separate counts', async () => {
    await httpRequest(
      port,
      'POST',
      '/api/heatmap/a.mmd/increment',
      JSON.stringify({ counts: { X: 10 } }),
    );
    await httpRequest(
      port,
      'POST',
      '/api/heatmap/b.mmd/increment',
      JSON.stringify({ counts: { Y: 20 } }),
    );

    const resA = await httpRequest(port, 'GET', '/api/heatmap/a.mmd');
    const dataA = JSON.parse(resA.body);
    expect(dataA.X).toBe(10);
    expect(dataA.Y).toBeUndefined();

    const resB = await httpRequest(port, 'GET', '/api/heatmap/b.mmd');
    const dataB = JSON.parse(resB.body);
    expect(dataB.Y).toBe(20);
    expect(dataB.X).toBeUndefined();
  });
});
