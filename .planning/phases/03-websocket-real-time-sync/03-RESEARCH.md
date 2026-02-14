# Phase 3: WebSocket + Real-Time Sync - Research

**Researched:** 2026-02-14
**Domain:** WebSocket server, file system watching, real-time browser sync
**Confidence:** HIGH

## Summary

Phase 3 replaces the current 2-second polling mechanism (`setInterval(syncFile, 2000)` in `live.html`) with a push-based WebSocket connection. The server watches `.mmd` files on disk using chokidar, and broadcasts changes to all connected browser clients via the `ws` WebSocket library attached to the existing `http.createServer` instance. The client side uses the browser-native `WebSocket` API with a custom reconnection wrapper implementing exponential backoff with jitter.

The architecture splits cleanly into three layers: (1) file watcher producing change events, (2) WebSocket server broadcasting those events to all clients, and (3) client-side WebSocket consumer that receives events and triggers re-render. The existing `ProjectManager` class provides the multi-project namespace foundation -- each project directory gets its own chokidar watcher and its WebSocket clients receive only events from their namespace.

**Primary recommendation:** Use `ws` (v8.18+) attached to the existing `http.createServer` via the `server` option, `chokidar` (v4.0.3) for file watching with the `ignored` callback filtering for `.mmd` files, and a hand-rolled browser-native `WebSocket` reconnection wrapper (no library needed -- the browser API is sufficient, and the reconnect logic is ~40 lines).

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `ws` | ^8.18.0 | WebSocket server for Node.js | 32M+ weekly downloads, the de facto Node.js WS server. Zero-dependency. Attaches to existing http.Server via `server` option. |
| `chokidar` | ^4.0.3 | Cross-platform file system watcher | 30M+ repos use it, battle-tested on macOS/Linux/Windows. Rewritten in TypeScript v4. Single dependency (readdirp). |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@types/ws` | ^8.18.1 | TypeScript type definitions for ws | Always -- ws does not bundle its own types |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `ws` | Node.js native `WebSocket` (global since v21) | Node.js native WS is client-only as of v22 -- no `WebSocketServer`. Would need the ws package anyway for the server. |
| `chokidar` v4 | `chokidar` v5 (ESM-only) | v5 is ESM-only and reduces package size to ~80KB, but was released Nov 2024 and has less ecosystem validation. v4 is safer -- still works fine with ESM imports and has been stable. This project targets Node 22, so either works. |
| `chokidar` | Node.js native `fs.watch` | `fs.watch` lacks reliable recursive watching on Linux, doesn't report filenames on macOS, and doesn't handle editor atomic saves. Vite evaluated switching and concluded they'd need to rebuild chokidar's interface. Not worth it. |
| `chokidar` | `@parcel/watcher` | More performant for huge trees (uses native C++ bindings), but heavier install footprint and overkill for watching a handful of .mmd files. |
| Browser reconnecting WS | `reconnecting-websocket` npm | Adds a dependency for ~40 lines of code. The browser-native WebSocket API is sufficient. |

**Installation:**
```bash
npm install ws chokidar
npm install -D @types/ws
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── server/
│   ├── server.ts         # Existing: createHttpServer, startServer (MODIFY)
│   ├── routes.ts         # Existing: HTTP routes (NO CHANGE)
│   ├── static.ts         # Existing: static file serving (NO CHANGE)
│   └── websocket.ts      # NEW: WebSocketManager class
├── watcher/
│   └── file-watcher.ts   # NEW: FileWatcher class wrapping chokidar
├── project/
│   ├── manager.ts        # Existing: ProjectManager (MINOR MODIFY)
│   └── discovery.ts      # Existing: discoverMmdFiles (NO CHANGE)
static/
├── live.html             # Existing: MODIFY to replace polling with WS
└── ws-client.js          # NEW: WebSocket client with reconnect logic
```

### Pattern 1: Attach WebSocket Server to Existing HTTP Server
**What:** Use the `server` option of `WebSocketServer` to share the same port as the HTTP server.
**When to use:** Always -- no reason to run WS on a separate port.
**Example:**
```typescript
// Source: Context7 /websockets/ws - verified
import { WebSocketServer } from 'ws';
import { createServer } from 'node:http';

