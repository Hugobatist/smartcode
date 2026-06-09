import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import type { ServerResponse } from 'node:http';

/**
 * MIME type mappings for static file serving.
 * Only includes types used by the diagram viewer.
 */
export const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.mmd': 'text/plain; charset=utf-8',
  // Fontes self-hosted (Nunito, Caveat, JetBrains Mono) — servidas de static/vendor/fonts.
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

/**
 * Serve a static file from the given path.
 * Sets appropriate Content-Type based on file extension.
 *
 * @returns true if file was served, false if not found
 */
export async function serveStaticFile(
  res: ServerResponse,
  filePath: string,
): Promise<boolean> {
  try {
    const content = await readFile(filePath);
    const ext = extname(filePath);
    const mime = MIME_TYPES[ext] ?? 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(content);
    return true;
  } catch {
    return false;
  }
}
