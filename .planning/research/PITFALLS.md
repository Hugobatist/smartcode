# Domain Pitfalls: v2 Interactive Canvas + AI Observability

**Domain:** Replacing static SVG renderer with interactive canvas, adding drag/select/edit capabilities, and building advanced AI observability features on top of an existing diagram tool
**Researched:** 2026-02-15
**Confidence:** MEDIUM-HIGH (verified against codebase analysis, community sources, and domain-specific case studies)

---

## Critical Pitfalls

Mistakes that cause rewrites, break existing functionality, or fundamentally derail the project.

---

### Pitfall 1: Big Bang Renderer Replacement -- Breaking Everything at Once

**What goes wrong:**
Attempting to replace Mermaid.js with a custom canvas renderer in a single phase. The existing v1 has 6 modules (annotations.js, diagram-editor.js, collapse-ui.js, search.js, ws-client.js, plus 1757 lines in live.html) that ALL depend on Mermaid's SVG DOM output. Every one of these modules queries Mermaid-specific DOM structures: `#preview svg`, `.node`, `.cluster`, `.nodeLabel`, `.edgePath`, and ID patterns like `flowchart-{ID}-{N}` and `subGraph{N}-{ID}-{N}`. A big bang replacement breaks all of them simultaneously.

**Why it happens:**
The temptation to "just swap the renderer" because the new system is architecturally cleaner. But the old system has deep coupling between rendering output and interaction code. SmartBAnnotations.extractNodeId() traverses the DOM looking for Mermaid-specific class names and ID patterns. SmartBCollapseUI.extractNodeId() does the same. SmartBSearch.search() queries `.nodeLabel` elements. The diagram-editor click handler looks for `flowchart-{ID}-{N}` patterns. All of this breaks the instant Mermaid SVG is replaced.

**Consequences:**
- Flags stop working (cannot find nodes in SVG)
- Search breaks (no `.nodeLabel` elements)
- Collapse/expand breaks (no `.cluster` elements)
- Node editing breaks (cannot parse node IDs from SVG)
- VS Code extension webview breaks (same Mermaid DOM queries)
- All 119 existing tests that depend on Mermaid output become invalid
- Months of regression before feature parity with v1

**Prevention:**
1. **Strangler fig pattern:** Build the new renderer alongside Mermaid, not instead of it. Both should coexist for at least one full phase.
2. **Abstraction layer first:** Before touching the renderer, extract ALL DOM queries into a `DiagramDOM` interface that both Mermaid SVG and the new canvas system can implement. This means `findNode(id)`, `getNodeBBox(id)`, `getEdgeEndpoints(id)`, `getNodeLabel(id)` -- abstract operations, not DOM queries.
3. **Feature parity gate:** The new renderer cannot replace Mermaid until it passes the exact same interaction test suite. Build the test suite BEFORE the renderer.
4. **Parallel rendering mode:** Add a toggle (`?renderer=canvas` query param) so the old Mermaid path and new canvas path can be compared side-by-side during development.

**Detection:**
- "I'll just quickly replace the render function" appears in any plan
- A phase plan has "replace Mermaid" as step 1 instead of "abstract DOM queries" as step 1
- No mention of backwards compatibility or migration path

**Phase to address:** Must be the FIRST thing addressed in the renderer replacement phase. The abstraction layer IS the phase gate.

---

### Pitfall 2: .mmd Round-Trip Fidelity Loss

**What goes wrong:**
The new interactive editor allows users to drag nodes, resize subgraphs, add edges visually. These visual operations must be serialized back to .mmd text. But Mermaid syntax is lossy -- it encodes topology (what connects to what) and labels, but NOT positions, sizes, or visual styling beyond classDefs. When the custom renderer computes a layout and the user modifies it, writing back to .mmd loses all spatial information. The next render produces a completely different layout.

This is the core architectural tension: .mmd is the source of truth (files on disk, version-controlled, AI-editable), but the interactive canvas needs information that .mmd cannot represent.

**Why it happens:**
Mermaid is a declarative language: you describe the graph, and the layout engine decides positions. A visual editor is imperative: the user decides positions. These paradigms conflict. Every existing diagram tool that tried to use a text format as the source of truth while providing visual editing (PlantUML + visual editors, Graphviz + interactive tools) ran into this exact problem.

