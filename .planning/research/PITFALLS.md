# Domain Pitfalls: v2.1 Bug Fix Milestone

**Domain:** Fixing 18+ bugs across Ghost Paths, Heatmap, MCP tools, and infrastructure in an existing TypeScript/vanilla JS diagram tool
**Researched:** 2026-02-19
**Confidence:** HIGH (based on direct codebase analysis of every file involved in each planned fix)

---

## Critical Pitfalls

Mistakes that cause regressions, data loss, or cascade failures across backend and frontend.

---

### Pitfall 1: /save Route Bypasses DiagramService Write Lock -- Routing Through Service Creates Double-Write Loop

**Planned fix:** Route POST /save through DiagramService instead of raw writeFile.
**What goes wrong:**

The current `/save` route (file-routes.ts:42-58) writes directly via `writeFile(resolved, body.content)`. The plan is to route this through `service.writeDiagram()` to get write lock protection. But `writeDiagram()` triggers `injectAnnotations()` when flags/statuses are provided (service.ts:139-141). The browser's `saveCurrentFile()` (file-tree.js:282-303) sends the FULL editor content -- which already includes the annotation block injected by `annotations.js:injectAnnotations()`. If `writeDiagram()` is called with this content AND annotation parameters, annotations get double-injected. If called without annotation parameters, the raw content (already containing annotations) is written correctly -- but the write lock now serializes saves that were previously concurrent, which changes timing behavior.

The real danger: `saveCurrentFile()` sends `editor.value` which is the output of the browser-side `injectAnnotations()`. This content already has `%% --- ANNOTATIONS ---` markers. If `writeDiagram()` receives this content and calls `injectAnnotations()` again, `stripAnnotations()` runs first (removing the browser-injected block), then re-injects from the passed maps. But the browser does NOT pass flags/statuses as separate parameters -- they are embedded in the content. So annotations are LOST.

**Consequences:**
- Annotations silently disappear after every browser save
- Flags set by the user vanish after Ctrl+S
- MCP-set statuses are overwritten by stale browser state

**Prevention:**
1. Route `/save` through `writeDiagram()` with content only (no flags/statuses/breakpoints/risks). Since `writeDiagram()` only calls `injectAnnotations()` when `flags || statuses || breakpoints || risks` is truthy (service.ts:139), passing none of these means it writes the content as-is, while still acquiring the write lock.
2. The call should be: `service.writeDiagram(filePath, body.content)` -- no optional params.
3. Test: Save from browser, verify annotations persist. Save from MCP, verify browser can still read annotations.

**Detection:**
- Flags disappear after saving in the browser
- Annotation block appears doubled (two `ANNOTATION_START` markers)

**Regression tests required:**
- `POST /save` with content containing annotations preserves them
- `POST /save` concurrent with `service.writeDiagram()` from MCP does not corrupt the file
- Round-trip: browser save followed by MCP read returns same annotations

---

### Pitfall 2: Adding @ghost Annotation Type Breaks Frontend Parser That Is Hardcoded to 4 Types

**Planned fix:** Persist ghost paths via `@ghost` annotations in the .mmd file.
**What goes wrong:**

The backend `parseAllAnnotations()` (annotations.ts:26-82) and the frontend `parseAnnotations()` (annotations.js:37-57) are DUPLICATED implementations with the same regexes but different data structures. Adding `@ghost` requires updating BOTH parsers. But the danger is deeper: the frontend `injectAnnotations()` (annotations.js:72-83) only serializes 4 types: flags, statuses from parameter, breakpoints from `state.breakpoints`, and risks from `state.risks`. It does NOT accept ghost paths as a parameter. If the backend writes `@ghost` annotations, the frontend will:

1. Parse them (if regex is added to frontend parser) but have nowhere to store them
2. Call `injectAnnotations()` during any flag/status change (annotations.js:250)
3. `injectAnnotations()` strips ALL annotations (including `@ghost`) then re-injects only flags/statuses/breakpoints/risks
4. Ghost annotations are silently destroyed every time the user adds a flag or changes a status