const httpServer = createServer(/* handler */);
const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws, request) => {
  ws.on('error', console.error);
  ws.on('message', (data) => { /* handle */ });
});

httpServer.listen(3333);
```

### Pattern 2: Broadcast to All Connected Clients
**What:** Iterate over `wss.clients` Set and send to each open connection.
**When to use:** File change events that need to reach all browsers.
**Example:**
```typescript
// Source: Context7 /websockets/ws - verified
import WebSocket, { WebSocketServer } from 'ws';

function broadcast(wss: WebSocketServer, data: string): void {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}
```

### Pattern 3: Chokidar v4 with Callback Filter (No Globs)
**What:** Chokidar v4 removed glob support. Use the `ignored` callback to filter for `.mmd` files.
**When to use:** Always in v4+.
**Example:**
```typescript
// Source: Context7 /paulmillr/chokidar - verified
import chokidar from 'chokidar';

const watcher = chokidar.watch(projectDir, {
  ignored: (path, stats) => {
    // Watch directories (to traverse into them) and .mmd files only
    if (stats?.isDirectory()) return false;
    return !path.endsWith('.mmd');
  },
  persistent: true,
  ignoreInitial: true, // Don't fire events for existing files on startup
});

watcher
  .on('change', (filePath) => { /* broadcast file:changed */ })
  .on('add', (filePath) => { /* broadcast file:added */ })
  .on('unlink', (filePath) => { /* broadcast file:removed */ });
```

### Pattern 4: Typed WebSocket Message Protocol
**What:** Define a discriminated union of message types for type-safe WS communication.
**When to use:** All WS messages between server and client.
**Example:**
```typescript
// Server-to-client messages
type WsMessage =
  | { type: 'file:changed'; file: string; content: string }
  | { type: 'file:added'; file: string }
  | { type: 'file:removed'; file: string }
  | { type: 'tree:updated'; tree: TreeNode[] }
  | { type: 'connected'; watchedDir: string };

// Client-to-server messages (future use)
type WsClientMessage =
  | { type: 'subscribe'; project: string };
```

### Pattern 5: noServer Mode for Multi-Project Namespacing
**What:** Use `noServer: true` and manually handle the `upgrade` event to route different URL paths to different WebSocket server instances.
**When to use:** WS-05 multi-project support -- each project directory maps to a URL path.
**Example:**
```typescript
// Source: Context7 /websockets/ws - verified
import { createServer } from 'http';
import { WebSocketServer } from 'ws';

const server = createServer(/* handler */);
const projectServers = new Map<string, WebSocketServer>();

