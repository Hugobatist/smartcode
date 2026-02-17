import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { request } from 'node:http';
import path from 'node:path';
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
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

describe('File Routes', { timeout: 10_000 }, () => {
  let tmpDir: string;
  let instance: ServerInstance;
  let port: number;

  beforeAll(async () => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'smartb-file-routes-'));
    // Create a seed diagram
    writeFileSync(path.join(tmpDir, 'existing.mmd'), 'flowchart LR\n    A --> B\n', 'utf-8');

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

  // -- GET /tree.json --
  it('GET /tree.json returns a non-empty file tree', async () => {
    const res = await httpRequest(port, 'GET', '/tree.json');
    expect(res.status).toBe(200);
    const tree = JSON.parse(res.body);
    expect(Array.isArray(tree)).toBe(true);
    expect(tree.length).toBeGreaterThan(0);
  });

  // -- POST /save --
  it('POST /save creates a new file', async () => {
    const res = await httpRequest(port, 'POST', '/save', JSON.stringify({
      filename: 'new-diagram.mmd',
      content: 'flowchart TD\n    X --> Y\n',
    }));
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true });

    const content = readFileSync(path.join(tmpDir, 'new-diagram.mmd'), 'utf-8');
    expect(content).toContain('flowchart TD');
  });

  it('POST /save returns 400 when filename is missing', async () => {
    const res = await httpRequest(port, 'POST', '/save', JSON.stringify({
      content: 'flowchart LR\n',
    }));
    expect(res.status).toBe(400);
  });

  // -- POST /delete --
  it('POST /delete removes a file', async () => {
    writeFileSync(path.join(tmpDir, 'to-delete.mmd'), 'flowchart LR\n    A\n', 'utf-8');

    const res = await httpRequest(port, 'POST', '/delete', JSON.stringify({
      filename: 'to-delete.mmd',
    }));
    expect(res.status).toBe(200);
    expect(existsSync(path.join(tmpDir, 'to-delete.mmd'))).toBe(false);
  });

  it('POST /delete returns 404 for nonexistent file', async () => {
    const res = await httpRequest(port, 'POST', '/delete', JSON.stringify({
      filename: 'nonexistent.mmd',
    }));
    expect(res.status).toBe(404);
  });

  it('POST /delete returns 400 when filename is missing', async () => {
    const res = await httpRequest(port, 'POST', '/delete', JSON.stringify({}));
    expect(res.status).toBe(400);
  });

  // -- POST /mkdir --
  it('POST /mkdir creates a directory', async () => {
    const res = await httpRequest(port, 'POST', '/mkdir', JSON.stringify({
      folder: 'new-folder',
    }));
    expect(res.status).toBe(200);
    expect(existsSync(path.join(tmpDir, 'new-folder'))).toBe(true);
  });

  it('POST /mkdir returns 400 when folder is missing', async () => {
    const res = await httpRequest(port, 'POST', '/mkdir', JSON.stringify({}));
    expect(res.status).toBe(400);
  });

  // -- POST /move --
  it('POST /move renames a file', async () => {
    writeFileSync(path.join(tmpDir, 'old-name.mmd'), 'flowchart LR\n    Z\n', 'utf-8');

    const res = await httpRequest(port, 'POST', '/move', JSON.stringify({
      from: 'old-name.mmd',
      to: 'renamed.mmd',
    }));
    expect(res.status).toBe(200);
    expect(existsSync(path.join(tmpDir, 'old-name.mmd'))).toBe(false);
    expect(existsSync(path.join(tmpDir, 'renamed.mmd'))).toBe(true);
  });

  it('POST /move returns 400 when from or to is missing', async () => {
    const res = await httpRequest(port, 'POST', '/move', JSON.stringify({ from: 'a.mmd' }));
    expect(res.status).toBe(400);
  });

  it('POST /move returns 404 when source does not exist', async () => {
    const res = await httpRequest(port, 'POST', '/move', JSON.stringify({
      from: 'ghost.mmd',
      to: 'dest.mmd',
    }));
    expect(res.status).toBe(404);
  });

  // -- POST /rmdir --
  it('POST /rmdir removes a directory', async () => {
    mkdirSync(path.join(tmpDir, 'temp-dir'), { recursive: true });
    writeFileSync(path.join(tmpDir, 'temp-dir', 'child.mmd'), 'flowchart LR\n', 'utf-8');

    const res = await httpRequest(port, 'POST', '/rmdir', JSON.stringify({
      folder: 'temp-dir',
    }));
    expect(res.status).toBe(200);
    expect(existsSync(path.join(tmpDir, 'temp-dir'))).toBe(false);
  });

  it('POST /rmdir returns 400 when folder is missing', async () => {
    const res = await httpRequest(port, 'POST', '/rmdir', JSON.stringify({}));
    expect(res.status).toBe(400);
  });
});
