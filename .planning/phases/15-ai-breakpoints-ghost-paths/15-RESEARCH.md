# Phase 15: AI Breakpoints + Ghost Paths - Research

**Researched:** 2026-02-15
**Domain:** Annotation system extension, MCP tool authoring, SVG overlay rendering, real-time WebSocket notification
**Confidence:** HIGH

## Summary

Phase 15 adds two interconnected features to SmartB Diagrams: (1) AI breakpoints that allow developers to mark nodes where AI execution should pause, and (2) ghost paths that render discarded reasoning branches as translucent dashed edges. Both features extend existing, well-understood systems in the codebase rather than introducing new architectural layers.

The breakpoint system extends the annotation parser (`src/diagram/annotations.ts` and `static/annotations.js`) to recognize a new `%% @breakpoint NodeId` annotation type. Two new MCP tools (`check_breakpoints` and `record_ghost_path`) are added to `src/mcp/tools.ts` following the exact same pattern as the existing 5 tools. The frontend notification bar and ghost path toggle are vanilla JS DOM elements that integrate via the existing EventBus and WebSocket message flow.

**Primary recommendation:** Treat this phase as three parallel work streams: (A) annotation parsing + DiagramService backend for breakpoints, (B) MCP tool registration for `check_breakpoints()` and `record_ghost_path()`, and (C) frontend SVG rendering for breakpoint indicators, notification bar, and ghost path overlays. All three converge in app-init.js for wiring.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @modelcontextprotocol/sdk | ^1.26.0 | MCP tool registration | Already in use, v1 API with raw Zod shapes |
| zod | ^4.3.6 | Schema validation for MCP tool inputs | Already in use for all existing MCP schemas |
| ws | ^8.19.0 | WebSocket broadcast for breakpoint notifications | Already the transport layer for all real-time sync |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | ^4.0.18 | Testing breakpoint parsing, MCP tools, ghost path storage | All new backend logic needs tests |
| chokidar | ^5.0.0 | File watch triggers re-broadcast of breakpoint state | Already watching .mmd files, no changes needed |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| File-based ghost path storage (.mmd annotations) | In-memory Map per file | Ghost paths are ephemeral AI data, not user annotations -- in-memory is simpler and avoids polluting .mmd files |
| New WebSocket message type for breakpoints | Piggyback on `file:changed` | Dedicated message type (`breakpoint:hit`, `ghost:update`) is cleaner and avoids re-rendering the whole diagram |

**Installation:**
```bash
# No new packages needed -- all dependencies already installed
```

## Architecture Patterns

### Recommended Project Structure

```
src/
  diagram/
    annotations.ts      # MODIFY: add parseBreakpoints(), BREAKPOINT_REGEX
    types.ts            # MODIFY: add Breakpoint type, GhostPath type
    service.ts          # MODIFY: add getBreakpoints(), setBreakpoint(), removeBreakpoint()
  mcp/
    schemas.ts          # MODIFY: add CheckBreakpointsInput, RecordGhostPathInput
    tools.ts            # MODIFY: add check_breakpoints and record_ghost_path tools
  server/
    websocket.ts        # MODIFY: add breakpoint:hit and ghost:update WsMessage types
    routes.ts           # MODIFY: add GET /api/breakpoints/:file, POST /api/breakpoints/:file/continue
    ghost-store.ts      # NEW: in-memory ghost path store per file (Map<filePath, GhostPath[]>)
static/
  breakpoints.js        # NEW: breakpoint UI module (indicators, notification bar)
  ghost-paths.js        # NEW: ghost path rendering module (dashed edges, toggle)
  breakpoints.css       # NEW: breakpoint indicator + notification bar styles
```

### Pattern 1: Annotation Extension

**What:** Add `%% @breakpoint NodeId` as a new annotation type, parsed alongside existing `@flag` and `@status` annotations.
**When to use:** Breakpoints are user-persisted data that belongs in the .mmd file.
**Example:**