If the regex is NOT added to the frontend parser, the `@ghost` lines fall through to the "unrecognized annotation" debug log on backend (annotations.ts:78). On frontend, they are silently ignored (annotations.js has no fallback logging). But they survive `stripAnnotations()` only if they are OUTSIDE the annotation block -- which they are not.

**Consequences:**
- Ghost path persistence works when only MCP writes to the file
- Ghost paths vanish the moment a user interacts with flags, statuses, or any annotation feature in the browser
- This is a silent data loss bug that only manifests through user interaction

**Prevention:**
1. Add `@ghost` regex and storage to BOTH parsers (annotations.ts AND annotations.js)
2. Add ghost paths as a parameter to the frontend `injectAnnotations()` function
3. Store ghost paths in `state` object in annotations.js (alongside flags, statuses, breakpoints, risks)
4. Update the frontend `mergeIncomingContent()` to include ghost paths in the merge
5. OR (simpler alternative): Do NOT use annotations for ghost path persistence. Instead, use the existing `.smartb/` directory convention. Ghost paths are already stored in-memory in `GhostPathStore`. Persist them to `.smartb/ghost-paths.json` keyed by file. This avoids touching the annotation parser entirely.

**Detection:**
- Ghost paths disappear after flagging a node
- Ghost paths disappear after changing node status
- Ghost paths disappear after any browser edit that triggers `onFlagsChanged()`

**Regression tests required:**
- Write file with @ghost annotation via backend, flag a node in browser, verify @ghost annotation survives
- Full annotation round-trip test with all 5 types (flags, statuses, breakpoints, risks, ghosts)
- Frontend `mergeIncomingContent()` preserves ghost paths from incoming content

---

### Pitfall 3: update_diagram Read-Before-Write Introduces TOCTOU Race With FileWatcher

**Planned fix:** In tools.ts `update_diagram`, read existing annotations before writing to preserve user flags.
**What goes wrong:**

The plan is to add a read step before the write in `update_diagram` (tools.ts:63-132). Currently it calls `service.writeDiagram(filePath, content, undefined, statusMap, undefined, riskMap)` which OVERWRITES the entire file including any existing flags. The fix would read existing annotations first, then merge. But this creates a time-of-check/time-of-use (TOCTOU) race:

1. MCP `update_diagram` reads file -- sees flags {A: "review", B: "check"}
2. User adds flag C in browser, triggers `onFlagsChanged()` which saves via `/save`
3. MCP `update_diagram` writes file with merged annotations -- but uses the STALE read from step 1, so flag C is lost

This race is real because: (a) MCP tool calls are async, (b) the browser saves are async via fetch, (c) the FileWatcher has an 80ms debounce (file-watcher.ts:17), so the watcher might not have even detected the browser save before MCP writes.

**Consequences:**
- User flags intermittently disappear when AI agent is actively updating diagrams
- The bug is timing-dependent and nearly impossible to reproduce manually
- Most dangerous during active human+AI collaboration (the exact use case the tool is designed for)

**Prevention:**
1. Use `service.modifyAnnotation()` pattern (service.ts:66-77) which acquires the write lock, reads, modifies, and writes atomically. Do NOT implement read-then-write in tools.ts directly.
2. Specifically: refactor `update_diagram` to call a new `service.writeDiagramPreservingAnnotations(filePath, content, statusMap, riskMap)` method that internally uses `withWriteLock` to ensure the read-modify-write is atomic.
3. The method should: read existing file -> extract existing flags/breakpoints -> merge with new statuses/risks -> write atomically.
4. Do NOT pass the merged data back to tools.ts -- the merge must happen inside the lock.

**Detection:**
- Flags sporadically disappear during active AI sessions
- Running `update_diagram` and flagging a node simultaneously causes flag loss

**Regression tests required:**
- Concurrent `service.writeDiagram()` and `service.setFlag()` on the same file -- both changes must persist
- `update_diagram` preserves existing flags when adding new statuses
- `update_diagram` preserves existing breakpoints and risks when overwriting content

---

### Pitfall 4: Switching broadcastAll to broadcast for Ghost Paths Breaks Single-Project Users

