# Architecture Patterns: v2.1 Integration Analysis

**Domain:** Bug fixes and stability improvements across backend, frontend, and MCP layers
**Researched:** 2026-02-19
**Confidence:** HIGH -- based on direct codebase analysis of every file in the change surface
**Previous:** v2.0 architecture research (2026-02-15) covered the full custom renderer pipeline. This v2.1 research covers ONLY the changes needed for bug fixes within the existing architecture.

---

## Table of Contents

1. [Current Architecture Snapshot](#current-architecture-snapshot)
2. [Integration Challenges Overview](#integration-challenges-overview)
3. [Component Modification Map](#component-modification-map)
4. [Fix 1: @ghost Annotation System](#fix-1-ghost-annotation-system)
5. [Fix 2: update_diagram Preserves Annotations](#fix-2-update_diagram-preserves-annotations)
6. [Fix 3: /save Through DiagramService](#fix-3-save-through-diagramservice)
7. [Fix 4: Auto-Tracking for Heatmap](#fix-4-auto-tracking-for-heatmap)
8. [Fix 5: Project-Scoped Ghost Path Broadcast](#fix-5-project-scoped-ghost-path-broadcast)
9. [CSS Splitting](#css-splitting)
10. [Coupling Risk Matrix](#coupling-risk-matrix)
11. [Safe Integration Order](#safe-integration-order)
12. [Data Flow Diagrams](#data-flow-diagrams)
13. [Patterns to Follow](#patterns-to-follow)
14. [Anti-Patterns to Avoid](#anti-patterns-to-avoid)
15. [Scalability Considerations](#scalability-considerations)
16. [Test Strategy](#test-strategy)

---

## Current Architecture Snapshot

The v2.1 milestone does NOT change the system architecture. All fixes operate within the existing component boundaries.

```
                    SINGLE NODE.JS PROCESS
  +-----------------------------------------------------------+
  |                                                           |
  |  MCP Server    HTTP Server (3333)    FileWatcher          |
  |  (stdio)       (node:http)          (fs.watch recursive)  |
  |      |              |                    |                |
  |      +------+-------+----+--------------+                |
  |             |            |                                |
  |      DiagramService   WebSocketManager                    |
  |      (read/write .mmd)  (ws, namespaces)                 |
  |      (write locks)      (broadcast per project)          |
  |             |            |                                |
  |      GhostPathStore   SessionStore                        |
  |      (in-memory cache)  (.smartb/sessions/)              |
  |                                                           |
  +-----------------------------------------------------------+
                |            |
     .mmd files on disk    WS broadcast
     (annotations block)     |
              +--------------+--------------+
              |                             |
        Browser (live.html)          VS Code Extension
        - 30+ vanilla JS modules     - WebView panel
        - window.* globals           - WS connection
        - SmartBEventBus             - diagram rendering
```

### Key Architectural Invariants

1. **Single source of truth:** .mmd files on disk. All state persists as `%% @annotation` lines.
2. **Write lock serialization:** DiagramService.withWriteLock() serializes writes per file path.
3. **Annotation block format:** Between `ANNOTATION_START` and `ANNOTATION_END` markers.
4. **Dual parsing:** Backend (annotations.ts) and frontend (annotations.js) parse identically.
5. **modifyAnnotation pattern:** Read-all -> mutate -> write-all, always under write lock.
6. **Event flow:** File change -> FileWatcher -> WS broadcast -> Browser updates.

### The Exception: Ghost Paths

Ghost paths currently violate invariant #1. They exist only in:
- `GhostPathStore` (in-memory Map, server/ghost-store.ts)
- REST API (ghost-path-routes.ts)
- WebSocket broadcast (broadcastAll -- bug: not project-scoped)
- Frontend state (ghost-paths.js, ghostPathsByFile object)

They are **not** persisted to .mmd files. This is the fundamental design issue v2.1 must fix.

---

## Integration Challenges Overview

| # | Challenge | Risk | Files Touched | Complexity |
|---|-----------|------|---------------|------------|
| 1 | Add @ghost annotation type | HIGH | 8+ files, backend+frontend sync | Medium |
| 2 | update_diagram preserves flags/breakpoints | HIGH | 2 files, behavior change | Low |
| 3 | Route /save through DiagramService | MEDIUM | 2 files, flow change | Low |
| 4 | Auto-tracking for heatmap | MEDIUM | 3+ frontend files | Medium |
| 5 | Project-scoped ghost broadcast | LOW | 3 files, parameter threading | Low |

---

## Component Modification Map

### Per-Fix File Impact

#### Fix 1: @ghost Annotation System (8 files)

| File | Change Type | What Changes |
|------|-------------|--------------|
| `src/diagram/annotations.ts` | **MODIFY** | Add GHOST_REGEX, parse @ghost in parseAllAnnotations, serialize in injectAnnotations |
| `static/annotations.js` | **MODIFY** | Mirror: add GHOST_REGEX, parse @ghost, serialize @ghost |
| `src/diagram/service.ts` | **MODIFY** | Add ghost path methods (getGhosts, setGhost, removeGhost) via modifyAnnotation pattern |
| `src/mcp/tools.ts` | **MODIFY** | update_diagram: persist ghostPaths as @ghost annotations instead of GhostPathStore |
| `src/mcp/tools.ts` | **MODIFY** | get_diagram_context: include ghost paths from annotations |
| `src/server/ghost-path-routes.ts` | **MODIFY** | Read/write via DiagramService instead of GhostPathStore |
| `static/ghost-paths.js` | **MODIFY** | Load ghost paths from annotations (editor content), not just REST/WS |
| `src/diagram/types.ts` | **NO CHANGE** | GhostPath type already exists |

#### Fix 2: update_diagram Preserves Annotations (2 files)

| File | Change Type | What Changes |
|------|-------------|--------------|
| `src/diagram/service.ts` | **MODIFY** | Add updateDiagramPreservingAnnotations method |
| `src/mcp/tools.ts` | **MODIFY** | Use new method instead of writeDiagram |
| `test/mcp/tool-handlers.test.ts` | **MODIFY** | Add test: update_diagram on flagged file preserves flags |

#### Fix 3: /save Through DiagramService (2 files)

| File | Change Type | What Changes |
|------|-------------|--------------|
| `src/diagram/service.ts` | **MODIFY** | Add writeRaw method (write under lock without annotation processing) |
| `src/server/file-routes.ts` | **MODIFY** | POST /save calls service.writeRaw() instead of raw writeFile() |

#### Fix 4: Auto-Tracking for Heatmap (4 files)

| File | Change Type | What Changes |
|------|-------------|--------------|
| `static/interaction-tracker.js` | **NEW** | Passive tracking IIFE module (accumulate + flush counts) |
| `static/app-init.js` | **MODIFY** | Init SmartBTracker module |
| `src/server/session-routes.ts` | **MODIFY** | Accept browser-originated heatmap increments |
| `static/live.html` | **MODIFY** | Add script tag for interaction-tracker.js |

#### Fix 5: Project-Scoped Ghost Broadcast (3 files)

| File | Change Type | What Changes |
|------|-------------|--------------|
| `src/server/ghost-path-routes.ts` | **MODIFY** | Change broadcastAll() to broadcast('default', ...) |
| `src/mcp/tools.ts` | **MODIFY** | Change broadcastAll() to broadcast('default', ...) for ghost:update |
| `src/mcp/session-tools.ts` | **MODIFY** | Same change for session-related broadcasts |

---

## Fix 1: @ghost Annotation System

### Current State

```
GhostPathStore (in-memory)
     |
  add(file, ghost) --- REST POST /api/ghost-paths/:file
     |                          |
  get(file) ---------- REST GET /api/ghost-paths/:file
     |
  broadcastAll() ----- WS ghost:update ----- Frontend updates ghostPathsByFile
```

Ghost paths are lost on server restart. They exist in a parallel universe from the annotation system.

### Target State

```
.mmd file
  %% @ghost fromNodeId toNodeId "optional label"
     |
  parseAllAnnotations() --- reads ghost paths alongside flags/statuses/etc.
     |
  injectAnnotations() ---- serializes ghost paths back to @ghost lines
     |
  DiagramService.modifyAnnotation() --- atomic read-modify-write under lock
     |
  FileWatcher ---- WS file:changed ---- Frontend parses annotations (including ghosts)
```

### Annotation Format

```
Existing:
  %% @flag nodeId "message"                    -> Map<string, Flag>
  %% @status nodeId ok|problem|in-progress|discarded  -> Map<string, NodeStatus>
  %% @breakpoint nodeId                        -> Set<string>
  %% @risk nodeId high|medium|low "reason"     -> Map<string, RiskAnnotation>

New:
  %% @ghost fromNodeId toNodeId "label"        -> Map<string, GhostAnnotation>
```

### Implementation Details

**Backend: annotations.ts**

Add regex (after RISK_REGEX at line 9):

```typescript
export const GHOST_REGEX = /^%%\s*@ghost\s+(\S+)\s+(\S+)(?:\s+"([^"]*)")?$/;
```

New type (add to types.ts or annotations.ts):

```typescript
export interface GhostAnnotation {
  fromNodeId: string;
  toNodeId: string;
  label?: string;
}
```

Update AllAnnotations interface:

```typescript
export interface AllAnnotations {
  flags: Map<string, Flag>;
  statuses: Map<string, NodeStatus>;
  breakpoints: Set<string>;
  risks: Map<string, RiskAnnotation>;
  ghosts: Map<string, GhostAnnotation>;  // keyed by "from->to"
}
```

Map keyed by `${from}->${to}` because: unlike flags (per-node), ghost paths are per-edge. The frontend's dedupPaths() in ghost-paths.js already deduplicates by from->to key. Using a Map gives natural deduplication.

Add parsing in parseAllAnnotations() (after risk matching block):

```typescript
match = GHOST_REGEX.exec(trimmed);
if (match) {
  const key = `${match[1]!}->${match[2]!}`;
  ghosts.set(key, { fromNodeId: match[1]!, toNodeId: match[2]!, label: match[3] });
  continue;
}
```

Update injectAnnotations signature and body:

```typescript
export function injectAnnotations(
  content: string,
  flags: Map<string, Flag>,
  statuses?: Map<string, NodeStatus>,
  breakpoints?: Set<string>,
  risks?: Map<string, RiskAnnotation>,
  ghosts?: Map<string, GhostAnnotation>,  // NEW parameter
): string {
  // ... existing code ...
  const hasGhosts = ghosts !== undefined && ghosts.size > 0;
  // ... existing checks updated to include hasGhosts ...

  // Serialize ghosts (after risks block):
  if (hasGhosts) {
    for (const [, ghost] of ghosts!) {
      const labelPart = ghost.label
        ? ` "${ghost.label.replace(/"/g, "''")}"` : '';
      lines.push(`%% @ghost ${ghost.fromNodeId} ${ghost.toNodeId}${labelPart}`);
    }
  }
}
```

**Frontend: annotations.js -- MUST MIRROR EXACTLY**

This is the highest-risk coupling point. The regex, parsing logic, and serialization format must be byte-identical between backend and frontend.

Add GHOST_REGEX (line 14):
```javascript
var GHOST_REGEX = /^%%\s*@ghost\s+(\S+)\s+(\S+)(?:\s+"([^"]*)")?$/;
```

Add to state (line 24):
```javascript
ghosts: new Map(),  // key: "from->to", value: { fromNodeId, toNodeId, label }
```

Add in parseAnnotations() (after risk matching):
```javascript
var gm = trimmed.match(GHOST_REGEX);
if (gm) { ghosts.set(gm[1] + '->' + gm[2], { fromNodeId: gm[1], toNodeId: gm[2], label: gm[3] || '' }); continue; }
```

Add in injectAnnotations() serialization (after risks block):
```javascript
state.ghosts.forEach(function(val) {
    var labelPart = val.label ? ' "' + val.label.replace(/"/g, "''") + '"' : '';
    lines.push('%% @ghost ' + val.fromNodeId + ' ' + val.toNodeId + labelPart);
});
```

**DiagramService: service.ts**

Add ghost CRUD methods following modifyAnnotation pattern:

```typescript
async getGhosts(filePath: string): Promise<Map<string, GhostAnnotation>> {
  const resolved = this.resolvePath(filePath);
  const raw = await readFile(resolved, 'utf-8');
  return parseAllAnnotations(raw).ghosts;
}

async setGhost(filePath: string, fromNodeId: string, toNodeId: string, label?: string): Promise<void> {
  return this.modifyAnnotation(filePath, (data) => {
    const key = `${fromNodeId}->${toNodeId}`;
    data.ghosts.set(key, { fromNodeId, toNodeId, label });
  });
}

async removeGhost(filePath: string, fromNodeId: string, toNodeId: string): Promise<void> {
  return this.modifyAnnotation(filePath, (data) => {
    data.ghosts.delete(`${fromNodeId}->${toNodeId}`);
  });
}

async clearGhosts(filePath: string): Promise<void> {
  return this.modifyAnnotation(filePath, (data) => {
    data.ghosts.clear();
  });
}
```

Update `AnnotationData` interface (line 13-20) to include `ghosts: Map<string, GhostAnnotation>`.
Update `readAllAnnotations` (line 53-59) to read ghosts.
Update `_writeDiagramInternal` (line 128-145) to accept and pass ghosts.
Update `modifyAnnotation` (line 66-77) to pass data.ghosts.

### Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Backend/frontend regex drift | CRITICAL | Extract test fixtures that both must parse identically |
| injectAnnotations signature change breaks callers | HIGH | Update all callers atomically in one commit |
| GhostPathStore removal breaks REST API | MEDIUM | Migrate routes to use DiagramService, keep REST interface identical |
| Ghost paths accumulate without cleanup | LOW | Cap at 100 ghost annotations per file |

---

## Fix 2: update_diagram Preserves Annotations

### Current Behavior (Bug)

```typescript
// tools.ts line 80 -- the critical bug
await service.writeDiagram(filePath, content, undefined, statusMap, undefined, riskMap);
```

`flags: undefined` becomes `new Map()` in injectAnnotations. All existing flags are lost.
`breakpoints: undefined` means existing breakpoints are lost.
This is a silent data-destroying bug.

### Fix: Atomic Read-Merge-Write

The fix MUST be atomic -- read and write under the same lock to avoid TOCTOU races. If we read outside the lock and write inside, another operation could modify the file between our read and write.

**New method on DiagramService:**

```typescript
async updateDiagramPreservingAnnotations(
  filePath: string,
  content: string,
  newStatuses?: Map<string, NodeStatus>,
  newRisks?: Map<string, RiskAnnotation>,
  newGhosts?: Map<string, GhostAnnotation>,
): Promise<void> {
  return this.withWriteLock(filePath, async () => {
    // Read existing annotations (ignore errors for new files)
    let existingFlags = new Map<string, Flag>();
    let existingBreakpoints = new Set<string>();
    let existingGhosts = new Map<string, GhostAnnotation>();
    try {
      const data = await this.readAllAnnotations(filePath);
      existingFlags = data.flags;
      existingBreakpoints = data.breakpoints;
      existingGhosts = data.ghosts;
    } catch { /* new file, no existing annotations */ }

    // Merge: new overrides by key, existing preserved
    const mergedGhosts = new Map([...existingGhosts, ...(newGhosts ?? new Map())]);

    await this._writeDiagramInternal(
      filePath, content,
      existingFlags,       // PRESERVED from file
      newStatuses,          // MCP OVERRIDES
      existingBreakpoints,  // PRESERVED from file
      newRisks,             // MCP OVERRIDES
      mergedGhosts,         // MERGED: existing + new
    );
  });
}
```

**Update tools.ts to use new method:**

```typescript
// Replace line 80:
await service.updateDiagramPreservingAnnotations(
  filePath, content, statusMap, riskMap, ghostMap,
);
```

### Why readAllAnnotations Must Stay Private

`readAllAnnotations` is private because it returns raw internal data. The new `updateDiagramPreservingAnnotations` lives on DiagramService itself, accessing the private method directly. No visibility change needed.

### Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| TOCTOU race without atomic read-write | HIGH | Fixed: uses withWriteLock |
| Nested lock deadlock | HIGH | Uses _writeDiagramInternal (no lock) inside locked context |
| Statuses/risks from MCP overwriting old | MEDIUM | By design: MCP is authoritative for statuses/risks |

---

## Fix 3: /save Through DiagramService

### Current Behavior (Bug)

```typescript
// file-routes.ts lines 49-51 -- bypasses write lock
const resolved = resolveProjectPath(projectDir, body.filename);
await mkdir(path.dirname(resolved), { recursive: true });
await writeFile(resolved, body.content, 'utf-8');
```

If the browser saves while MCP update_diagram is writing, both writes hit the filesystem without coordination. Data loss.

### Fix: writeRaw Method

The browser sends FULL content including annotations. We cannot route through `writeDiagram` because it would strip and re-inject annotations (destroying the exact user content). We need a raw write under the lock.

```typescript
// New method on DiagramService:
async writeRaw(filePath: string, content: string): Promise<void> {
  return this.withWriteLock(filePath, async () => {
    const resolved = this.resolvePath(filePath);
    await mkdir(dirname(resolved), { recursive: true });
    await writeFile(resolved, content, 'utf-8');
  });
}
```

Then in file-routes.ts:

```typescript
// Replace lines 49-51 with:
await service.writeRaw(body.filename, body.content);
```

Write lock serialization without annotation processing. The browser is the authority on content when saving via /save.

---

## Fix 4: Auto-Tracking for Heatmap

### Current State

Heatmap only gets data when MCP sessions are explicitly started/recorded/ended. Browser interactions generate zero heatmap data. The heatmap is always empty for typical users.

### New Module: `static/interaction-tracker.js`

Separate from `heatmap.js` (which handles visualization). The tracker handles data collection.

```
Browser (interaction-tracker.js)
  |
  | Passive listeners on #preview container:
  |   - click on .node/.smartb-node -> increment count
  |   - pointerenter + 500ms dwell -> increment count
  |
  | Accumulates counts in local Map: { nodeId: number }
  |
  | Every 30 seconds (or on file switch):
  v
POST /api/heatmap/:file/increment  { counts: { nodeId: count, ... } }
  |
  v
Server: sessionStore.mergeHeatmapCounts(file, counts)
  |
  v
Write to .smartb/heatmap.json
  |
  v
broadcast('default', { type: 'heatmap:update', file, data })
```

**Server-side storage format (`.smartb/heatmap.json`):**

```json
{
  "diagrams/plan.mmd": { "A": 15, "B": 8, "C": 3 },
  "diagrams/flow.mmd": { "step1": 22 }
}
```

Also emit via EventBus for cross-module tracking:

```javascript
// In annotations.js onFlagsChanged():
if (window.SmartBEventBus) {
    SmartBEventBus.emit('tracking:node-touched', { nodeId: nodeInfo.id });
}

// In diagram-editor.js applyEdit():
if (window.SmartBEventBus) {
    SmartBEventBus.emit('tracking:node-touched', { nodeId: editedNodeId });
}
```

The tracker listens to these events plus direct click/hover interactions.

---

## Fix 5: Project-Scoped Ghost Path Broadcast

### Current Bug

`broadcastAll()` sends to ALL namespaces. Ghost paths for project A leak into project B.

### Fix

Replace `broadcastAll()` with `broadcast('default', ...)` for all non-global messages:

```
src/server/ghost-path-routes.ts  -- lines 56, 84
src/mcp/tools.ts                  -- lines 87, 103, 329, 342, 397
src/mcp/session-tools.ts          -- lines 62, 117, 170, 210
```

Hardcoding `'default'` is acceptable because multi-project is not a current use case. Can be parameterized in v3 by threading project name through the MCP tool options.

---

## CSS Splitting

**Component:** `static/main.css` (577 lines, exceeds 500-line limit)
**Change type:** File reorganization (no new architecture)

```
BEFORE (1 file, 577 lines):
  main.css: topbar + toolbar + zoom + toast + kbd + help + breadcrumb
            + collapse notice + focus mode + context menu + selection
            + sidebar tabs + MCP session cards

AFTER (4 files):
  main.css:          ~210 lines (reset, body, toast, kbd, help, collapse, focus, selection, tabs)
  toolbar.css:       ~160 lines (topbar, toolbar groups, buttons, badges, workspace, status)
  context-menu.css:  ~30 lines  (context menu, items, separators, risk colors)
  mcp-sessions.css:  ~90 lines  (session cards, headers, file lists, dividers, empty state)
```

No CSS specificity changes needed -- all selectors are flat class-based (`.toolbar-btn`, `.context-menu-item`, `.mcp-session-card`). No nesting or combinators affected by file ordering.

---

## Coupling Risk Matrix

| Coupling Point | Components | Risk Level | Why Dangerous |
|----------------|------------|------------|---------------|
| **Annotation regex sync** | annotations.ts + annotations.js | CRITICAL | Any drift = data corruption. Backend writes format that frontend cannot read. |
| **injectAnnotations signature** | annotations.ts + service.ts + tools.ts + annotations.js | HIGH | Adding ghosts parameter touches the core write path. All callers must update. |
| **GhostPathStore removal** | ghost-store.ts + ghost-path-routes.ts + tools.ts + app-init.js | HIGH | Must replace all 4 consumers atomically. Partial migration = inconsistent state. |
| **Write lock integration** | file-routes.ts + service.ts | MEDIUM | Must not deadlock. Never nest withWriteLock on same file. |
| **Heatmap endpoint** | session-routes.ts + interaction-tracker.js | LOW | New additive endpoint. Existing heatmap consumers unchanged. |
| **broadcastAll -> broadcast** | tools.ts + session-tools.ts + ghost-path-routes.ts | LOW | Mechanical replacement. All callers pattern-identical. |

### The Critical Coupling: Backend/Frontend Annotation Sync

The annotation format is duplicated between `src/diagram/annotations.ts` and `static/annotations.js`. Both define:
- The same regex patterns (FLAG, STATUS, BREAKPOINT, RISK -- and now GHOST)
- The same ANNOTATION_START / ANNOTATION_END markers
- The same parse / strip / inject functions

Adding @ghost means adding a 5th regex, ghost parsing, and ghost serialization to BOTH files. They must produce byte-identical output for the same input.

**Mitigation strategy:**
1. Write the backend implementation first
2. Write a test that serializes ghost annotations and verifies the exact output format
3. Copy the exact regex and format strings to the frontend
4. Create a shared test fixture .mmd file that both backend tests and manual browser testing use

---

## Safe Integration Order

### Dependency Graph

```
Fix 5 (broadcast scoping)  --- independent, no dependencies
         |
Fix 3 (/save write lock)   --- independent, no dependencies
         |
Fix 1 (@ghost annotations) --- core change, Fix 2 depends on this
         |
Fix 2 (preserve annotations) -- depends on Fix 1 (needs ghost field)
         |
Fix 4 (auto-tracking)      --- independent of 1-3
```

### Recommended Build Order

**Phase A: Zero-Risk Mechanical Fixes (do first)**

1. **Fix 5: Project-scoped broadcast** -- Pure find-and-replace. Grep for broadcastAll, replace with broadcast('default', ...).

2. **Fix 3: /save through DiagramService** -- Add writeRaw method, change one line in file-routes.ts.

**Phase B: Core Annotation Extension (highest risk, highest value)**

3. **Fix 1: @ghost annotation system** -- Must be atomic across backend and frontend. Sub-order:
   - a. Add GHOST_REGEX + ghost parsing to annotations.ts
   - b. Add ghost serialization to injectAnnotations in annotations.ts
   - c. Update AllAnnotations interface to include ghosts
   - d. Update _writeDiagramInternal and injectAnnotations to accept ghosts
   - e. Add getGhosts/setGhost/removeGhost to DiagramService
   - f. Write backend tests
   - g. Mirror all regex/parsing/serialization changes in annotations.js
   - h. Update ghost-path-routes.ts to use DiagramService instead of GhostPathStore
   - i. Update tools.ts ghost path handling
   - j. Update ghost-paths.js to read from annotations state

4. **Fix 2: update_diagram preserves annotations** -- Add updateDiagramPreservingAnnotations to DiagramService. Update tools.ts.

**Phase C: Browser Enhancement (independent)**

5. **Fix 4: Auto-tracking for heatmap** -- New interaction-tracker.js module, server endpoint, EventBus wiring.

**Phase D: Polish**

6. **CSS splitting** -- Pure file reorganization. No functional impact.

### Why This Order

- **Fix 5 first** because trivially safe. Reduces noise in testing.
- **Fix 3 second** because it establishes write-lock discipline for safer testing of subsequent fixes.
- **Fix 1 third** because it is the foundation. Fix 2 cannot be done correctly without ghost annotations in the system.
- **Fix 2 fourth** because it requires the full annotation system (including ghosts).
- **Fix 4 last** because purely additive, no dependencies on other fixes.
- **CSS splitting** any time, completely independent.

---

## Data Flow Diagrams

### Current: Ghost Path Flow (Broken)

```
MCP: record_ghost_path          Browser: Create Ghost Path
         |                              |
    GhostPathStore.add()         POST /api/ghost-paths/:file
         |                              |
    broadcastAll(ghost:update)   GhostPathStore.add()
         |                       broadcastAll(ghost:update)
         v                              |
    ALL browsers get update             v
    (including wrong projects)    ALL browsers get update
                                         |
                                  SERVER RESTART
                                         |
                                  ALL GHOST PATHS LOST
```

### Target: Ghost Path Flow (Fixed)

```
MCP: update_diagram              Browser: Create Ghost Path
  (with ghostPaths param)              |
         |                       SmartBAnnotations state update
    DiagramService                 (ghosts Map)
      .updateDiagramPreserving         |
      Annotations()              injectAnnotations()
         |                         (includes @ghost lines)
    writeFile (atomic,                  |
      under lock)                POST /save (full content)
         |                              |
    FileWatcher triggers         DiagramService.writeRaw()
         |                         (under write lock)
    broadcast('default',                |
      file:changed)              FileWatcher triggers
         |                              |
         v                       broadcast('default',
    Correct project browsers       file:changed)
    parse @ghost from content           |
         |                              v
    Ghost paths rendered         Ghost paths rendered
    from annotation state        from annotation state
         |                              |
    PERSISTED IN .mmd FILE       PERSISTED IN .mmd FILE
    (survives restart)           (survives restart)
```

### Target: update_diagram Annotation Preservation

```
MCP: update_diagram(filePath, newContent, statuses, risks, ghosts)
         |
    DiagramService.updateDiagramPreservingAnnotations()
         |
    withWriteLock(filePath, async () => {
         |
         +-- readAllAnnotations(filePath)
         |     -> existingFlags, existingBreakpoints, existingGhosts
         |
         +-- merge:
         |     flags = existingFlags             (PRESERVED)
         |     breakpoints = existingBreakpoints (PRESERVED)
         |     statuses = newStatuses ?? existing (MCP OVERRIDES)
         |     risks = newRisks ?? existing       (MCP OVERRIDES)
         |     ghosts = {...existing, ...new}     (MERGED)
         |
         +-- _writeDiagramInternal(filePath, newContent, merged...)
    })
```

---

## Patterns to Follow

### Pattern 1: Annotation Read-Modify-Write via modifyAnnotation()

**What:** The `DiagramService.modifyAnnotation()` private method encapsulates the read-modify-write cycle for annotations.

**When:** Any time an annotation is added, updated, or removed.

**Why:** Handles write locking, file reading, annotation parsing, and re-injection in a single atomic operation.

**Example (existing, from service.ts line 66-77):**

```typescript
private async modifyAnnotation(
  filePath: string,
  modifyFn: (data: AnnotationData) => void,
): Promise<void> {
  return this.withWriteLock(filePath, async () => {
    const data = await this.readAllAnnotations(filePath);
    modifyFn(data);
    await this._writeDiagramInternal(
      filePath, data.mermaidContent, data.flags, data.statuses,
      data.breakpoints, data.risks, data.ghosts,  // ADD data.ghosts
    );
  });
}
```

All ghost CRUD methods use modifyAnnotation exactly like setFlag, setStatus, setBreakpoint, setRisk.

### Pattern 2: IIFE Module with Global Export

**What:** All browser-side modules follow the IIFE pattern with a `window.*` export.

**When:** Adding any new browser-side functionality.

```javascript
(function() {
    'use strict';
    var state = {};
    function init() { /* ... */ }
    window.SmartBModuleName = { init: init };
})();
```

### Pattern 3: Event Bus Integration

**What:** Modules hook into SmartBEventBus for lifecycle events like `diagram:rendered`.

**When:** A module needs to respond to diagram re-renders.

```javascript
function init() {
    if (window.SmartBEventBus) {
        SmartBEventBus.on('diagram:rendered', onDiagramRendered);
    }
}
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Partial Ghost Migration

**What:** Migrating ghost paths to annotations in some code paths but leaving GhostPathStore in others.

**Why bad:** Ghost paths exist in two places. Some operations read from annotations, others from GhostPathStore. User sees inconsistent data.

**Instead:** Remove GhostPathStore entirely. All ghost operations go through DiagramService.

### Anti-Pattern 2: Reading Outside Write Lock (TOCTOU)

**What:** Reading file annotations, then calling writeDiagram separately.

**Why bad:** Between read and write, another operation could modify the file. The write overwrites those changes.

**Instead:** Always use withWriteLock or methods that internally use it (modifyAnnotation, updateDiagramPreservingAnnotations).

### Anti-Pattern 3: Frontend State as Source of Truth

**What:** Treating the browser's in-memory annotation state as authoritative over the file.

**Why bad:** Browser crashes lose unsaved state. Multiple tabs have divergent state.

**Instead:** The .mmd file is always the source of truth. Browser state is a cache.

### Anti-Pattern 4: Ghost Parsing Without Tests

**What:** Copying the regex to the frontend and assuming it works.

**Why bad:** Subtle typos in serialization format cause parse failures.

**Instead:** Test fixtures with @ghost annotations. Verify round-trip: serialize -> parse -> serialize = identical.

### Anti-Pattern 5: Nested Write Locks

**What:** Calling a write-locked method from within another write-locked context.

**Why bad:** Deadlock. Inner call waits for outer lock, outer lock waits for inner call.

**Instead:** Use _writeDiagramInternal (no lock) when already inside a locked context.

### Anti-Pattern 6: Ghost Paths in Sidecar File

**What:** Storing ghost paths in `.smartb/ghost-paths.json` instead of in the `.mmd` annotation block.

**Why bad:** Dual source of truth. File rename/move/copy breaks the sidecar.

**Instead:** Use the annotation block. Ghost paths are diagram metadata, like flags and risks.

### Anti-Pattern 7: Real-Time Interaction Streaming via WebSocket

**What:** Sending every click/hover to the server in real-time via WebSocket.

**Why bad:** Massive traffic for data that only needs aggregation.

**Instead:** Accumulate counts client-side, flush via HTTP POST every 30 seconds.

---

## Scalability Considerations

| Concern | Current State | v2.1 Impact |
|---------|--------------|-------------|
| Ghost path count per file | Max 100 in-memory | Same limit for persisted annotations (100 @ghost lines max) |
| Annotation block size | ~20 lines typical | Up to ~120 lines with max ghost paths. Negligible I/O impact |
| Heatmap data accumulation | Session-only (bounded) | Continuous browser tracking. Needs periodic reset or cap |
| CSS load time | 8 files, ~1732 lines | 11 files, same total lines. HTTP/2 multiplexing handles it |
| Write lock contention | Rare (MCP only) | More frequent (browser save + MCP + ghost writes). Promise chain handles gracefully |

### Heatmap Data Growth Mitigation

Browser interaction tracking is continuous -- counts grow over days/weeks:
1. Cap counts at 10000 per node (sufficient for relative heatmap intensity)
2. Add `smartb cleanup --heatmap` CLI command (defer to later milestone)
3. Store timestamp with data for future "last 7 days" filtering

---

## Test Strategy

### Unit Tests (vitest)

| Test | File | What to Verify |
|------|------|---------------|
| Ghost regex parsing | test/diagram/annotations.test.ts | @ghost with label, without label, edge cases |
| Ghost round-trip | test/diagram/annotations.test.ts | parse(inject(content, ghosts)) === original ghosts |
| Ghost in parseAllAnnotations | test/diagram/annotations.test.ts | Ghosts alongside flags/statuses/etc. |
| DiagramService ghost CRUD | test/diagram/service.test.ts | setGhost, getGhosts, removeGhost |
| update_diagram preserves flags | test/mcp/tool-handlers.test.ts | Write flagged file, update_diagram, flags present |
| update_diagram preserves breakpoints | test/mcp/tool-handlers.test.ts | Same for breakpoints |
| writeRaw under lock | test/server/file-routes.test.ts | Concurrent writeRaw + writeDiagram serialize |
| broadcast scoping | test/server/websocket.test.ts | broadcast('default', msg) only reaches default |

### Integration Tests (manual or E2E)

| Scenario | Steps | Expected |
|----------|-------|----------|
| Ghost persistence | Create ghost -> restart server -> load file | Ghost visible |
| MCP preserves flags | Set flag in browser -> update_diagram via MCP | Flags still present |
| /save race condition | Rapidly save from browser while MCP updates | No data corruption |
| Heatmap auto-tracking | Click nodes in browser | Non-zero heatmap counts |
| Cross-project isolation | Open 2 projects, create ghost in A | Ghost NOT in B |

---

## Sources

- Direct codebase analysis (HIGH confidence -- all verified against source)
- `src/diagram/annotations.ts` -- annotation parsing/serialization (197 lines)
- `src/diagram/service.ts` -- DiagramService write lock pattern (247 lines)
- `src/diagram/types.ts` -- type definitions including GhostPath (82 lines)
- `src/server/ghost-store.ts` -- GhostPathStore in-memory (37 lines)
- `src/server/ghost-path-routes.ts` -- REST API for ghost paths (93 lines)
- `src/server/file-routes.ts` -- POST /save handler (162 lines)
- `src/server/server.ts` -- server setup (323 lines)
- `src/server/websocket.ts` -- WebSocketManager (126 lines)
- `src/mcp/tools.ts` -- MCP tool handlers (478 lines)
- `src/mcp/session-tools.ts` -- session MCP tools (234 lines)
- `src/mcp/schemas.ts` -- Zod input schemas (168 lines)
- `src/watcher/file-watcher.ts` -- native fs.watch (87 lines)
- `static/annotations.js` -- frontend annotation system (350 lines)
- `static/ghost-paths.js` -- frontend ghost path rendering (388 lines)
- `static/diagram-editor.js` -- visual diagram editor (368 lines)
- `static/ws-handler.js` -- WebSocket message routing (113 lines)
- `static/app-init.js` -- bootstrap and initialization (471 lines)
- `test/mcp/tool-handlers.test.ts` -- MCP tool tests (641 lines)
- [IntersectionObserver API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/IntersectionObserver) -- Browser viewport tracking

---
*Architecture research for: SmartB Diagrams v2.1 -- Bug Fixes & Usability*
*Researched: 2026-02-19*