```typescript
// In src/diagram/annotations.ts -- follows exact same pattern as FLAG_REGEX/STATUS_REGEX
const BREAKPOINT_REGEX = /^%%\s*@breakpoint\s+(\S+)$/;

export function parseBreakpoints(content: string): Set<string> {
  const breakpoints = new Set<string>();
  const lines = content.split('\n');
  let inBlock = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === ANNOTATION_START) { inBlock = true; continue; }
    if (trimmed === ANNOTATION_END) { inBlock = false; continue; }
    if (!inBlock) continue;
    if (trimmed === '') continue;
    const match = BREAKPOINT_REGEX.exec(trimmed);
    if (match) {
      breakpoints.add(match[1]!);
    }
  }
  return breakpoints;
}
```

### Pattern 2: MCP Tool Registration (existing v1 API pattern)

**What:** Register two new MCP tools using the same raw Zod shape pattern as existing tools in `src/mcp/tools.ts`.
**When to use:** For `check_breakpoints` and `record_ghost_path` tools.
**Example:**

```typescript
// In src/mcp/schemas.ts -- follows exact same pattern as existing schemas
export const CheckBreakpointsInput = {
  filePath: z.string().describe('Relative path to the .mmd file'),
  currentNodeId: z.string().describe('Node ID the AI is currently processing'),
};

export const RecordGhostPathInput = {
  filePath: z.string().describe('Relative path to the .mmd file'),
  fromNodeId: z.string().describe('Source node of the discarded path'),
  toNodeId: z.string().describe('Target node of the discarded path'),
  label: z.string().optional().describe('Optional reason for discarding this path'),
};

// In src/mcp/tools.ts -- follows exact same registerTool pattern
server.registerTool(
  'check_breakpoints',
  {
    description:
      'Check if the current node has a breakpoint set. Returns "pause" if breakpoint exists, "continue" otherwise.',
    inputSchema: CheckBreakpointsInput,
  },
  async ({ filePath, currentNodeId }) => {
    const breakpoints = await service.getBreakpoints(filePath);
    const shouldPause = breakpoints.has(currentNodeId);
    return {
      content: [
        { type: 'text' as const, text: shouldPause ? 'pause' : 'continue' },
      ],
    };
  },
);
```

### Pattern 3: In-Memory Ghost Path Store

**What:** Ghost paths are ephemeral data (discarded AI reasoning branches), not persistent annotations. Store them in-memory per-file, broadcast via WebSocket.
**When to use:** Ghost paths are only meaningful during an active AI session. They don't need to survive server restarts.
**Example:**

```typescript
// src/server/ghost-store.ts
export interface GhostPath {
  fromNodeId: string;
  toNodeId: string;
  label?: string;
  timestamp: number;
}

export class GhostPathStore {
  private paths = new Map<string, GhostPath[]>();

  add(filePath: string, ghost: GhostPath): void {
    const list = this.paths.get(filePath) ?? [];
    list.push(ghost);
    this.paths.set(filePath, list);
  }

  get(filePath: string): GhostPath[] {
    return this.paths.get(filePath) ?? [];
  }

  clear(filePath: string): void {
    this.paths.delete(filePath);
  }
}
```

### Pattern 4: SVG Overlay Rendering for Breakpoint Indicators

**What:** After the custom SVG is rendered, a post-processing step adds a red circle indicator to breakpointed nodes, following the same pattern as `applyFlagsToSVG()` in `annotations.js`.
**When to use:** After `diagram:rendered` event, read breakpoint data and append SVG elements.
**Example:**