**Consequences:**
- User drags a node to a specific position, saves, reloads -- node is in a different position
- AI agent updates the .mmd file, user's careful layout is destroyed
- Annotations reference positions that no longer exist after re-layout
- Users lose trust in the tool ("it keeps moving my stuff around")

**Prevention:**
1. **Metadata sidecar file:** Store visual layout data in a `.smartb.json` sidecar file alongside each `.mmd` file. Contains node positions, collapsed state, viewport settings. The .mmd file remains the topology source of truth; the sidecar stores the visual presentation.
2. **Layout pinning:** When a user manually positions a node, pin it. Pinned nodes keep their position across re-renders. Unpinned nodes follow the automatic layout.
3. **Stable layout algorithm:** Use ELK.js with `elk.algorithm: "layered"` and `elk.layered.crossingMinimization.strategy: "LAYER_SWEEP"` which produces deterministic, stable layouts for the same input graph. Same .mmd input always produces the same visual output.
4. **Merge strategy for AI updates:** When an AI agent modifies the .mmd, preserve the sidecar layout for nodes that still exist. Only auto-layout new or repositioned nodes.

**Detection:**
- "We'll just re-render the .mmd after each edit" appears in any plan
- No mention of layout persistence or position storage
- Tests only verify topology, not visual stability

**Phase to address:** Architecture decision needed BEFORE the first interactive feature. The sidecar file format must be designed before any drag/drop capability.

---

### Pitfall 3: Vanilla JS Complexity Ceiling in Canvas Interactions

**What goes wrong:**
Building a full interactive canvas editor (drag, select, multi-select, resize, undo/redo, keyboard shortcuts, context menus, snap-to-grid, zoom-to-cursor) in vanilla JavaScript without a framework. The current codebase already shows strain: live.html is 1757 lines, and the 5 IIFE modules communicate through `window.*` globals and callback hooks. Adding drag interaction requires: hit testing, coordinate transforms (screen to canvas to graph space), event state machines (mousedown+mousemove=drag vs mousedown+mouseup=click), z-order management, and render loop coordination. Each of these is manageable alone, but their interaction is combinatorial.

**Why it happens:**
The project constraint is "vanilla JS, no framework." This works well for simple UIs (displaying diagrams, handling a few click events). But interactive canvas editing is a fundamentally different complexity class. Framework-free diagram editors exist (draw.io/mxGraph is vanilla JS, roughly 200,000 lines), but they represent person-years of engineering. The risk is not that vanilla JS cannot do it -- it is that the codebase becomes unmaintainable before the feature set is complete.

**Consequences:**
- State management becomes ad-hoc (is the user dragging? selecting? in flag mode? in edge-add mode? -- these states already conflict today)
- Event handler conflicts between modules (annotations.js, diagram-editor.js, collapse-ui.js, and search.js ALL attach click handlers to the same `#preview-container`)
- Memory leaks from event listeners that are not properly cleaned up across re-renders
- Bugs that only appear in specific interaction sequences (drag + zoom + flag mode)
- The 500-line limit forces splitting files, but the split files share global state through `window.*` -- this is distributed monolith, not modular code

**Prevention:**
1. **Event bus:** Replace the current callback-hooks pattern (`_initHooks` object passed to each module) with a proper event bus/pubsub. Modules communicate through events, not direct function calls. This decouples the modules and makes the interaction state machine explicit.
2. **Interaction state machine:** Formalize the interaction modes as a state machine. The current code has implicit states (flagMode, addNode mode, addEdge mode, panning, selecting). Make these explicit: `IDLE -> PANNING -> IDLE`, `IDLE -> FLAG_MODE -> FLAG_PLACING -> IDLE`, etc. Only one interaction mode is active at a time. The state machine prevents conflicting handlers.
3. **Canvas abstraction layer:** Build a thin `CanvasInteraction` class that handles: hit testing, coordinate transforms, drag detection (mousedown distance threshold), and delegates to the active interaction handler. All modules register with this layer instead of attaching raw DOM events.
4. **Strongly consider a minimal rendering library:** Even within the "no framework" constraint, a library like Pixi.js (for Canvas2D/WebGL) or Rough.js (for SVG) handles the render loop, hit testing, and event delegation that would otherwise be thousands of lines of manual code. A rendering library is NOT a UI framework -- it is infrastructure, like using `ws` for WebSocket instead of raw TCP.