server.on('upgrade', (request, socket, head) => {
  const { pathname } = new URL(request.url!, `http://${request.headers.host}`);
  // pathname like /ws/project-name
  const projectName = pathname.replace('/ws/', '');
  const wss = projectServers.get(projectName);

  if (wss) {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});
```

### Anti-Patterns to Avoid
- **Polling fallback:** Do NOT keep the `setInterval(syncFile, 2000)` as a fallback alongside WebSocket. It creates race conditions where polling and WS events compete. Remove polling entirely when WS is connected.
- **Sending full file content on every change:** For large files, this wastes bandwidth. Always send the full content for now (`.mmd` files are tiny), but design the message protocol to allow delta updates later.
- **Using `ws` on the client side:** The browser has a native `WebSocket` API. Do not bundle the `ws` npm package for client-side use.
- **Debouncing on the server:** Debounce on the watcher side, not in the broadcast. If chokidar fires, broadcast immediately. The 50ms requirement means no debounce.
- **Watching `node_modules` or `.git`:** Chokidar's `ignored` callback must exclude these directories to prevent performance issues.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| File watching | Custom `fs.watch` wrapper | chokidar | Cross-platform edge cases (atomic saves, rename events, macOS FSEvents, Linux inotify limits) take months to get right |
| WebSocket server | Raw `net.Socket` + HTTP upgrade parsing | ws library | WS protocol framing, masking, ping/pong, close handshake, per-message deflate are all deceptively complex |
| WebSocket message framing | Custom binary protocol | JSON.stringify/parse | .mmd files are small text; JSON adds negligible overhead and is debuggable |

**Key insight:** The WebSocket protocol (RFC 6455) has subtle requirements around frame masking, UTF-8 validation, and close handshake that make raw implementation error-prone. The `ws` library handles all of this with zero dependencies.

## Common Pitfalls

### Pitfall 1: Editor Atomic Saves Causing Ghost Events
**What goes wrong:** Editors like VS Code, Vim, and Sublime use "atomic save" -- they write to a temp file, then rename it over the target. This causes chokidar to emit `unlink` + `add` instead of `change`.
**Why it happens:** The original file is deleted momentarily, then a new file appears.
**How to avoid:** Chokidar's `atomic` option (default: `true` when not using polling) handles this automatically. If a file is re-added within 100ms of being deleted, chokidar emits `change` instead of `unlink`+`add`. Verify this works with the project's test editor.
**Warning signs:** Diagram briefly disappears in the browser, then reappears.

### Pitfall 2: chokidar v4 Glob Removal
**What goes wrong:** Calling `chokidar.watch('**/*.mmd')` silently fails or watches nothing in v4.
**Why it happens:** v4 removed glob support entirely. The first argument must be a concrete path (file or directory).
**How to avoid:** Watch the directory, filter with the `ignored` callback:
```typescript
chokidar.watch(projectDir, {
  ignored: (path, stats) => stats?.isFile() && !path.endsWith('.mmd'),
});
```
**Warning signs:** No change events fire despite modifying `.mmd` files.

### Pitfall 3: WebSocket Connection Not Upgrading
**What goes wrong:** WebSocket handshake fails with a 404 or the connection drops immediately.
**Why it happens:** The HTTP request handler intercepts the upgrade request before `ws` can handle it, or the `upgrade` event listener is missing when using `noServer` mode.
**How to avoid:** When using the `server` option (simple mode), `ws` automatically handles the upgrade. When using `noServer` mode, you MUST listen for the `upgrade` event on the HTTP server and call `wss.handleUpgrade()`. The existing `createHandler` function in `server.ts` won't interfere because upgrade requests don't go through the normal request handler.
**Warning signs:** Browser console shows `WebSocket connection to 'ws://...' failed`.

### Pitfall 4: Thundering Herd on Server Restart
**What goes wrong:** Server restarts, and all clients reconnect at exactly the same time, overwhelming the server.
**Why it happens:** All clients use the same base delay (e.g., 1s) and reconnect simultaneously.
**How to avoid:** Add jitter (randomness) to the exponential backoff:
```javascript
const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
const jitter = delay * (0.5 + Math.random() * 0.5); // 50-100% of delay
```
**Warning signs:** Server spikes CPU/memory after restart with many connected clients.

### Pitfall 5: Memory Leak from Unclosed Watchers
**What goes wrong:** Adding projects without closing their watchers leaks file descriptors.
**Why it happens:** Each chokidar instance opens OS-level file handles (inotify on Linux, FSEvents on macOS). Forgetting to call `watcher.close()` when removing a project leaks them.
**How to avoid:** The `FileWatcher` class must expose a `close()` method that calls `watcher.close()`. The `ProjectManager` must call it when removing projects. The SIGINT handler must close all watchers.
**Warning signs:** `EMFILE: too many open files` error after running for extended periods.

### Pitfall 6: Race Condition Between File Read and Broadcast
**What goes wrong:** Chokidar fires `change`, the server reads the file, but the editor hasn't finished writing, so partial content is broadcast.
**Why it happens:** The `change` event fires as soon as the file is modified, not when the write is complete.
**How to avoid:** Two options: (a) use chokidar's `awaitWriteFinish` option with a short `stabilityThreshold` (100ms), or (b) catch read errors and retry once after a short delay. Option (b) is preferred because `awaitWriteFinish` adds latency that conflicts with the 50ms requirement. Most editors complete writes atomically (rename), so the file is complete when chokidar fires. If using option (a), set `stabilityThreshold: 50` and `pollInterval: 10` to stay within the 50ms budget.
**How to avoid (recommended):** Since editors use atomic saves (write temp, rename), and chokidar's `atomic` option handles this, the file is typically complete when the `change` event fires. Just read the file immediately.
**Warning signs:** Occasionally see truncated Mermaid content in the browser.

### Pitfall 7: Path Format Mismatch Between Watcher and Client
**What goes wrong:** Chokidar returns absolute paths, but the client expects relative paths (like `plano-de-acao/plano-acao.mmd`).
**Why it happens:** chokidar returns paths relative to the watched directory, but the format may differ across platforms (backslashes on Windows).
**How to avoid:** Normalize chokidar paths to forward-slash relative paths using `path.relative(projectDir, filePath).split(path.sep).join('/')`.
**Warning signs:** Client receives a file path it can't match to any known file.

## Code Examples

Verified patterns from official sources:

### WebSocket Server Attached to Existing HTTP Server
```typescript
// Source: Context7 /websockets/ws - server option
import { WebSocketServer, WebSocket as WsWebSocket } from 'ws';
import type { Server } from 'node:http';

export class WebSocketManager {
  private wss: WebSocketServer;

  constructor(httpServer: Server) {
    this.wss = new WebSocketServer({
      server: httpServer,
      path: '/ws', // Only upgrade requests to /ws
    });

    this.wss.on('connection', (ws, req) => {
      ws.on('error', (err) => log.error('WebSocket error:', err.message));
      ws.send(JSON.stringify({ type: 'connected' }));
    });
  }

  broadcast(message: object): void {
    const data = JSON.stringify(message);
    this.wss.clients.forEach((client) => {
      if (client.readyState === WsWebSocket.OPEN) {
        client.send(data);
      }
    });
  }

  close(): void {
    this.wss.close();
  }
}
```

### File Watcher with Chokidar v4
```typescript
// Source: Context7 /paulmillr/chokidar - v4 API (no globs)
import chokidar, { type FSWatcher } from 'chokidar';
import path from 'node:path';

export class FileWatcher {
  private watcher: FSWatcher;

  constructor(
    private projectDir: string,
    private onFileChanged: (relativePath: string) => void,
    private onFileAdded: (relativePath: string) => void,
    private onFileRemoved: (relativePath: string) => void,
  ) {
    this.watcher = chokidar.watch(projectDir, {
      ignored: (filePath, stats) => {
        // Always traverse directories (except node_modules/.git)
        const basename = path.basename(filePath);
        if (basename === 'node_modules' || basename === '.git') return true;
        if (stats?.isDirectory()) return false;
        // Only watch .mmd files
        return !filePath.endsWith('.mmd');
      },
      persistent: true,
      ignoreInitial: true,
      atomic: true, // Handle editor atomic saves
    });

    this.watcher
      .on('change', (filePath) => this.handleEvent('change', filePath))
      .on('add', (filePath) => this.handleEvent('add', filePath))
      .on('unlink', (filePath) => this.handleEvent('unlink', filePath));
  }

  private handleEvent(event: string, filePath: string): void {
    const relative = path.relative(this.projectDir, filePath)
      .split(path.sep).join('/');

    if (event === 'change') this.onFileChanged(relative);
    else if (event === 'add') this.onFileAdded(relative);
    else if (event === 'unlink') this.onFileRemoved(relative);
  }

  async close(): Promise<void> {
    await this.watcher.close();
  }
}
```

### Client-Side WebSocket with Exponential Backoff
```javascript
// Browser-native WebSocket API -- no npm package needed
function createReconnectingWebSocket(url, onMessage, onStatusChange) {
  let ws = null;
  let attempt = 0;
  let timer = null;
  const BASE_DELAY = 500;   // 500ms initial
  const MAX_DELAY = 16000;  // 16s max
  const MAX_ATTEMPTS = Infinity; // Never stop trying

  function connect() {
    if (ws && ws.readyState < 2) return; // Already open or connecting
    ws = new WebSocket(url);

    ws.onopen = () => {
      attempt = 0;
      onStatusChange('connected');
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        onMessage(msg);
      } catch (e) {
        console.error('WS parse error:', e);
      }
    };

    ws.onclose = () => {
      onStatusChange('disconnected');
      scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose will fire after onerror
    };
  }

  function scheduleReconnect() {
    const delay = Math.min(BASE_DELAY * Math.pow(2, attempt), MAX_DELAY);
    const jitter = delay * (0.5 + Math.random() * 0.5);
    attempt++;
    onStatusChange('reconnecting');
    timer = setTimeout(connect, jitter);
  }

  function close() {
    clearTimeout(timer);
    if (ws) ws.close();
  }

  connect();
  return { close };
}
```

### Integration Point: Modifying createHttpServer
```typescript
// Current signature (server.ts line 129):
// export function createHttpServer(projectDir: string): ReturnType<typeof createServer>
//
// Modified to return server + websocket manager:
export interface ServerInstance {
  httpServer: ReturnType<typeof createServer>;
  wsManager: WebSocketManager;
  fileWatcher: FileWatcher;
}