```javascript
// In static/breakpoints.js -- follows same pattern as annotations.js addBadge()
function applyBreakpointIndicators() {
    var svg = DiagramDOM.getSVG();
    if (!svg) return;
    // Remove existing breakpoint indicators
    svg.querySelectorAll('.breakpoint-indicator').forEach(function(el) {
        el.remove();
    });

    for (var nodeId of state.breakpoints) {
        var nodeEl = DiagramDOM.findNodeElement(nodeId);
        if (!nodeEl) continue;
        var bbox = nodeEl.getBBox ? nodeEl.getBBox() : null;
        if (!bbox) continue;

        var ns = 'http://www.w3.org/2000/svg';
        var circle = document.createElementNS(ns, 'circle');
        circle.setAttribute('class', 'breakpoint-indicator');
        circle.setAttribute('cx', bbox.x - 4);
        circle.setAttribute('cy', bbox.y + bbox.height / 2);
        circle.setAttribute('r', '6');
        circle.setAttribute('fill', '#ef4444');
        svg.appendChild(circle);
    }
}
```

### Pattern 5: Ghost Path Rendering as Dashed Edges

**What:** Ghost paths render as SVG path elements with stroke-dasharray and 30% opacity, using the existing edge rendering logic from svg-renderer.js as reference.
**When to use:** After receiving ghost:update WebSocket messages, overlay ghost edges on the existing SVG.
**Example:**

```javascript
// In static/ghost-paths.js
function renderGhostPaths(ghostPaths) {
    var svg = DiagramDOM.getSVG();
    if (!svg) return;
    // Remove existing ghost edges
    svg.querySelectorAll('.ghost-path').forEach(function(el) {
        el.remove();
    });
    if (!state.visible) return;

    var diagramGroup = svg.querySelector('.smartb-diagram');
    if (!diagramGroup) return;

    // Ghost paths are rendered above subgraphs but below real edges
    var firstEdge = diagramGroup.querySelector('.smartb-edge');

    for (var i = 0; i < ghostPaths.length; i++) {
        var gp = ghostPaths[i];
        var fromEl = DiagramDOM.findNodeElement(gp.fromNodeId);
        var toEl = DiagramDOM.findNodeElement(gp.toNodeId);
        if (!fromEl || !toEl) continue;

        // Simple straight line between node centers
        var fromBBox = fromEl.getBBox();
        var toBBox = toEl.getBBox();
        var g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('class', 'ghost-path');
        g.setAttribute('opacity', '0.3');

        var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        var d = 'M ' + (fromBBox.x + fromBBox.width / 2) + ' '
              + (fromBBox.y + fromBBox.height / 2)
              + ' L ' + (toBBox.x + toBBox.width / 2) + ' '
              + (toBBox.y + toBBox.height / 2);
        path.setAttribute('d', d);
        path.setAttribute('stroke-dasharray', '8,4');
        path.setAttribute('stroke', '#9ca3af');
        path.setAttribute('stroke-width', '1.5');
        path.setAttribute('fill', 'none');
        path.setAttribute('marker-end', 'url(#arrow-normal)');

        g.appendChild(path);
        if (firstEdge) {
            diagramGroup.insertBefore(g, firstEdge);
        } else {
            diagramGroup.appendChild(g);
        }
    }
}
```

### Pattern 6: WebSocket Notification Bar

**What:** A fixed notification bar that appears when a breakpoint is hit, with [Continue] and [Remove] buttons. Follows toast pattern from app-init.js.
**When to use:** When breakpoint:hit WebSocket message is received.
**Example:**

```javascript
// Browser receives breakpoint:hit WS message
// Shows notification bar in #preview-container (above zoom controls)
function showBreakpointNotification(nodeId) {
    var existing = document.getElementById('breakpointNotification');
    if (existing) existing.remove();

    var bar = document.createElement('div');
    bar.id = 'breakpointNotification';
    bar.className = 'breakpoint-notification';
    // Build with DOM methods for XSS safety
    var text = document.createElement('span');
    text.textContent = 'Breakpoint hit on Node ' + nodeId + '.';
    bar.appendChild(text);

    var btnContinue = document.createElement('button');
    btnContinue.textContent = 'Continue';
    btnContinue.className = 'btn-breakpoint-action';
    btnContinue.onclick = function() { continueBreakpoint(nodeId); };
    bar.appendChild(btnContinue);

    var btnRemove = document.createElement('button');
    btnRemove.textContent = 'Remove';
    btnRemove.className = 'btn-breakpoint-action';
    btnRemove.onclick = function() { removeBreakpoint(nodeId); };
    bar.appendChild(btnRemove);

    document.getElementById('preview-container').prepend(bar);
}
```