**Planned fix:** Change ghost path WebSocket broadcasts from `broadcastAll` to `broadcast(projectName, ...)` for proper multi-project scoping.
**What goes wrong:**

Ghost path broadcasts currently use `broadcastAll()` in three locations:
- tools.ts:103 (MCP update_diagram)
- tools.ts:399 (MCP record_ghost_path)
- ghost-path-routes.ts:56 (REST POST)
- ghost-path-routes.ts:84 (REST DELETE)

Switching to `broadcast(projectName, ...)` requires knowing which project the file belongs to. But the current `registerGhostPathRoutes()` receives only `ghostStore` and `wsManager` -- it has NO access to project name. The routes decode the file path from the URL, but file path is NOT the same as project name. The WebSocket manager namespaces by project name (websocket.ts:39-44), not by file path.

For the MCP tools path: `registerTools()` also does not receive a project name. The tools are registered once per server, not per project.

For the default single-project case: users connect to `/ws` which maps to namespace `'default'` (websocket.ts:39). So `broadcast('default', ...)` would work. But the moment someone uses multi-project mode (future feature), ghost paths would only broadcast to the default namespace.

**Consequences:**
- If changed naively to `broadcast('default', ...)`: works in single-project, breaks in multi-project
- If changed to use file path as project name: no clients connect with that namespace, broadcasts are silently dropped, ghost paths stop updating in the browser
- If left as `broadcastAll()`: ghost path updates for one project leak to browsers viewing other projects (a minor issue, since the frontend filters by file anyway)

**Prevention:**
1. Keep `broadcastAll()` for now. The frontend `SmartBGhostPaths` already filters by file (ghost-paths.js:46-49): `getCurrentPaths()` only returns paths for the current file. Broadcasting to all namespaces is wasteful but correct.
2. If scoping is truly needed, thread `projectName` through to the route registration. But this requires refactoring `registerGhostPathRoutes()` signature AND the MCP tools to know which project they are operating on. This is a larger architectural change -- do NOT mix it into a bug fix milestone.
3. The real fix is to add a `projectName` resolver function to the server context that maps file paths to project names. But that is a feature, not a bug fix.

**Detection:**
- Ghost paths stop appearing in the browser after the change
- No errors in console (broadcasts to empty namespaces are silent)
- The bug is invisible from the server side -- only visible in the browser

**Regression tests required:**
- Ghost path created via MCP appears in browser (WebSocket receives the message)
- Ghost path created via REST API appears in browser
- Ghost path deletion propagates to browser

---

## Moderate Pitfalls

Mistakes that cause partial regressions or require rework of the fix itself.

---

### Pitfall 5: modal.js Empty Input Guard Removal Breaks Rename/Edit Flows That Depend on It

**Planned fix:** Remove the `if (!val) return;` guard in modal.js showPrompt (line 104-105) to allow submitting empty strings.
**What goes wrong:**

The `doConfirm()` guard at modal.js:104 prevents confirming with an empty trimmed value. This guard is used by EVERY caller of `SmartBModal.prompt()`:

1. **file-tree.js `createNewFile()`** (line 248-261): Creates a file from user input. Empty name would create `.mmd` (bare extension) or crash path resolution.
2. **file-tree.js `renameFile()`** (line 333-358): Renames a file. Empty name would create an invalid path.
3. **file-tree.js `renameFolder()`** (line 361-392): Renames a folder. Empty name would create an invalid directory.
4. **file-tree.js `createNewFolder()`** (line 264-279): Creates a folder. Empty name would create root-level chaos.
5. **diagram-editor.js `doEditNodeText()`** (line 249-261): Edits node label. Empty label is technically valid in Mermaid but produces invisible nodes.

Only `doEditNodeText()` has any case for wanting an empty string, and even there it is questionable.

**Consequences:**
- Removing the guard globally allows empty file/folder names, causing path resolution errors
- `resolveProjectPath()` may throw or create files at unexpected locations
- File tree becomes corrupted with unnamed entries