**Detection:**
- More than 3 modules attaching click handlers to the same DOM element
- `window.*` globals used for inter-module communication beyond the existing set
- Any file exceeding 400 lines in the static/ directory
- Interaction bugs that require reproducing a specific click sequence

**Phase to address:** Must be addressed at the START of the canvas phase. If the event bus and interaction state machine are not built first, every subsequent feature adds exponential complexity.

---

### Pitfall 4: Layout Engine Async + Performance Cliffs

**What goes wrong:**
ELK.js (the recommended replacement for Mermaid's dagre) runs its layout algorithm asynchronously because the core is a Java library compiled to JavaScript via GWT. Every layout computation returns a Promise. This means: (a) you cannot synchronously compute layout during rendering, (b) rapid diagram updates (AI agent sending 10+ updates/second) queue layout computations that may complete out of order, (c) the layout computation for a 100+ node graph takes 200-500ms, creating visible layout latency.

Meanwhile, dagre (used internally by Mermaid) is synchronous but unmaintained since 2018, makes poor edge routing decisions, and has known bugs with complex subgraph nesting.

**Why it happens:**
ELK.js is the industry standard for graph layout. React Flow, Svelte Flow, and many production tools use it. But they all run into the same issues: (1) async layout means the diagram "pops" into position after rendering, creating visual jank, (2) layout for large graphs blocks the main thread (even though the API is async, the computation is CPU-bound in a single tick), (3) the Java API translated to JS has over 150 configuration options, and the wrong combination produces unusable layouts.

**Consequences:**
- Diagram "flashes" on every update: first renders without positions, then jumps to computed positions
- AI agent rapid-fire updates cause layout queue buildup, leading to stale layouts being applied
- Large diagrams (100+ nodes) cause the main thread to freeze during layout computation
- Edge routing produces crossing edges or routes through nodes with default settings
- Users report "the diagram keeps jumping around" -- layout instability across updates

**Prevention:**
1. **Layout debouncing with cancellation:** Do not compute layout on every update. Debounce with a 150ms window. Cancel in-flight layout computations when a new update arrives. Only apply the LATEST layout result.
2. **Incremental layout:** For updates that add/remove 1-3 nodes, do not recompute the full layout. Compute positions for new nodes relative to their neighbors and pin existing nodes. Full layout only on user request (Ctrl+L or "Re-layout" button).
3. **Web Worker layout:** Move ELK.js computation to a Web Worker. This prevents main thread blocking entirely. The worker receives the graph, computes layout, returns positions. The main thread applies positions to the renderer. Note: ELK.js officially supports Web Worker mode via `elk.bundled.js`.
4. **Layout caching:** Cache the layout result keyed by a hash of the graph topology. If the same topology is requested again (common during collapse/expand toggling), return the cached layout instantly.
5. **Deterministic configuration:** Use a fixed, tested ELK configuration. Do not expose all 150 options to users. Recommended starting point:
   ```json
   {
     "elk.algorithm": "layered",
     "elk.direction": "RIGHT",
     "elk.spacing.nodeNode": 60,
     "elk.layered.spacing.edgeNodeBetweenLayers": 40,
     "elk.edgeRouting": "ORTHOGONAL"
   }
   ```

**Detection:**
- Layout computation on the main thread without a Worker
- No debounce on layout trigger during rapid updates
- Users see nodes "jumping" on every AI agent update
- Edge routing produces overlapping or crossing paths

**Phase to address:** Must be solved in the renderer foundation phase. Retrofitting async layout and Workers into a synchronous rendering pipeline is a rewrite.

---

### Pitfall 5: Undo/Redo Done Wrong in a Collaborative-Like System

**What goes wrong:**
Building undo/redo using the naive approach (store full state snapshots on every action) in a system where BOTH the user AND an AI agent modify the diagram. The undo stack captures user edits, but AI agent updates arrive via WebSocket and modify the same state. When the user undoes, they may undo an AI agent's change, or their undo may conflict with a subsequent AI update. The undo stack becomes a source of confusion and data corruption.

**Why it happens:**
Undo/redo seems simple (Ctrl+Z goes back) but is actually a distributed systems problem when multiple sources of truth exist. The current system has three mutation sources: (1) user edits in the browser editor, (2) AI agent updates via MCP, (3) file system changes via file watcher. All three modify the same .mmd file content. A naive undo stack does not distinguish between these sources.

**Consequences:**
- User presses Ctrl+Z and loses an AI agent's important update
- Redo stack is invalidated when an AI update arrives during an undo sequence
- File system watcher detects the undo as a "change," triggering a re-render loop
- "Undo" means different things in different contexts (undo my drag? undo my flag? undo the AI's last step?)

**Prevention:**
1. **Separate undo stacks by source:** User actions have their own undo stack. AI updates do not. File system changes are treated as external events that fork a new undo branch.
2. **Command pattern with source tagging:** Each command records its source (`user`, `ai`, `filesystem`). Ctrl+Z only undoes `user` commands. AI commands can be "rolled back" through a separate UI action ("Revert AI change").
3. **Operational Transform (OT) lite:** When the user undoes an action, check if any AI updates were applied on top. If so, transform the undo to be compatible with the AI updates (similar to how Google Docs handles concurrent edits, but much simpler since the graph model has clear semantics).
4. **Start without undo:** Seriously consider deferring undo/redo entirely. The .mmd file is version-controlled. The AI agent can regenerate any state. The value of undo in a collaborative observability tool is much lower than in a traditional editor. If undo is deferred, it avoids this entire pitfall class.

**Detection:**
- Undo implementation does not distinguish between user and AI changes
- File watcher fires on undo-triggered saves, causing a loop
- Tests for undo do not include scenarios with concurrent AI updates

**Phase to address:** Design decision needed before implementing any edit capabilities. If undo is deferred, document the decision explicitly so it does not become a "we forgot" bug.

---

### Pitfall 6: live.html Is Already 1757 Lines -- Refactoring Under Pressure

**What goes wrong:**
The main HTML file is already 3.4x the project's 500-line limit. It contains: CSS (582 lines), HTML structure (114 lines), and JavaScript (1061 lines) including Mermaid initialization, rendering, pan/zoom, file sync, file tree, export (SVG + PNG with duplicate Mermaid configs), editor events, keyboard shortcuts, save/delete/rename operations, WebSocket handling, collapse integration, and annotation/search/editor initialization. Adding interactive canvas features (drag handlers, selection rectangle, context menu, property panel, toolbar states) to this file will push it past 3000 lines.

The 5 IIFE modules were extracted as a partial mitigation, but they communicate through `window.*` globals and the `_initHooks` callback object -- this is not true modularity but distributed coupling.

**Why it happens:**
Organic growth. Each phase added features to live.html because it was the fastest path. The IIFE extraction (annotations.js, diagram-editor.js, etc.) moved code out but not the coupling. The modules still reach into live.html's scope through hooks, and live.html reaches into the modules through `window.SmartBAnnotations`, `window.MmdEditor`, etc.

**Consequences:**
- Adding new features creates merge conflicts with any other work touching live.html
- CSS specificity wars between inline styles and external CSS
- Duplicate Mermaid initialization configs (lines 712-741 and 1281-1345 and 1316-1345 -- the PNG export has its own copy)
- Global state variables (`zoom`, `panX`, `panY`, `autoSync`, `lastContent`, etc.) create hidden dependencies
- No unit tests possible for the inline JavaScript
- New developers cannot understand the system without reading all 3706 lines of static/ code

**Prevention:**
1. **Refactor BEFORE adding features, not during:** Dedicate a full plan to splitting live.html into proper ES modules BEFORE adding any canvas code. This is not optional cleanup -- it is prerequisite infrastructure.
2. **Module system migration:** Move from IIFEs + `<script>` tags to ES modules bundled with a tool (esbuild or Vite in library mode). This enables: proper imports/exports, tree shaking, TypeScript for client code, and eliminates `window.*` globals.
3. **Specific splits:**
   - `live.html` -> pure HTML skeleton (< 100 lines)
   - `styles/` -> CSS files by component
   - `core/state.ts` -> centralized state store
   - `core/event-bus.ts` -> inter-module communication
   - `renderer/mermaid-renderer.ts` -> Mermaid-specific rendering
   - `renderer/canvas-renderer.ts` -> new canvas renderer
   - `interactions/pan-zoom.ts` -> pan/zoom logic
   - `interactions/drag-select.ts` -> new drag/select
   - `ui/toolbar.ts`, `ui/sidebar.ts`, `ui/editor-panel.ts` -> UI components
4. **Deduplication:** The Mermaid config is duplicated 3 times in live.html. Extract to a single `mermaid-config.ts` module.

**Detection:**
- Any plan that adds JavaScript to live.html without first refactoring it
- live.html exceeds 2000 lines
- New modules added as IIFEs with `window.*` exports

**Phase to address:** FIRST plan of the v2 milestone. The refactoring is the phase gate for all subsequent work.

---

## Moderate Pitfalls

Mistakes that cause significant rework or degraded experience but do not require full rewrites.

---

### Pitfall 7: SVG vs Canvas Choice Locks You In

**What goes wrong:**
Choosing HTML5 Canvas (immediate mode) for the renderer because "canvas is faster" without understanding the tradeoffs. Canvas provides no DOM -- every node, edge, and label is painted pixels. This means: no CSS styling, no native text selection, no screen reader accessibility, no browser dev tools inspection, no SVG export without re-rendering. The current system relies heavily on SVG DOM features: CSS classes for styling (`.flagged`, `.search-match`), DOM IDs for node identification, `getBBox()` for badge positioning, and `outerHTML` for SVG export.

Conversely, choosing SVG for the renderer because "we already use SVG" ignores the performance cliff: SVG hits its ceiling at around 300 DOM elements where layout/paint/compositing costs dominate.

**Prevention:**
1. **Hybrid approach:** Use SVG for individual node rendering (leverages CSS, DOM inspection, accessibility) but apply pan/zoom transforms at the container level. This is what JointJS, React Flow, and draw.io do.
2. **Virtualized SVG:** Only render nodes that are in the viewport. Off-screen nodes are removed from the DOM and re-added when scrolled into view. This extends SVG performance to thousands of logical nodes while keeping hundreds of DOM elements.
3. **Canvas for overview, SVG for detail:** When zoomed out past a threshold, switch to a canvas "minimap" renderer for performance. When zoomed in, use SVG for interactivity. This is the pattern used by large-scale map applications.

**Phase to address:** Architecture phase. The rendering strategy must be decided before any renderer code is written.

---

### Pitfall 8: Coordinate Transform Bugs in Interactive Canvas

**What goes wrong:**
The interactive canvas has three coordinate spaces: screen space (mouse events), viewport space (after accounting for scroll), and graph space (after accounting for pan and zoom). Every interaction -- click, drag, hover, context menu -- must transform between these spaces correctly. The current code has a basic version of this (panX/panY/zoom applied to a CSS transform), but interactive editing requires the REVERSE transform: given a mouse click at screen position (X,Y), what graph node is at that position? This reverse transform must account for: scroll position, CSS transforms on parent elements, devicePixelRatio on high-DPI screens, and the render-time padding applied by the layout engine.

**Prevention:**
1. **Single source of truth for transforms:** Create a `ViewportTransform` class with `screenToGraph(x, y)` and `graphToScreen(x, y)` methods. ALL code that needs coordinate transforms uses this class. No ad-hoc `(x - panX) / zoom` calculations scattered across modules.
2. **Unit test the transforms:** Coordinate transforms are mathematically deterministic. Test them with known inputs/outputs at various zoom levels and pan positions, including edge cases (zoom < 1, negative pan, high-DPI displays).
3. **Use `getScreenCTM()` for SVG:** If using SVG rendering, the `getScreenCTM()` method provides the exact current transformation matrix. Use its inverse for screen-to-SVG coordinate conversion. This handles all parent transforms and scroll automatically.

**Phase to address:** First interaction feature. The transform class must exist before any hit testing or drag logic.

---

### Pitfall 9: Session Recording Blows Up Storage

**What goes wrong:**
Recording AI reasoning sessions (every diagram state, every interaction, timestamps) for replay features. A single AI agent session can produce 50-200 diagram updates over 5-30 minutes. If each update stores the full .mmd content (roughly 5-50KB depending on diagram complexity), a 30-minute session generates 1-10MB of recording data. Over a workday of active development, this accumulates to 50-100MB. Since the tool is local-first, this data lives on the developer's machine with no automatic cleanup.

**Prevention:**
1. **Delta storage:** Store only the diff between consecutive states, not full snapshots. Graph topology changes are typically small (1-5 node additions/modifications per update). A diff-based recording reduces storage by 90%+.
2. **Configurable retention:** Default to 7 days of recordings. Provide a `smartb cleanup` CLI command. Show storage usage in `smartb status`.
3. **Opt-in recording:** Do not record by default. Recording should be explicitly enabled per session. Most users want live visualization, not replay.
4. **Cap per session:** Maximum 1000 events per recording, maximum 10MB per recording file. Older events are evicted when the cap is reached.

**Phase to address:** When session recording is implemented. This is a later-phase concern, but the storage format design should be decided early.

---

### Pitfall 10: Feature Dependency Chains Create Unshippable Phases

**What goes wrong:**
Advanced observability features (ghost paths, AI breakpoints, heatmaps, session replay) each depend on a chain of prerequisites. Ghost paths require: layout engine (positions) + historical state storage + diff computation + semi-transparent rendering. AI breakpoints require: MCP bidirectional communication + session recording + breakpoint state management + resume protocol. If any link in the chain is missing, the feature is unshippable. Planning these as "Phase N: Add ghost paths, breakpoints, heatmaps, and replay" creates a phase that can never be completed because the prerequisites were not addressed in earlier phases.

**Prevention:**
1. **One feature per phase:** Each observability feature gets its own phase with explicit prerequisites listed.
2. **Prerequisites first, feature second:** A phase plan should read: "Phase N-1: Build the diff engine. Phase N: Add ghost paths using the diff engine." Not "Phase N: Build diff engine AND ghost paths."
3. **Vertical slices, not horizontal layers:** Instead of building all infrastructure then all features, build one complete vertical slice (e.g., "session recording for a single diagram" end-to-end) before expanding horizontally (multi-diagram recording, replay controls, sharing).
4. **Feature flags:** Advanced features ship behind flags. Users who do not need them never see them. This allows shipping incomplete-but-functional phases.

**Phase to address:** Roadmap planning. The phase structure must be designed around dependency chains, not feature groupings.

---

### Pitfall 11: VS Code Extension Diverges from Browser UI

**What goes wrong:**
The VS Code webview and the browser UI (live.html) share the same rendering and interaction code, but diverge as features are added to one but not the other. The canvas renderer works in the browser but breaks in the webview CSP. The drag interaction works in the browser but conflicts with VS Code's own drag handlers. The keyboard shortcuts work in the browser but clash with VS Code keybindings. Over time, the two UIs become separate products that must be maintained independently.

**Prevention:**
1. **Single rendering core:** The renderer must be a standalone module with NO DOM dependencies beyond what it is given. It receives a container element and renders into it. Both live.html and the VS Code webview provide the container.
2. **CSP-compatible from day one:** VS Code webviews enforce Content Security Policy. All rendering code must work with `nonce`-based CSP. No inline styles via `element.style.cssText = ...` (the current code does this extensively). No dynamic code evaluation.
3. **Keyboard shortcut abstraction:** Define shortcuts as a map (`{ "mod+z": "undo", "mod+shift+z": "redo" }`) that both environments interpret. The browser registers them directly. The VS Code extension registers them as `keybinding` contributions in package.json.
4. **Test in both environments:** Every interaction feature must be tested in both live.html and the VS Code webview. Add a CI step that loads the webview in a VS Code test harness.

**Phase to address:** Must be a constraint from the first line of new renderer code. Not something to "fix later."

---

## Minor Pitfalls

Issues that cause friction or minor bugs but are straightforward to fix.

---

### Pitfall 12: Hit Testing Complexity in Graph Rendering

**What goes wrong:**
Determining which node or edge the user clicked in a custom renderer. Nodes are rectangles (easy). But edges are curves (splines, beziers) -- testing if a click is "on" a curve requires distance-to-curve computation. Labels on edges need separate hit testing. Subgraph containers overlap with their children. The z-order of overlapping elements determines which one receives the click.

**Prevention:**
Use SVG-based rendering where hit testing is free (browser handles it via DOM events). If using Canvas, use a hidden "hit canvas" where each element is drawn with a unique color -- the color at the mouse position identifies the element. This is the standard technique used by Pixi.js, Konva.js, and Canvas-based map renderers.

**Phase to address:** Renderer implementation phase. This is a known-solved problem.

---

### Pitfall 13: Export Regression When Switching Renderers

**What goes wrong:**
SVG and PNG export currently work through Mermaid's rendered SVG (with a workaround for Canvas taint using `htmlLabels: false`). A custom renderer that does not produce SVG natively breaks export. Canvas-based renderers can export to PNG via `canvas.toBlob()` but not to SVG without a separate rendering path.

**Prevention:**
Maintain the ability to render to SVG even if the primary interactive renderer uses Canvas or a hybrid approach. The export path can use a non-interactive SVG renderer (headless Mermaid, or a dedicated SVG export function in the custom renderer).

**Phase to address:** Export must be explicitly tested after any renderer change. Add export regression tests.

---

### Pitfall 14: Mermaid Initialization Duplication

**What goes wrong:**
The current codebase has the Mermaid configuration duplicated 3 times in live.html (lines 712-741 for initial setup, lines 1281-1345 for PNG export with `htmlLabels: false`, and lines 1316-1407 for restore after export). Any change to theme or configuration must be applied in all three places. This is already a source of drift and will worsen when adding a second renderer.

**Prevention:**
Extract the Mermaid config into a single constant/module BEFORE adding any new rendering code. This is a 15-minute fix that prevents a class of subtle styling bugs.

**Phase to address:** Refactoring phase (first plan of v2).

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| live.html refactoring | Breaking existing features during split | Write comprehensive integration tests BEFORE splitting. Test every interaction (flag, search, collapse, export, file tree, editor, pan/zoom) |
| DOM abstraction layer | Abstraction too thin (leaky) or too thick (slow) | Define the interface from the consumer side (what do annotations, search, and collapse NEED?), not from the implementation side |
| Custom renderer MVP | Trying to match Mermaid styling exactly | Accept visual differences. The custom renderer should look BETTER, not identical. Do not waste weeks matching Mermaid's exact font metrics |
| ELK.js integration | Layout configuration paralysis (150+ options) | Start with the recommended 6-option config from Pitfall 4. Only add options when a specific layout problem is reported |
| Drag and drop | Drag interferes with pan (both use mousedown+mousemove) | Require a modifier key for drag (hold Shift to drag) or detect target first (drag on a node = move node, drag on background = pan). Do not make both use bare mousedown |
| Multi-select | Selection state management complexity | Start with single-select only. Multi-select (Shift+click, rubber band) is a separate phase. Attempting both at once doubles the interaction state machine |
| Session recording | Recording changes WebSocket message format | Keep recording as a DECORATOR on the existing WebSocket handler, not an inline modification. The recording layer wraps messages, the rendering layer is unaware of recording |
| AI breakpoints | Blocking AI agent execution from the browser | This requires bidirectional MCP communication (not currently supported -- MCP tools are request/response). Research MCP notifications/sampling before planning this feature |
| Ghost paths | Rendering semi-transparent "what could have been" paths | Requires the graph model to support multiple concurrent "versions" of the same subgraph. This is essentially a branch/merge data structure. Do not underestimate the data model complexity |
| Heatmap overlay | Performance of rendering heatmap on every frame | Pre-compute the heatmap as a static overlay image. Do not recalculate on every render. Update when underlying data changes, not when viewport changes |

## Existing Technical Debt Interaction

The v1 has specific technical debt that will interact dangerously with v2 features:

| Existing Debt | v2 Feature It Conflicts With | Resolution |
|--------------|------------------------------|------------|
| live.html at 1757 lines (3.4x limit) | Any new UI feature | MUST refactor before adding canvas code |
| 5 IIFE modules with `window.*` globals | Event bus / state management | Replace with ES modules during refactoring |
| Mermaid SVG DOM coupling in all interaction modules | Custom renderer | Build DOM abstraction layer first |
| Duplicate Mermaid configs (3 copies) | Renderer configuration | Extract to single config module |
| `innerHTML` usage in renderTree() and renderPanel() | Security / CSP in VS Code webview | Replace with DOM API calls |
| `renderFileList()` referenced at line 1649 but never defined (uses `renderTree()`) | Build errors after refactoring | Fix dead code before splitting |
| No client-side TypeScript | Type safety in complex interaction code | Migrate static/ to TypeScript as part of ES module migration |
| No client-side tests | Regression detection during refactoring | Write integration tests before any refactoring |

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Big bang renderer replacement | VERY HIGH | Revert to Mermaid, build abstraction layer, implement new renderer behind feature flag, migrate module by module |
| .mmd round-trip loss | HIGH | Design sidecar file format, migrate existing position data, update all save/load paths |
| Vanilla JS complexity explosion | HIGH | Introduce ES module bundler, migrate IIFE modules, build event bus -- essentially a rewrite of the client architecture |
| Layout engine blocking main thread | MEDIUM | Move to Web Worker -- requires serializing graph data across worker boundary but does not change the API surface |
| Undo/redo conflicts with AI updates | MEDIUM | Redesign undo stack with source tagging; requires touching all mutation paths but not the UI |
| live.html monolith | MEDIUM | Split into modules incrementally; requires comprehensive test coverage first to avoid regressions |
| VS Code / browser divergence | HIGH | Unify the rendering core -- may require rewriting VS Code webview if it diverged too far |

## Sources

### Rendering Performance and Architecture
- [SVG vs Canvas vs WebGL for Diagram Viewers (Medium, Dec 2025)](https://medium.com/@codetip.top/svg-vs-canvas-vs-webgl-for-diagram-viewers-tradeoffs-bottlenecks-and-how-to-measure-8cedbd3b7499) -- MEDIUM confidence
- [SVG versus Canvas: Which to Choose (JointJS)](https://www.jointjs.com/blog/svg-versus-canvas) -- MEDIUM confidence
- [Optimising HTML5 Canvas Rendering (AG Grid)](https://blog.ag-grid.com/optimising-html5-canvas-rendering-best-practices-and-techniques/) -- MEDIUM confidence
- [SVG vs Canvas Performance (Boris Smus)](https://smus.com/canvas-vs-svg-performance/) -- MEDIUM confidence

### Layout Engines
- [ELK.js GitHub Repository](https://github.com/kieler/elkjs) -- HIGH confidence (primary source)
- [ELK Layout Options Reference](https://eclipse.dev/elk/reference/options.html) -- HIGH confidence (official docs)
- [React Flow Layout Overview](https://reactflow.dev/learn/layouting/layouting) -- MEDIUM confidence
- [ELK.js with React Flow (Medium)](https://medium.com/@armanaryanpour/auto-layout-positioning-in-react-flow-using-elkjs-eclipse-layout-kernel-with-typescript-and-6389a2cc0119) -- MEDIUM confidence

### Undo/Redo Architecture
- [Undo, Redo, and the Command Pattern (esveo)](https://www.esveo.com/en/blog/undo-redo-and-the-command-pattern/) -- MEDIUM confidence
- [Designing a Lightweight Undo History with TypeScript (JitBlox)](https://www.jitblox.com/blog/designing-a-lightweight-undo-history-with-typescript) -- MEDIUM confidence
- [Intro to Undo/Redo Systems in JavaScript (Medium)](https://medium.com/fbbd/intro-to-writing-undo-redo-systems-in-javascript-af17148a852b) -- MEDIUM confidence

### Diagram Editor Libraries and Patterns
- [JavaScript SVG Diagram Editor (CodeX, Medium)](https://medium.com/codex/javascript-svg-diagram-editor-which-weighs-6-5-less-than-bootstrap-open-source-library-b753feaaf835) -- MEDIUM confidence
- [Top JavaScript Diagramming Libraries 2026 (JointJS)](https://www.jointjs.com/blog/javascript-diagramming-libraries) -- MEDIUM confidence
- [Mermaid.js Renderer Configuration](https://github.com/mermaid-js/mermaid/issues/2029) -- HIGH confidence (primary source)

### Feature Creep and Developer Tools
- [Feature Creep Is Killing Your Software (DesignRush)](https://www.designrush.com/agency/software-development/trends/feature-creep) -- MEDIUM confidence
- [Feature Creep Management (Tempo)](https://www.tempo.io/glossary/feature-creep) -- LOW confidence

### Refactoring and Technical Debt
- [Refactoring JavaScript Legacy Code (Delicious Brains)](https://deliciousbrains.com/refactoring-legacy-javascript/) -- MEDIUM confidence
- [How to Refactor Complex Codebases (freeCodeCamp)](https://www.freecodecamp.org/news/how-to-refactor-complex-codebases) -- MEDIUM confidence

### SmartB Diagrams Codebase Analysis
- Codebase inspection: `static/live.html` (1757 lines), `static/annotations.js` (421 lines), `static/diagram-editor.js` (403 lines), `static/collapse-ui.js` (290 lines), `static/search.js` (296 lines), `static/ws-client.js` (71 lines) -- HIGH confidence (primary source)
- Total static/ code: 3706 lines across 8 files
- All 5 IIFE modules use `window.*` global exports and `_initHooks` callback pattern
- Mermaid config duplicated 3 times in live.html

---
*Pitfalls research for: SmartB Diagrams v2 -- Interactive Canvas Renderer + Advanced AI Observability*
*Researched: 2026-02-15*
