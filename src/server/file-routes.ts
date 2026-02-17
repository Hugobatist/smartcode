import { writeFile, mkdir, unlink, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { DiagramService } from '../diagram/service.js';
import { resolveProjectPath } from '../utils/paths.js';
import { sendJson, readJsonBody, type Route } from './server.js';
import { buildFileTree } from './file-tree.js';

/**
 * Register file CRUD routes: tree, save, delete, mkdir, move, rmdir.
 * Follows the same pattern as session-routes.ts.
 */
export function registerFileRoutes(
  routes: Route[],
  service: DiagramService,
  projectDir: string,
): void {
  // -------------------------------------------------------
  // GET /tree.json -- File tree for sidebar
  // -------------------------------------------------------
  routes.push({
    method: 'GET',
    pattern: new RegExp('^/tree\\.json$'),
    handler: async (_req: IncomingMessage, res: ServerResponse) => {
      try {
        const files = await service.listFiles();
        const tree = buildFileTree(files);
        sendJson(res, tree);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        sendJson(res, { error: message }, 500);
      }
    },
  });

  // -------------------------------------------------------
  // POST /save -- Save diagram content
  // -------------------------------------------------------
  routes.push({
    method: 'POST',
    pattern: new RegExp('^/save$'),
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      try {
        const body = await readJsonBody<{ filename: string; content: string }>(req);
        if (!body.filename || body.content === undefined) {
          sendJson(res, { error: 'Missing filename or content' }, 400);
          return;
        }
        const resolved = resolveProjectPath(projectDir, body.filename);
        await mkdir(path.dirname(resolved), { recursive: true });
        await writeFile(resolved, body.content, 'utf-8');
        sendJson(res, { ok: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        if (message === 'Payload too large') { sendJson(res, { error: message }, 413); return; }
        const code = (err as NodeJS.ErrnoException)?.code;
        sendJson(res, { error: message }, code === 'ENOENT' ? 404 : 500);
      }
    },
  });

  // -------------------------------------------------------
  // POST /delete -- Delete diagram file
  // -------------------------------------------------------
  routes.push({
    method: 'POST',
    pattern: new RegExp('^/delete$'),
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      try {
        const body = await readJsonBody<{ filename: string }>(req);
        if (!body.filename) {
          sendJson(res, { error: 'Missing filename' }, 400);
          return;
        }
        const resolved = resolveProjectPath(projectDir, body.filename);
        await unlink(resolved);
        sendJson(res, { ok: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        if (message === 'Payload too large') { sendJson(res, { error: message }, 413); return; }
        const code = (err as NodeJS.ErrnoException)?.code;
        sendJson(res, { error: message }, code === 'ENOENT' ? 404 : 500);
      }
    },
  });

  // -------------------------------------------------------
  // POST /mkdir -- Create directory
  // -------------------------------------------------------
  routes.push({
    method: 'POST',
    pattern: new RegExp('^/mkdir$'),
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      try {
        const body = await readJsonBody<{ folder: string }>(req);
        if (!body.folder) {
          sendJson(res, { error: 'Missing folder' }, 400);
          return;
        }
        const resolved = resolveProjectPath(projectDir, body.folder);
        await mkdir(resolved, { recursive: true });
        sendJson(res, { ok: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        if (message === 'Payload too large') { sendJson(res, { error: message }, 413); return; }
        sendJson(res, { error: message }, 500);
      }
    },
  });

  // -------------------------------------------------------
  // POST /move -- Rename/move file
  // -------------------------------------------------------
  routes.push({
    method: 'POST',
    pattern: new RegExp('^/move$'),
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      try {
        const body = await readJsonBody<{ from: string; to: string }>(req);
        if (!body.from || !body.to) {
          sendJson(res, { error: 'Missing from or to' }, 400);
          return;
        }
        const resolvedFrom = resolveProjectPath(projectDir, body.from);
        const resolvedTo = resolveProjectPath(projectDir, body.to);
        await mkdir(path.dirname(resolvedTo), { recursive: true });
        await rename(resolvedFrom, resolvedTo);
        sendJson(res, { ok: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        if (message === 'Payload too large') { sendJson(res, { error: message }, 413); return; }
        const code = (err as NodeJS.ErrnoException)?.code;
        sendJson(res, { error: message }, code === 'ENOENT' ? 404 : 500);
      }
    },
  });

  // -------------------------------------------------------
  // POST /rmdir -- Delete directory recursively
  // -------------------------------------------------------
  routes.push({
    method: 'POST',
    pattern: new RegExp('^/rmdir$'),
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      try {
        const body = await readJsonBody<{ folder: string }>(req);
        if (!body.folder) {
          sendJson(res, { error: 'Missing folder' }, 400);
          return;
        }
        const resolved = resolveProjectPath(projectDir, body.folder);
        await rm(resolved, { recursive: true });
        sendJson(res, { ok: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        if (message === 'Payload too large') { sendJson(res, { error: message }, 413); return; }
        const code = (err as NodeJS.ErrnoException)?.code;
        sendJson(res, { error: message }, code === 'ENOENT' ? 404 : 500);
      }
    },
  });
}