### Anti-Patterns to Avoid

- **Storing ghost paths in .mmd files:** Ghost paths are ephemeral AI data. Putting them in annotation blocks would pollute the source file, create merge conflicts, and slow down file parsing. Use an in-memory store.
- **Polling for breakpoint state:** The MCP tool `check_breakpoints()` already reads from the file system on each call. No polling needed. The AI calls it when it reaches a node.
- **Blocking MCP tool execution:** The `check_breakpoints()` tool should return immediately with "pause" or "continue". The actual pause happens on the AI side (the AI decides whether to continue based on the response). The server does not hold connections open.
- **Separate WebSocket connections for breakpoints:** Reuse the existing ws://localhost:PORT/ws connection. Add new message types to the existing WsMessage union type.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Annotation parsing | New parser architecture | Extend existing `annotations.ts` with one more regex | Consistency with @flag and @status patterns, battle-tested parsing logic |
| SVG overlay indicators | Custom rendering pipeline | Post-process DOM after `diagram:rendered` event | Same proven pattern used by annotations.js `applyFlagsToSVG()` |
| MCP schema validation | Custom validation layer | Zod schemas + MCP SDK `registerTool` | All 5 existing tools use this exact pattern |
| Real-time notifications | HTTP polling, SSE | WebSocket broadcast (existing `wsManager.broadcast()`) | Already established as the real-time channel for all UI updates |

**Key insight:** Phase 15 is overwhelmingly an extension of existing patterns, not new architecture. Every subsystem it touches already exists and has a clear extension point.

## Common Pitfalls

### Pitfall 1: MCP Tool Cannot Access WebSocket Manager

**What goes wrong:** The MCP tools are registered in `src/mcp/tools.ts` which receives only `DiagramService`. Broadcasting a `breakpoint:hit` WebSocket message requires access to `WebSocketManager`, which lives in the HTTP server layer.
**Why it happens:** The MCP server and HTTP server are separate processes. In `--serve` mode they share a `DiagramService`, but the MCP tools don't have a reference to `wsManager`.
**How to avoid:** Two options:
  1. **Event emitter on DiagramService**: Add an `EventEmitter` to `DiagramService` that emits `breakpoint:hit` events. The HTTP server layer subscribes and broadcasts via WebSocket. Clean separation of concerns.
  2. **Pass wsManager to registerTools**: Modify the `registerTools()` signature to accept an optional `WebSocketManager`. When running in `--serve` mode, the MCP server passes it through.
**Warning signs:** If the `check_breakpoints` tool can return "pause" but the browser never shows a notification, the WebSocket bridge is missing.
**Recommendation:** Option 1 (event emitter) is cleaner. DiagramService already has a clear API surface; adding events keeps the MCP layer decoupled from transport.

### Pitfall 2: Breakpoint Annotation Injection Must Preserve Flags and Statuses

**What goes wrong:** When adding/removing a `@breakpoint` annotation, the `injectAnnotations()` function must now handle three annotation types (flags, statuses, breakpoints) instead of two. If breakpoints are forgotten during re-injection, they disappear.
**Why it happens:** Current `injectAnnotations()` only knows about flags and statuses.
**How to avoid:** Extend `injectAnnotations()` signature to accept a `breakpoints: Set<string>` parameter (optional, defaults to empty). Emit breakpoint lines after status lines.
**Warning signs:** Setting a breakpoint via the browser works, but it disappears after the next file save or flag edit.

### Pitfall 3: Ghost Path Rendering After SVG Re-render

**What goes wrong:** When the diagram re-renders (file change, graph:update), the SVG DOM is completely replaced. Ghost path overlays are lost.
**Why it happens:** `custom-renderer.js` does `preview.textContent = ''` before inserting the new SVG.
**How to avoid:** Listen to `diagram:rendered` event and re-apply ghost paths, same pattern as `selection.js` re-applying selection indicators and `annotations.js` re-applying flag badges. Keep ghost path data in module state (JavaScript), not in the DOM.
**Warning signs:** Ghost paths briefly appear then vanish on the next file save.