**Prevention:**
1. Do NOT remove the guard globally. Instead, add an `allowEmpty: true` option to the prompt config:
   ```javascript
   function showPrompt(opts) {
       var allowEmpty = opts.allowEmpty || false;
       // ...
       function doConfirm() {
           var val = input.value.trim();
           if (!val && !allowEmpty) return;
           close();
           if (onConfirm) onConfirm(val);
       }
   }
   ```
2. Only callers that explicitly need empty values pass `allowEmpty: true`.
3. All existing callers remain protected by default.

**Detection:**
- User confirms an empty rename dialog, file disappears or has broken name
- File tree shows unnamed entries

**Regression tests required:**
- Confirm empty prompt with `allowEmpty: false` (default): onConfirm NOT called
- Confirm empty prompt with `allowEmpty: true`: onConfirm called with empty string
- All 5 callers tested with empty input to verify they do not crash

---

### Pitfall 6: FileWatcher knownFiles Pre-Population Needs Async Discovery at Construction Time

**Planned fix:** Pre-populate `FileWatcher.knownFiles` with existing .mmd files at startup so first edits are detected as "changed" not "added."
**What goes wrong:**

`FileWatcher` constructor (file-watcher.ts:18-51) is synchronous -- it calls `fs.watch()` immediately. Pre-populating `knownFiles` requires discovering existing .mmd files, which means calling `service.listFiles()` (async) or using `fs.readdirSync()` (blocking). The constructor cannot be async.

Option A (sync readdir): `readdirSync` with recursive glob blocks the event loop during startup. For a project with hundreds of .mmd files in nested directories, this could take 100-500ms. During this time, no WebSocket connections are accepted.

Option B (async init): Add an `async init()` method that must be called after construction. But `FileWatcher` is created in `createProjectWatcher()` (server.ts:212-244) which returns the watcher synchronously. The current code pattern is:
```typescript
const fileWatcher = createProjectWatcher('default', resolvedDir, service);
```
Making this async changes the initialization sequence of `createHttpServer()`.

Option C (lazy discovery): Start watching immediately, populate `knownFiles` asynchronously. Files changed before discovery completes are treated as "added" (harmless -- the browser just receives `file:added` instead of `file:changed`, and `tree:updated` is sent for both).

**Consequences:**
- Option A: Startup delay, especially for large projects
- Option B: Requires refactoring `createHttpServer()` and all callers
- Option C: Brief window where changes are reported as additions (cosmetic issue only)

**Prevention:**
1. Use Option C (lazy): Start the watcher immediately, then asynchronously populate `knownFiles`:
   ```typescript
   constructor(...) {
       this.watcher = watch(...);
       // Async pre-populate (non-blocking)
       discoverMmdFiles(projectDir).then(files => {
           for (const f of files) this.knownFiles.add(f);
       }).catch(() => {});
   }
   ```
2. The window of incorrect "added" events is at most a few hundred milliseconds and has no functional impact -- `file:added` triggers `refreshFileList()` in the browser just like `file:changed`.
3. Do NOT use synchronous file system calls in the constructor.

**Detection:**
- First file edit after server start triggers `file:added` instead of `file:changed`
- No functional impact, but may confuse debug logs

**Regression tests required:**
- FileWatcher with pre-populated knownFiles reports changes (not additions) for existing files
- FileWatcher correctly reports truly new files as additions
- Large project directory does not cause startup delay

---

### Pitfall 7: Auto Heatmap Tracking in Browser Causes requestAnimationFrame Loop

**Planned fix:** Auto-track heatmap data in the browser (node visit counts) without explicit user action.
**What goes wrong:**

The current `SmartBHeatmap` module (heatmap.js) is purely passive -- it receives visit count data from the server via `updateVisitCounts()` (heatmap.js:177-183) and applies SVG fill colors. Auto-tracking would require detecting which nodes the user "visits" (views, clicks, hovers) and sending this data to the server.

The naive approach is to listen for `diagram:rendered` events and count visible nodes. But `diagram:rendered` fires on EVERY re-render, and heatmap application itself triggers SVG mutations that could trigger intersection observers or mutation observers, creating a feedback loop. Specifically:

1. `diagram:rendered` fires
2. Auto-tracker counts visible nodes, sends to server
3. Server broadcasts `heatmap:update` via WebSocket
4. Browser `updateVisitCounts()` calls `restoreFills(); saveFills(); applyFrequencyHeatmap();` (heatmap.js:180-181)
5. `applyFrequencyHeatmap()` modifies SVG attributes
6. If any observer watches the SVG, it fires, potentially triggering another count

Even without observers, the `diagram:rendered -> heatmap:update -> diagram re-render?` chain must be carefully broken.

**Consequences:**
- Continuous WebSocket messages flooding the server
- Browser performance degradation from rapid SVG mutations
- Server-side heatmap data inflated by automated counts (not real user interaction)

**Prevention:**
1. Track meaningful interactions only: click on a node, select a node, open a node's context menu. Do NOT track "visible in viewport."
2. Debounce tracking events: batch node visits and send at most once per 5 seconds.
3. Break the feedback loop: the `heatmap:update` WebSocket handler should NOT trigger any tracking. Add a guard flag:
   ```javascript
   var _isApplyingHeatmap = false;
   function updateVisitCounts(counts) {
       _isApplyingHeatmap = true;
       // ... apply colors ...
       _isApplyingHeatmap = false;
   }
   ```
4. Do NOT send heatmap data back to the server from the browser. The heatmap should be computed server-side from session recording data. The browser is a display-only consumer.

**Detection:**
- WebSocket message flood visible in browser DevTools Network tab
- CPU usage spikes in browser tab
- Heatmap data grows unrealistically fast

**Regression tests required:**
- Heatmap activation does not cause WebSocket message flood
- Node interaction tracking is debounced
- Heatmap update from server does not trigger additional tracking

---

### Pitfall 8: Frontend Annotation Parser Drift -- 5 Types in Backend, 4 Types in Frontend After @ghost Addition

**Planned fix:** Multiple fixes touch annotations (ghost persistence, read-before-write, heatmap tracking).
**What goes wrong:**

This is the overarching integration risk for the entire milestone. The annotation system is the MOST COUPLED component in the codebase -- it bridges backend (TypeScript) and frontend (vanilla JS) with duplicated parsing logic.

Current state of duplication:

| Feature | Backend (annotations.ts) | Frontend (annotations.js) |
|---------|--------------------------|---------------------------|
| Regex definitions | Lines 6-9 (4 regexes) | Lines 11-14 (4 regexes, identical) |
| Parser function | `parseAllAnnotations()` (lines 26-82) | `parseAnnotations()` (lines 37-57) |
| Strip function | `stripAnnotations()` (lines 108-138) | `stripAnnotations()` (lines 59-70) |
| Inject function | `injectAnnotations()` (lines 145-196) | `injectAnnotations()` (lines 72-83) |
| Data structures | `Map<string, Flag>`, typed | `new Map()`, untyped |
| Serialization order | flags, statuses, breakpoints, risks | flags, statuses, breakpoints, risks |

The functions behave ALMOST identically but with subtle differences:
- Backend `injectAnnotations()` adds `\n` at the end (line 195); frontend does NOT (line 82)
- Backend treats `breakpoints` and `risks` as optional params; frontend reads from `state.*` globals
- Backend `stripAnnotations()` ensures single trailing newline; frontend strips trailing blanks and does NOT ensure trailing newline

These differences mean that a file written by the backend and then re-saved by the frontend will have subtly different whitespace. This whitespace difference triggers the `FileWatcher` (80ms debounce), which broadcasts a `file:changed`, which triggers the browser to re-sync, which may cause an unnecessary re-render.

Adding ANY new annotation type (@ghost) must update BOTH parsers identically, and the inject functions must serialize in the same order. If they serialize in different order, the FileWatcher detects a "change" on every save even when content is identical.

**Consequences:**
- Ghost paths silently lost when browser saves (Pitfall 2 above)
- Infinite save-sync loop: backend writes with trailing newline, browser re-saves without it, watcher detects change, broadcasts, browser re-syncs, re-saves...
- Annotations reordered on every save, watcher treats it as a change

