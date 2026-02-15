import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { request, type IncomingMessage } from 'node:http';
import path from 'node:path';
import WebSocket from 'ws';
import { createHttpServer, type ServerInstance } from '../../src/server/server.js';

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

/** Wait for the next WebSocket message and return its string data */
function waitForMessage(ws: WebSocket, timeoutMs = 5000): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('WebSocket message timeout')), timeoutMs);
    ws.once('message', (data) => {
      clearTimeout(timer);
      resolve(data.toString());
    });
  });
}

/** Wait for a WebSocket to reach OPEN state */
function waitForOpen(ws: WebSocket, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) { resolve(); return; }
    const timer = setTimeout(() => reject(new Error('WebSocket open timeout')), timeoutMs);
    ws.once('open', () => { clearTimeout(timer); resolve(); });
    ws.once('error', (err) => { clearTimeout(timer); reject(err); });
  });
}

describe('HTTP Server Integration', { timeout: 10_000 }, () => {
  let instance: ServerInstance;
  let port: number;

  beforeAll(async () => {
    instance = createHttpServer(fixturesDir);
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

  it('GET /api/diagrams/:file returns diagram content with collapse metadata', async () => {
    const res = await httpRequest(port, 'GET', '/api/diagrams/valid-flowchart.mmd');
    expect(res.status).toBe(200);
    const data = JSON.parse(res.body);
    expect(typeof data.mermaidContent).toBe('string');
    expect(data.mermaidContent).toContain('flowchart');
    expect(typeof data.flags).toBe('object');
    expect(data.validation).toBeDefined();
    expect(typeof data.validation.valid).toBe('boolean');
    // Collapse metadata should always be present
    expect(data.collapse).toBeDefined();
    expect(typeof data.collapse.visibleNodes).toBe('number');
    expect(Array.isArray(data.collapse.autoCollapsed)).toBe(true);
    expect(Array.isArray(data.collapse.manualCollapsed)).toBe(true);
    expect(data.collapse.config).toBeDefined();
    expect(typeof data.collapse.config.maxVisibleNodes).toBe('number');
    expect(Array.isArray(data.collapse.breadcrumbs)).toBe(true);
    // rawContent should be present
    expect(typeof data.rawContent).toBe('string');
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

  it('WebSocket server accepts connections on /ws (default project)', async () => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`);

    const message = await waitForMessage(ws);
    const parsed = JSON.parse(message);
    expect(parsed).toEqual({ type: 'connected', project: 'default' });

    ws.close();
    await new Promise<void>((resolve) => {
      ws.on('close', () => resolve());
    });
  });

  it('WebSocket namespace isolation', async () => {
    const clientA = new WebSocket(`ws://localhost:${port}/ws/project-a`);
    const clientB = new WebSocket(`ws://localhost:${port}/ws/project-b`);

    // Wait for both to connect and receive 'connected' message
    const [msgA, msgB] = await Promise.all([
      waitForMessage(clientA),
      waitForMessage(clientB),
    ]);
    expect(JSON.parse(msgA)).toEqual({ type: 'connected', project: 'project-a' });
    expect(JSON.parse(msgB)).toEqual({ type: 'connected', project: 'project-b' });

    // Set up a message listener on clientB that should NOT receive anything
    let clientBReceived = false;
    clientB.on('message', () => { clientBReceived = true; });

    // Broadcast to project-a only
    instance.wsManager.broadcast('project-a', {
      type: 'file:changed',
      file: 'test.mmd',
      content: 'flowchart LR\n  A-->B',
    });

    // ClientA should receive the broadcast
    const broadcastMsg = await waitForMessage(clientA, 2000);
    const parsed = JSON.parse(broadcastMsg);
    expect(parsed.type).toBe('file:changed');
    expect(parsed.file).toBe('test.mmd');

    // Give clientB a moment to receive any leaked messages
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(clientBReceived).toBe(false);

    clientA.close();
    clientB.close();
    await Promise.all([
      new Promise<void>((resolve) => clientA.on('close', () => resolve())),
      new Promise<void>((resolve) => clientB.on('close', () => resolve())),
    ]);
  });
});