### Pitfall 4: Breakpoint Notification Bar Blocking Canvas Interactions

**What goes wrong:** The notification bar appears inside `#preview-container` and intercepts click events, preventing node selection, panning, etc.
**Why it happens:** The notification bar is a fixed-position element that overlaps the SVG.
**How to avoid:** Position the notification bar outside the SVG interaction area (e.g., fixed top of preview, pointer-events: auto only on the bar itself). Add pointer-events: none to the bar container and pointer-events: auto to buttons only.
**Warning signs:** Users can't click nodes while a breakpoint notification is showing.

### Pitfall 5: Ghost Path Edge Routing Without Layout Data

**What goes wrong:** Ghost paths need to draw edges between nodes that may not have a direct edge in the dagre layout. Without proper routing, straight lines cross through other nodes.
**Why it happens:** Dagre only routes edges that are part of the graph model. Ghost paths are not part of the model.
**How to avoid:** For ghost paths, use simple straight-line connections between node center points (with boundary clamping from `shortenPathToNodeBoundary()` in svg-renderer.js). At 30% opacity, minor overlap is acceptable and preferable to complex routing. This matches the visual metaphor of "discarded/ghost" paths being less precise.
**Warning signs:** Ghost paths look strange because they're trying to route through dagre but ghost edges aren't in the layout.

### Pitfall 6: Frontend Module Initialization Order

**What goes wrong:** `breakpoints.js` and `ghost-paths.js` depend on `diagram-dom.js`, `event-bus.js`, `svg-renderer.js`, and `annotations.js` being loaded first. Incorrect script order in `live.html` causes ReferenceError.
**Why it happens:** All modules are vanilla JS IIFEs loaded via script tags with order dependency.
**How to avoid:** Insert new script tags after `custom-renderer.js` but before `app-init.js` in `live.html`.
**Warning signs:** Console shows "SmartBBreakpoints is not defined" or "SmartBGhostPaths is not defined".

## Code Examples

### Extending DiagramService with Breakpoint Methods

```typescript
// src/diagram/service.ts -- add methods following setFlag/removeFlag pattern

async getBreakpoints(filePath: string): Promise<Set<string>> {
  const resolved = this.resolvePath(filePath);
  const raw = await readFile(resolved, 'utf-8');
  return parseBreakpoints(raw);
}

async setBreakpoint(filePath: string, nodeId: string): Promise<void> {
  return this.withWriteLock(filePath, async () => {
    const resolved = this.resolvePath(filePath);
    const raw = await readFile(resolved, 'utf-8');
    const flags = parseFlags(raw);
    const statuses = parseStatuses(raw);
    const breakpoints = parseBreakpoints(raw);
    breakpoints.add(nodeId);
    const { mermaidContent } = parseDiagramContent(raw);
    await this.writeDiagram(filePath, mermaidContent, flags, statuses, breakpoints);
  });
}

async removeBreakpoint(filePath: string, nodeId: string): Promise<void> {
  return this.withWriteLock(filePath, async () => {
    const resolved = this.resolvePath(filePath);
    const raw = await readFile(resolved, 'utf-8');
    const flags = parseFlags(raw);
    const statuses = parseStatuses(raw);
    const breakpoints = parseBreakpoints(raw);
    breakpoints.delete(nodeId);
    const { mermaidContent } = parseDiagramContent(raw);
    await this.writeDiagram(filePath, mermaidContent, flags, statuses, breakpoints);
  });
}
```

### Extended injectAnnotations with Breakpoints

