import { WebSocketServer, WebSocket as WsWebSocket } from 'ws';
import type { Server } from 'node:http';
import { log } from '../utils/logger.js';

/** Server-to-client WebSocket message types */
export type WsMessage =
  | { type: 'file:changed'; file: string; content: string }
  | { type: 'file:added'; file: string }
  | { type: 'file:removed'; file: string }
  | { type: 'tree:updated'; files: string[] }
  | { type: 'connected' };

/**
 * Manages a WebSocket server attached to an existing HTTP server.
 * Handles client connections on /ws and broadcasts messages to all connected clients.
 */
export class WebSocketManager {
  private wss: WebSocketServer;

  constructor(httpServer: Server) {
    this.wss = new WebSocketServer({
      server: httpServer,
      path: '/ws',
    });

    this.wss.on('connection', (ws) => {
      ws.on('error', (err) => log.error('WebSocket error:', err.message));
      ws.send(JSON.stringify({ type: 'connected' } satisfies WsMessage));
    });
  }

  /** Broadcast a JSON message to all connected clients with open connections */
  broadcast(message: WsMessage): void {
    const data = JSON.stringify(message);
    this.wss.clients.forEach((client) => {
      if (client.readyState === WsWebSocket.OPEN) {
        client.send(data);
      }
    });
  }

  /** Close the WebSocket server */
  close(): void {
    this.wss.close();
  }
}
