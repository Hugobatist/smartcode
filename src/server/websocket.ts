import { WebSocketServer, WebSocket as WsWebSocket } from 'ws';
import type { Server, IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { log } from '../utils/logger.js';

/** Server-to-client WebSocket message types */
export type WsMessage =
  | { type: 'file:changed'; file: string; content: string }
  | { type: 'file:added'; file: string }
  | { type: 'file:removed'; file: string }
  | { type: 'tree:updated'; files: string[] }
  | { type: 'connected'; project: string }
  | { type: 'graph:update'; file: string; graph: Record<string, unknown> }
  // Phase 15: Breakpoints + Ghost Paths
  | { type: 'breakpoint:hit'; file: string; nodeId: string }
  | { type: 'breakpoint:continue'; file: string; nodeId: string }
  | { type: 'ghost:update'; file: string; ghostPaths: Array<{ fromNodeId: string; toNodeId: string; label?: string }> }
  // Phase 16: Heatmap + Session Recording
  | { type: 'session:event'; sessionId: string; event: Record<string, unknown> }
  | { type: 'heatmap:update'; file: string; data: Record<string, number> };

/**
 * Manages WebSocket servers using noServer mode for multi-project namespacing.
 * Each project directory gets its own WebSocketServer instance.
 * Clients are routed to the correct namespace via URL path:
 *   /ws         -> default project
 *   /ws/name    -> named project
 */
export class WebSocketManager {
  private namespaces: Map<string, WebSocketServer> = new Map();

  constructor(httpServer: Server) {
    httpServer.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
      const { pathname } = new URL(request.url!, `http://${request.headers.host}`);

      // Accept both /ws (default project) and /ws/project-name
      let projectName = 'default';
      if (pathname.startsWith('/ws/')) {
        projectName = decodeURIComponent(pathname.slice(4)) || 'default';
      } else if (pathname !== '/ws') {
        socket.destroy();
        return;
      }

      const wss = this.getOrCreateNamespace(projectName);
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    });
  }

  /** Get or create a WebSocketServer for the given project namespace */
  private getOrCreateNamespace(name: string): WebSocketServer {
    let wss = this.namespaces.get(name);
    if (wss) return wss;

    wss = new WebSocketServer({ noServer: true });
    wss.on('connection', (ws) => {
      ws.on('error', (err) => log.error(`WebSocket error [${name}]:`, err.message));
      ws.send(JSON.stringify({ type: 'connected', project: name } satisfies WsMessage));
    });
    this.namespaces.set(name, wss);
    return wss;
  }

  /** Ensure a namespace exists for the given project name */
  addProject(name: string): void {
    this.getOrCreateNamespace(name);
  }

  /** Broadcast a JSON message to all clients in a specific project namespace */
  broadcast(projectName: string, message: WsMessage): void {
    const wss = this.namespaces.get(projectName);
    if (!wss) return;
    const data = JSON.stringify(message);
    wss.clients.forEach((client) => {
      if (client.readyState === WsWebSocket.OPEN) {
        client.send(data);
      }
    });
  }

  /** Broadcast a JSON message to all clients across all namespaces */
  broadcastAll(message: WsMessage): void {
    const data = JSON.stringify(message);
    for (const wss of this.namespaces.values()) {
      wss.clients.forEach((client) => {
        if (client.readyState === WsWebSocket.OPEN) {
          client.send(data);
        }
      });
    }
  }

  /** Count connected clients with OPEN readyState */
  getClientCount(namespace?: string): number {
    if (namespace) {
      const wss = this.namespaces.get(namespace);
      if (!wss) return 0;
      let count = 0;
      wss.clients.forEach((client) => {
        if (client.readyState === WsWebSocket.OPEN) count++;
      });
      return count;
    }

    let total = 0;
    for (const wss of this.namespaces.values()) {
      wss.clients.forEach((client) => {
        if (client.readyState === WsWebSocket.OPEN) total++;
      });
    }
    return total;
  }

  /** Close all WebSocketServer instances */
  close(): void {
    for (const wss of this.namespaces.values()) {
      wss.close();
    }
    this.namespaces.clear();
  }
}
