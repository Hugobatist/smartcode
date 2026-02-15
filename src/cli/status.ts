import { request } from 'node:http';
import pc from 'picocolors';
import { log } from '../utils/logger.js';

/** Format seconds into human-readable duration (e.g., "1h 2m 3s") */
export function formatUptime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts: string[] = [];
  if (hrs > 0) parts.push(`${hrs}h`);
  if (mins > 0) parts.push(`${mins}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(' ');
}

/** Status response shape from /api/status */
interface StatusResponse {
  status: string;
  uptime: number;
  port: number | null;
  projectDir: string;
  files: number;
  connectedClients: number;
  activeFlags: Array<{ file: string; nodeId: string; message: string }>;
}

/**
 * Query the running SmartB server and display its status.
 *
 * @param port - Port to query (default: 3333)
 */
export async function showStatus(port: number): Promise<void> {
  try {
    const data = await fetchStatus(port);

    log.info(pc.green('Server is running'));
    log.info(`  Port:       ${port}`);
    log.info(`  Uptime:     ${formatUptime(data.uptime)}`);
    log.info(`  Project:    ${data.projectDir}`);
    log.info(`  Files:      ${data.files}`);
    log.info(`  Clients:    ${data.connectedClients}`);
    log.info(`  Flags:      ${data.activeFlags.length}`);

    if (data.activeFlags.length > 0) {
      log.info('');
      log.info(pc.yellow('Active Flags:'));
      for (const flag of data.activeFlags) {
        log.info(`  ${pc.dim(flag.file)} ${flag.nodeId}: ${flag.message}`);
      }
    }
  } catch {
    log.info(pc.red('Server is not running'));
    log.info(`  Tried port: ${port}`);
    log.info(`  Run ${pc.cyan('smartb serve')} to start the server`);
  }
}

/** Fetch /api/status from the local server */
function fetchStatus(port: number): Promise<StatusResponse> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: 'localhost',
        port,
        path: '/api/status',
        method: 'GET',
        timeout: 3000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          try {
            const body = Buffer.concat(chunks).toString('utf-8');
            resolve(JSON.parse(body) as StatusResponse);
          } catch (err) {
            reject(err);
          }
        });
      },
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
    req.end();
  });
}