export function createHttpServer(projectDir: string): ServerInstance {
  const resolvedDir = path.resolve(projectDir);
  const service = new DiagramService(resolvedDir);
  const staticDir = getStaticDir();
  const routes = registerRoutes(service, resolvedDir);
  const handler = createHandler(routes, staticDir);

  const httpServer = createServer((req, res) => {
    handler(req, res).catch(/* ... */);
  });

  const wsManager = new WebSocketManager(httpServer);
  const fileWatcher = new FileWatcher(
    resolvedDir,
    async (file) => {
      const content = await readFile(
        path.join(resolvedDir, file), 'utf-8'
      ).catch(() => null);
      if (content !== null) {
        wsManager.broadcast({ type: 'file:changed', file, content });
      }
    },
    (file) => {
      wsManager.broadcast({ type: 'file:added', file });
      // Also broadcast updated tree
      service.listFiles().then(files => {
        wsManager.broadcast({ type: 'tree:updated', files });
      });
    },
    (file) => {
      wsManager.broadcast({ type: 'file:removed', file });
      service.listFiles().then(files => {
        wsManager.broadcast({ type: 'tree:updated', files });
      });
    },
  );

  return { httpServer, wsManager, fileWatcher };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `chokidar.watch('**/*.mmd')` glob patterns | `chokidar.watch(dir, { ignored: callback })` | chokidar v4 (Sep 2024) | Must use callback filter, not glob strings |
| `chokidar` v3 with 13 dependencies | `chokidar` v4 with 1 dependency (readdirp) | v4 (Sep 2024) | Dramatically smaller install footprint |
| `@types/chokidar` separate package | Built-in TypeScript types in chokidar v4+ | v4 (Sep 2024) | No need for `@types/chokidar` |
| Custom reconnecting WS libraries | Browser native `WebSocket` + simple wrapper | Always available | No npm dependency needed for client |
| Polling with `setInterval` + `fetch` | WebSocket push | This phase | Sub-50ms latency, no wasted requests |

**Deprecated/outdated:**
- `@types/chokidar`: Not needed with chokidar v4+ (types are bundled)
- `chokidar.watch('**/*.mmd')`: Glob patterns removed in v4
- `socket.io`: Heavy abstraction layer with fallback transports (polling, etc.) -- overkill when native WebSocket works everywhere

## Open Questions

1. **Return type change for `createHttpServer`**
   - What we know: Currently returns `ReturnType<typeof createServer>` (bare HTTP server). Phase 3 needs it to also return the WS manager and file watcher for cleanup.
   - What's unclear: Whether to change the return type (breaking the integration test interface) or wrap it differently.
   - Recommendation: Return a `ServerInstance` object with `.httpServer`, `.wsManager`, `.fileWatcher` properties. Update the one integration test that uses `createHttpServer`. This is an internal API, not public -- breaking change is acceptable.

2. **Multi-project WS routing (Plan 03-03)**
   - What we know: The current server handles a single project directory. `ProjectManager` exists but isn't wired to the server. WS-05 requires per-project namespacing.
   - What's unclear: Whether to use `noServer` mode with URL-based routing (`/ws/project-name`) now, or start with `server` mode for a single project and add multi-project in Plan 03-03.
   - Recommendation: Start with `server` mode and single project in Plan 03-01. Refactor to `noServer` mode in Plan 03-03 when adding multi-project support. This avoids premature complexity.

3. **50ms latency requirement feasibility**
   - What we know: The success criteria says "within 50ms". chokidar's event latency on macOS (FSEvents) is typically 1-10ms. Network WebSocket frame delivery is sub-1ms on localhost. File read for a typical .mmd file is sub-1ms.
   - What's unclear: Whether `awaitWriteFinish` would be needed (adds latency). Whether the total pipeline (chokidar event -> file read -> JSON serialize -> WS send -> client parse -> Mermaid re-render) stays under 50ms.
   - Recommendation: The 50ms target is for the server-to-browser push, not including Mermaid render time. Without `awaitWriteFinish`, the pipeline is well under 50ms. Mermaid rendering is client-side and may take 50-200ms for complex diagrams, but that's outside the WS latency scope.

4. **Where to put `ws-client.js` in static assets**
   - What we know: Current static assets are in `static/` and copied to `dist/static/` by tsup's `onSuccess`. Client-side JS files (`annotations.js`, `diagram-editor.js`) are plain JS (not TypeScript, not bundled).
   - What's unclear: Whether to inline the WS client code in `live.html` or keep it as a separate `.js` file.
   - Recommendation: Separate `ws-client.js` file, consistent with existing `annotations.js` and `diagram-editor.js` pattern. Loaded via `<script src="ws-client.js"></script>` in `live.html`.

## Sources

### Primary (HIGH confidence)
- Context7 `/websockets/ws` - WebSocket server creation, attaching to HTTP server, broadcasting, noServer mode, handleUpgrade, constructor options
- Context7 `/paulmillr/chokidar` - v4 API changes, ignored callback filter, event handling, glob removal migration, dynamic add/unwatch
- MDN Web Docs - Browser native WebSocket API (well-established, stable)

### Secondary (MEDIUM confidence)
- [ws npm](https://www.npmjs.com/package/ws) - Latest version 8.19.0, zero dependencies
- [@types/ws npm](https://www.npmjs.com/package/@types/ws) - Latest version 8.18.1, TypeScript type definitions
- [chokidar npm](https://www.npmjs.com/package/chokidar) - v5.0.0 latest, v4.0.3 stable, rewritten in TypeScript
- [chokidar releases](https://github.com/paulmillr/chokidar/releases) - v4 removed globs, v5 ESM-only
- [Vite fs.watch discussion](https://github.com/vitejs/vite/issues/12495) - Vite chose not to replace chokidar with fs.watch

### Tertiary (LOW confidence)
- [WebSocket reconnection patterns](https://oneuptime.com/blog/post/2026-01-24-websocket-reconnection-logic/view) - Exponential backoff with jitter best practices
- [JSON WebSocket convention](https://thoughtbot.com/blog/json-event-based-convention-websockets) - Event-based JSON message design

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - ws and chokidar are the undisputed standards for Node.js WebSocket servers and file watching. Verified via Context7 and npm.
- Architecture: HIGH - Attaching WS to existing HTTP server, chokidar watch with callback filter, browser native WebSocket with reconnect are all well-documented patterns with official examples.
- Pitfalls: HIGH - Atomic saves, glob removal in v4, thundering herd, path normalization are all documented issues with known solutions.

**Research date:** 2026-02-14
**Valid until:** 2026-03-14 (stable libraries, 30-day window)