**Prevention:**
1. Before ANY annotation changes, normalize the trailing whitespace behavior: both backend and frontend `stripAnnotations()` must produce identical output for identical input.
2. Both `injectAnnotations()` must serialize annotation types in the exact same order.
3. Add a cross-validation test: feed the same input to both parsers (via test helper that runs the JS function), verify outputs match.
4. Long-term: eliminate the duplication entirely. Generate the frontend parser from the backend TypeScript (or move the frontend to use a shared module via build step).

**Detection:**
- Browser DevTools Network tab shows repeated /save or file:changed WebSocket messages in a loop
- File modification timestamp updates every few seconds without user action
- `git diff` shows only whitespace changes in .mmd files

**Regression tests required:**
- Backend `injectAnnotations()` output is byte-identical to frontend `injectAnnotations()` output for the same input
- File saved by backend, re-saved by frontend with no user changes: file content is identical (no watcher trigger)
- All 5 annotation types round-trip through both parsers

---

## Minor Pitfalls

Issues that cause friction or cosmetic bugs but are straightforward to fix once identified.

---

### Pitfall 9: Modal.js Loads After App-Init.js in Script Order -- But Is Now a Dependency

**What goes wrong:**
Looking at live.html script loading order (lines 198-234), modal.js loads at line 233, app-init.js at line 234. But diagram-editor.js (line 213) calls `SmartBModal.prompt()` in `doEditNodeText()`. This works today because `doEditNodeText()` is only called via user click (by which time modal.js has loaded). But if any initialization code in app-init.js needs to programmatically trigger a modal (e.g., for a first-run wizard or error dialog), `SmartBModal` will be undefined.

**Prevention:**
Move modal.js to load before diagram-editor.js in the script order (before line 213, not after line 232). Since modal.js has zero dependencies on other modules (it only depends on modal.css), it can safely be loaded early.

---

### Pitfall 10: Ghost Path Persistence May Conflict With .smartb/ Directory Git Ignore

**What goes wrong:**
If ghost paths are persisted to `.smartb/ghost-paths.json`, and the user has `.smartb/` in their `.gitignore` (likely, since it contains local state), ghost paths are NOT version-controlled. This is probably desired for in-memory session ghost paths. But if `@ghost` annotations are used in the .mmd file, they ARE version-controlled, which means other developers see ghost paths from someone else's AI session. This is unexpected and noisy in code review.

**Prevention:**
Persist ghost paths in `.smartb/` (not in .mmd annotations). Ghost paths are session-local data, not diagram metadata. They should not pollute the .mmd file or appear in git diffs.

---

### Pitfall 11: Zod v4 Is Already Compatible -- No Action Needed

**What goes wrong (or rather, does NOT go wrong):**
The milestone context flags "Zod v4 may conflict with MCP SDK's Zod v3" as a pain point. But inspection of the actual installed packages shows:
- `zod@4.3.6` is installed and used by schemas.ts
- MCP SDK `@modelcontextprotocol/sdk@^1.26.0` declares `"zod": "^3.25 || ^4.0"` in peerDependencies
- The SDK uses the hoisted zod (no nested node_modules/zod)
- Everything is already compatible

**Prevention:**
No action needed. But document this finding so it is not re-investigated in every milestone.

---

## Phase-Specific Warnings for Each Planned Fix

| Fix | Specific Risk | Severity | Mitigation |
|-----|---------------|----------|------------|
| modal.js empty guard removal | Breaks 5 callers (file create/rename/delete) | HIGH | Add `allowEmpty` option instead of removing guard |
| tools.ts read-before-write | TOCTOU race with browser saves | CRITICAL | Use `withWriteLock` internally, not read+write in tools.ts |
| Ghost path @ghost annotation | Frontend parser drops @ghost on any flag change | CRITICAL | Use .smartb/ persistence instead of annotations |
| FileWatcher knownFiles | Sync readdir blocks startup | MEDIUM | Use async discovery with lazy population |
| /save through DiagramService | Double-injection of annotations | HIGH | Pass content only, no annotation params |
| Auto heatmap tracking | requestAnimationFrame feedback loop | MEDIUM | Track clicks only, debounce, break feedback loop |
| broadcastAll to broadcast | Ghost paths stop appearing in browser | HIGH | Keep broadcastAll; frontend already filters by file |