```typescript
// src/diagram/annotations.ts -- extend injectAnnotations signature
export function injectAnnotations(
  content: string,
  flags: Map<string, Flag>,
  statuses?: Map<string, NodeStatus>,
  breakpoints?: Set<string>,
): string {
  const clean = stripAnnotations(content);
  const hasFlags = flags.size > 0;
  const hasStatuses = statuses !== undefined && statuses.size > 0;
  const hasBreakpoints = breakpoints !== undefined && breakpoints.size > 0;

  if (!hasFlags && !hasStatuses && !hasBreakpoints) return clean;

  const lines: string[] = ['', ANNOTATION_START];
  for (const [nodeId, flag] of flags) {
    const escapedMessage = flag.message.replace(/"/g, "''");
    lines.push(`%% @flag ${nodeId} "${escapedMessage}"`);
  }
  if (hasStatuses) {
    for (const [nodeId, status] of statuses!) {
      lines.push(`%% @status ${nodeId} ${status}`);
    }
  }
  if (hasBreakpoints) {
    for (const nodeId of breakpoints!) {
      lines.push(`%% @breakpoint ${nodeId}`);
    }
  }
  lines.push(ANNOTATION_END);
  lines.push('');
  return clean.trimEnd() + '\n' + lines.join('\n');
}
```

### New WebSocket Message Types

```typescript
// src/server/websocket.ts -- extend WsMessage union type
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
  | { type: 'ghost:update'; file: string; ghostPaths: GhostPathPayload[] };

interface GhostPathPayload {
  fromNodeId: string;
  toNodeId: string;
  label?: string;
}
```

### REST Endpoints for Browser-Server Breakpoint Communication

```typescript
// POST /api/breakpoints/:file/continue
// Browser signals "continue past breakpoint" after user clicks [Continue]
routes.push({
  method: 'POST',
  pattern: new RegExp('^/api/breakpoints/(?<file>.+)/continue$'),
  handler: async (req, res, params) => {
    const file = decodeURIComponent(params['file']!);
    const body = await readJsonBody<{ nodeId: string }>(req);
    // Store continue signal; next check_breakpoints() call returns "continue"
    breakpointContinueSignals.set(`${file}:${body.nodeId}`, true);
    sendJson(res, { ok: true });
  },
});
```

### Ghost Path Toggle Button in Topbar

```html
<!-- In live.html topbar, after the Flags button -->
<button class="btn" id="btnGhostPaths" onclick="SmartBGhostPaths.toggle()">
  Ghost <span class="ghost-count-badge" id="ghostCountBadge" data-count="0"></span>
</button>
```

### DiagramService writeDiagram Signature Extension

