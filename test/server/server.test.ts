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

/** Collect N WebSocket messages and return them as an array of strings */
function collectMessages(ws: WebSocket, count: number, timeoutMs = 5000): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const messages: string[] = [];
    const timer = setTimeout(() => reject(new Error(`WebSocket collect timeout (got ${messages.length}/${count})`)), timeoutMs);
    const onMessage = (data: WebSocket.Data) => {
      messages.push(data.toString());
      if (messages.length >= count) {
        clearTimeout(timer);
        ws.removeListener('message', onMessage);
        resolve(messages);
      }
    };
    ws.on('message', onMessage);
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

  it('CORS headers present on API responses with localhost origin', async () => {
    const res = await httpRequest(port, 'GET', '/api/diagrams', undefined, {
      Origin: `http://localhost:${port}`,
    });
    expect(res.headers['access-control-allow-origin']).toBe(`http://localhost:${port}`);
  });

  it('OPTIONS preflight returns 204 with CORS headers', async () => {
    const res = await httpRequest(port, 'OPTIONS', '/api/diagrams', undefined, {
      Origin: `http://localhost:${port}`,
    });
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(`http://localhost:${port}`);
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

  it('WebSocket receives both file:changed and graph:update on broadcast', async () => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`);

    // Consume the initial 'connected' message
    await waitForMessage(ws);

    // Simulate the watcher callback pattern: broadcast file:changed then graph:update
    instance.wsManager.broadcast('default', {
      type: 'file:changed',
      file: 'valid-flowchart.mmd',
      content: 'flowchart LR\n    A-->B',
    });
    instance.wsManager.broadcast('default', {
      type: 'graph:update',
      file: 'valid-flowchart.mmd',
      graph: { diagramType: 'flowchart', direction: 'LR', nodes: {}, edges: [] },
    });

    // Should receive both messages in order
    const messages = await collectMessages(ws, 2, 3000);
    const msg1 = JSON.parse(messages[0]!);
    const msg2 = JSON.parse(messages[1]!);

    expect(msg1.type).toBe('file:changed');
    expect(msg1.file).toBe('valid-flowchart.mmd');

    expect(msg2.type).toBe('graph:update');
    expect(msg2.file).toBe('valid-flowchart.mmd');
    expect(msg2.graph).toBeDefined();
    expect(msg2.graph.diagramType).toBe('flowchart');

    ws.close();
    await new Promise<void>((resolve) => ws.on('close', () => resolve()));
  });

  it('graph:update message has correct structure with nodes, edges, flags, statuses', async () => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`);
    await waitForMessage(ws); // consume 'connected'

    // Broadcast a graph:update with full structure
    const graphPayload = {
      diagramType: 'flowchart',
      direction: 'LR',
      nodes: { A: { id: 'A', label: 'Load data', shape: 'rect' } },
      edges: [{ id: 'e0', from: 'A', to: 'B', type: 'arrow' }],
      subgraphs: {},
      classDefs: {},
      nodeStyles: {},
      linkStyles: {},
      classAssignments: {},
      filePath: 'test.mmd',
      flags: { B: { nodeId: 'B', message: 'review this' } },
      statuses: { A: { nodeId: 'A', status: 'done' } },
    };
    instance.wsManager.broadcast('default', {
      type: 'graph:update',
      file: 'test.mmd',
      graph: graphPayload,
    });

    const raw = await waitForMessage(ws, 3000);
    const msg = JSON.parse(raw);

    expect(msg.type).toBe('graph:update');
    expect(msg.graph.diagramType).toBe('flowchart');
    expect(msg.graph.direction).toBe('LR');
    expect(msg.graph.nodes).toHaveProperty('A');
    expect(msg.graph.edges).toHaveLength(1);
    expect(msg.graph.flags).toHaveProperty('B');
    expect(msg.graph.statuses).toHaveProperty('A');
    expect(msg.graph.filePath).toBe('test.mmd');

    ws.close();
    await new Promise<void>((resolve) => ws.on('close', () => resolve()));
  });

  it('GET /api/graph/:file returns serialized graph with flags and statuses', async () => {
    const res = await httpRequest(port, 'GET', '/api/graph/with-flags.mmd');
    expect(res.status).toBe(200);

    const data = JSON.parse(res.body);
    expect(data.diagramType).toBe('flowchart');
    expect(data.direction).toBe('LR');
    expect(data.nodes).toBeDefined();
    expect(typeof data.nodes).toBe('object');
    expect(data.edges).toBeDefined();
    expect(Array.isArray(data.edges)).toBe(true);
    expect(data.filePath).toBe('with-flags.mmd');

    // flags and statuses should now be present (from serializeGraphModel)
    expect(data.flags).toBeDefined();
    expect(typeof data.flags).toBe('object');
    expect(data.statuses).toBeDefined();
    expect(typeof data.statuses).toBe('object');

    // with-flags.mmd has flags on B and C
    expect(data.flags).toHaveProperty('B');
    expect(data.flags.B.message).toContain('slow');
    expect(data.flags).toHaveProperty('C');
    expect(data.flags.C.message).toContain('JSON');
  });

  it('GET /api/graph/:file returns 404 for missing file', async () => {
    const res = await httpRequest(port, 'GET', '/api/graph/nonexistent.mmd');
    expect(res.status).toBe(404);
  });
});