## Integration Risk Matrix

The 7 fixes interact with each other. This matrix shows which pairs are dangerous to implement simultaneously:

| Fix A | Fix B | Interaction Risk |
|-------|-------|------------------|
| /save through Service | read-before-write in tools.ts | CRITICAL: Both modify the write path. If /save acquires write lock and tools.ts read-before-write also acquires write lock, they are safe. But if tools.ts does read OUTSIDE the lock, /save may interleave. Implement /save routing FIRST, then tools.ts read-before-write. |
| @ghost annotations | read-before-write in tools.ts | HIGH: If @ghost is added to annotation parser, read-before-write must also preserve ghost annotations during merge. |
| /save through Service | @ghost annotations | HIGH: If /save routes through `writeDiagram()` AND @ghost changes the annotation format, the browser save flow must serialize all 5 types correctly. |
| Auto heatmap | broadcastAll to broadcast | LOW: Heatmap uses a different WS message type than ghost paths. Independent. |
| FileWatcher knownFiles | /save through Service | MEDIUM: Pre-populating knownFiles uses `service.listFiles()`. If /save is being refactored simultaneously, ensure listFiles is stable. |
| modal.js guard | All others | NONE: modal.js is UI-only, no backend interaction. |

## Recommended Fix Order

Based on dependency analysis, implement fixes in this order to minimize integration risk:

1. **modal.js `allowEmpty` option** -- Zero dependencies, pure frontend, safe to ship independently
2. **FileWatcher knownFiles pre-population** -- Infrastructure change, no impact on other fixes
3. **Zod v4 confirmation** -- Document "no action needed" and close the issue
4. **`/save` route through DiagramService** -- Must be done BEFORE read-before-write, establishes the write lock foundation
5. **`update_diagram` read-before-write** -- Depends on /save routing being stable, uses the write lock pattern
6. **Ghost path persistence decision** -- Decide .smartb/ vs @ghost annotation BEFORE implementing
7. **broadcastAll vs broadcast** -- Keep broadcastAll, document the rationale, close as won't-fix or defer
8. **Auto heatmap tracking** -- Last, because it is the most performance-sensitive and benefits from all other fixes being stable

## Sources

### Codebase Analysis (HIGH confidence -- primary source)
- `src/diagram/annotations.ts` -- Backend annotation parser (197 lines)
- `static/annotations.js` -- Frontend annotation parser (350 lines, duplicated logic)
- `src/diagram/service.ts` -- DiagramService with write locks (247 lines)
- `src/mcp/tools.ts` -- MCP tool registrations including update_diagram (478 lines)
- `src/server/file-routes.ts` -- /save route implementation (162 lines)
- `src/server/ghost-path-routes.ts` -- Ghost path REST endpoints (93 lines)
- `src/server/websocket.ts` -- WebSocket manager with broadcastAll/broadcast (125 lines)
- `src/watcher/file-watcher.ts` -- FileWatcher with knownFiles set (86 lines)
- `static/modal.js` -- Modal prompt with empty guard (171 lines)
- `static/file-tree.js` -- File CRUD using SmartBModal (462 lines)
- `static/diagram-editor.js` -- Node editing using SmartBModal (368 lines)
- `static/ghost-paths.js` -- Frontend ghost path rendering (388 lines)
- `static/heatmap.js` -- Heatmap overlay (217 lines)
- `static/ws-handler.js` -- WebSocket message dispatch (113 lines)
- `static/app-init.js` -- Bootstrap and initialization (471 lines)
- `static/live.html` -- Script loading order (234 script tags)
- `test/diagram/annotations.test.ts` -- Annotation tests (477 lines, backend only)

### Dependency Versions (HIGH confidence -- package.json + node_modules inspection)
- zod@4.3.6 installed
- @modelcontextprotocol/sdk@^1.26.0 with peerDep "zod": "^3.25 || ^4.0"
- MCP SDK uses hoisted zod (no version conflict)

---
*Pitfalls research for: SmartB Diagrams v2.1 -- Bug Fix Milestone*
*Researched: 2026-02-19*