```typescript
// Current signature:
async writeDiagram(
  filePath: string,
  content: string,
  flags?: Map<string, Flag>,
  statuses?: Map<string, NodeStatus>,
): Promise<void>

// Extended signature:
async writeDiagram(
  filePath: string,
  content: string,
  flags?: Map<string, Flag>,
  statuses?: Map<string, NodeStatus>,
  breakpoints?: Set<string>,
): Promise<void>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| MCP SDK v1 `server.tool()` | v2 `server.registerTool()` | SDK v2 migration | Project uses registerTool already (v1.26.0) with raw shapes; this pattern is stable |
| MCP SDK raw Zod shapes | v2 requires `z.object()` wrapping | SDK v2 | Project is on v1 API -- raw shapes work. No need to change unless upgrading SDK |
| Zod v3 | Zod v4 (^4.3.6) | 2025 | Project already on Zod v4 -- no migration needed |

**Deprecated/outdated:**
- None relevant. The existing MCP SDK v1.26.0 and Zod v4 combination is current and stable.

## Open Questions

1. **How should the AI know when to resume after a breakpoint?**
   - What we know: `check_breakpoints()` returns "pause" to the AI. The browser shows a notification bar with [Continue].
   - What's unclear: The communication flow from browser [Continue] click back to the AI is not fully defined. The MCP protocol is AI-initiated (AI calls tools). The AI cannot "block" waiting for browser input.
   - Recommendation: Use a "cooperative pause" pattern. When the user clicks [Continue], the browser sends a POST to `/api/breakpoints/:file/continue` which sets a server-side flag. The next time the AI calls `check_breakpoints()` for that node, it returns "continue" instead of "pause" (one-time signal). The AI must respect the pause signal by not proceeding until check returns "continue". This requires the AI to poll, but that is the natural MCP flow.

2. **Should the ghost path toggle persist across page reloads?**
   - What we know: Ghost paths are in-memory on the server. Toggle state is in the browser.
   - What's unclear: Whether users expect the toggle state to persist (localStorage) or default to hidden.
   - Recommendation: Default to hidden. Store toggle state in `localStorage` under key `smartb-ghost-paths-visible`. Same pattern as editor/sidebar visibility.

3. **Should breakpoints integrate with the interaction state FSM?**
   - What we know: The FSM manages states like idle, selected, editing, flagging.
   - What's unclear: Whether setting a breakpoint (right-click menu action or keyboard shortcut) needs its own FSM state.
   - Recommendation: No dedicated FSM state. Breakpoint toggling is a quick action (like flagging from the context menu), not a persistent mode. Add "Toggle Breakpoint" as a context menu action that works from the `selected` or `context-menu` state.

4. **MCP tool access to WebSocket manager for broadcasting**
   - What we know: Currently `registerTools()` only receives `DiagramService`. WebSocket manager is in the server layer.
   - What's unclear: Best way to bridge the two.
   - Recommendation: Add an EventEmitter to DiagramService (or a separate BreakpointService) that emits `breakpoint:hit` events. The HTTP server subscribes and broadcasts via WebSocket. This keeps MCP tools decoupled from transport. Alternatively, since `startMcpServer()` already creates both MCP server and HTTP server in `--serve` mode, pass `wsManager` as optional param to `registerTools()`.

5. **How should the frontend parse breakpoints from incoming file content?**
   - What we know: The frontend `annotations.js` already parses `@flag` and `@status` lines from file content. It runs `parseAnnotations()` on every incoming WebSocket `file:changed` message.
   - What's unclear: Whether breakpoint parsing should go into annotations.js or the new breakpoints.js module.
   - Recommendation: Add breakpoint parsing to the existing `parseAnnotations()` function in `annotations.js` (it already handles the annotation block parsing loop). Return breakpoints as an additional field. The new `breakpoints.js` module consumes this data but delegates parsing to annotations.js.

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `src/mcp/tools.ts`, `src/mcp/schemas.ts`, `src/mcp/server.ts` -- current MCP tool registration pattern
- Codebase analysis: `src/diagram/annotations.ts` -- annotation parsing pattern (flags, statuses)
- Codebase analysis: `static/annotations.js` -- frontend annotation rendering and SVG post-processing
- Codebase analysis: `static/svg-renderer.js` -- SVG edge rendering with edgePointsToPath()
- Codebase analysis: `static/custom-renderer.js` -- custom renderer pipeline and applyStatusColors()
- Codebase analysis: `src/server/websocket.ts` -- WebSocket message types and broadcast pattern
- Codebase analysis: `static/app-init.js` -- WebSocket message handling and module initialization
- Context7: `/modelcontextprotocol/typescript-sdk` -- MCP SDK registerTool API (v1 raw shapes, v2 z.object wrapping)

### Secondary (MEDIUM confidence)
- Codebase analysis: `static/selection.js` -- SVG overlay re-application after re-render pattern
- Codebase analysis: `static/interaction-state.js` -- FSM state machine pattern for UI mode coordination
- Codebase analysis: `test/mcp/tools.test.ts` -- MCP tool testing pattern via DiagramService

### Tertiary (LOW confidence)
- None. All findings are from direct codebase analysis and verified SDK documentation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new dependencies, all patterns already established in codebase
- Architecture: HIGH - every subsystem being extended already exists with clear extension points
- Pitfalls: HIGH - identified from direct code analysis of existing modules and their interaction patterns
- MCP tool authoring: HIGH - verified against existing 5 tools and Context7 SDK documentation

**Research date:** 2026-02-15
**Valid until:** 2026-03-15 (stable -- no fast-moving dependencies)
