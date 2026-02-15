# Feature Landscape: Interactive Canvas + AI Observability

**Domain:** Interactive diagram editor with AI reasoning observability
**Researched:** 2026-02-15
**Milestone:** v2 — Interactive Canvas Renderer + Advanced AI Observability
**Overall confidence:** MEDIUM — verified via official docs, competitor analysis, and multiple sources. AI observability visualization (Ghost Paths, Pattern Memory) are novel concepts with LOW confidence as no direct competitors exist.

## Context: What Exists vs What's New

SmartB v1 (already built) provides a Mermaid-based viewer with pan/zoom, flag annotations, node/edge editing via text manipulation, search, export, file tree, subgraph collapse/expand, WebSocket sync, and MCP tools. This research focuses exclusively on the NEW features needed for v2.

The v2 milestone has two pillars:
1. **Interactive Canvas** — transform from text-manipulation viewer to direct-manipulation editor
2. **AI Observability** — features that make AI reasoning transparent, replayable, and debuggable

---

## Table Stakes

Features users expect in an interactive canvas diagram editor. Missing = product feels incomplete compared to Excalidraw, draw.io, Mermaid Chart Visual Editor.

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|--------------|------------|--------------|-------|
| **Select nodes (click)** | Every canvas tool lets you click to select. Excalidraw, tldraw, Figma, draw.io all have this. Without selection, no other interaction is possible. | LOW | Existing SVG node ID extraction | Already have `extractNodeId()` in annotations.js. Need visual selection indicator (blue border/handles). |
| **Context menu (right-click)** | Standard in draw.io, GoJS, Konva, Syncfusion Diagram, Excalidraw. Right-click on a node shows actions (edit, delete, copy, add connection, change style). Users expect this from any visual editor. | MEDIUM | Node selection | Replace browser's default context menu. Items: Edit Label, Delete Node, Duplicate, Add Connection From/To, Change Color, Add Flag. GoJS and Konva both demonstrate custom context menus for canvas. |
| **Inline edit (double-click label)** | Excalidraw, Miro, draw.io all support double-click to edit text. Current `doEditNodeText()` uses `prompt()` dialog which is jarring. Inline editing feels native. | MEDIUM | Node selection | Create a contenteditable overlay positioned over the SVG node label. On blur/Enter, update .mmd content. Mermaid Chart Visual Editor already does this. |
| **Undo/Redo (Ctrl+Z / Ctrl+Shift+Z)** | Universal expectation. Every editor from Notepad to Excalidraw has undo/redo. Without it, users fear making changes because they can't revert. Excalidraw completely rebuilt their undo/redo manager in 2024 for better granularity. | HIGH | All edit operations | Two patterns: Command Pattern (store each operation + inverse) or Memento Pattern (store full state snapshots). Memento is simpler for Mermaid text content because state is just a string. Store history as string[] with pointer. Cap at ~100 entries. Pause history during drag operations (mousedown to mouseup = one undo entry). |
| **Copy/Paste/Duplicate (Ctrl+C/V/D)** | Standard in all editors. Circuit Diagram, BeeGraphy, Visual Paradigm all support Ctrl+C/V on nodes. Users expect to duplicate a node with its label and style. | MEDIUM | Node selection, Undo/Redo | Copy = serialize selected node(s) to clipboard (Mermaid text fragment). Paste = insert at cursor position or offset from original. Duplicate (Ctrl+D) = paste immediately with offset. Must generate new node IDs (already have `generateNodeId()`). |
| **Keyboard shortcuts for edit actions** | Delete key to remove selected node. Escape to deselect. Ctrl+A to select all. These are table stakes in every canvas editor. | LOW | Node selection | Extend existing keyboard handler. Map: Delete/Backspace = remove, Escape = deselect, Ctrl+A = select all (for future multi-select). |

**Confidence:** HIGH — verified across Excalidraw, tldraw, draw.io, Konva, GoJS documentation and feature sets.

---

## Differentiators

Features that set SmartB apart from generic diagram editors and existing AI observability tools.

### Canvas Differentiators

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|--------------|-------|
| **Property Panel (right sidebar)** | Inspect and modify selected node properties: color, shape, label, status. Like Figma's Properties Panel or Excalidraw's right sidebar. No Mermaid editor offers this. Current SmartB only has a Flags panel. | HIGH | Node selection | Sections: Identity (ID, label), Appearance (fill color, border color, shape), Status (ok/problem/in-progress/discarded), Connections (list of edges from/to). Uses Mermaid `style` directives and `classDef` for colors. Shape changes require rewriting node definition syntax (`[]` vs `()` vs `{}` vs `>]`). |
| **Drag nodes to reposition** | Mermaid uses automatic layout (dagre/ELK). Dragging nodes is the #1 requested feature on mermaid-live-editor (Issue #1284, #1507). Mermaid Chart Visual Editor partially supports this. No open-source Mermaid tool does it well. | VERY HIGH | Node selection | **Critical constraint:** Mermaid's layout engine recalculates positions on every render. Dragged positions would reset on next render. Solutions: (1) Store position overrides in `%% @position NodeId x y` annotations and apply CSS transforms post-render, (2) Use Mermaid's ELK layout with position hints, (3) Abandon Mermaid rendering and use a custom renderer. Option 1 is recommended — keeps Mermaid as source of truth while allowing visual overrides. |
| **Multi-select and group operations** | Select multiple nodes (Shift+click or drag-select) and move/delete/style them together. Excalidraw and draw.io both have this. Important for large diagrams. | HIGH | Node selection, Property Panel | Requires selection rectangle (rubber band). All selected nodes highlighted. Property Panel shows shared properties when multi-selected. Group operations: delete all, change color of all, move all. |
| **Folder management (rename/delete folders)** | Current sidebar has file create/delete/rename but no folder rename/delete. Users expect full CRUD on the file tree. | LOW | Existing file tree | Add right-click context menu to folder headers. Server needs `/rmdir` and `/rename-folder` endpoints. Recursive delete with confirmation. |

### AI Observability Differentiators

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|--------------|-------|
| **AI Breakpoints** | Developer sets a "breakpoint" on a node. When AI reaches that node (sets its status to in-progress), the system pauses AI execution and notifies the developer. Like debugger breakpoints but for AI reasoning. **No existing tool does this.** LangSmith shows traces but cannot pause execution. Cursor shows reasoning but you cannot stop it mid-flow. | HIGH | MCP tools, Node status system | Requires new annotation `%% @breakpoint NodeId`. New MCP tool `check_breakpoints()` that AI calls before proceeding — returns "pause" if current node has a breakpoint. Needs WebSocket notification to browser: "Breakpoint hit on node X." Developer reviews, then clicks "Continue" to unset breakpoint and allow AI to proceed. The AI must cooperate by calling `check_breakpoints()` — requires prompt engineering in the AI agent conventions. |
| **Ghost Paths (discarded reasoning branches)** | Show AI's discarded reasoning paths as faded/dashed nodes alongside the chosen path. Like a "deleted scenes" view for AI thinking. When AI explores option A and option B but picks A, option B appears as a ghost path. **Novel concept — no competitor offers this.** LangSmith shows only the taken path. | HIGH | MCP tools, Custom rendering | AI agent calls `update_diagram` with discarded branches marked with `%% @status NodeId discarded`. Ghost paths rendered with 30% opacity and dashed borders (already have `discarded` status with gray color — extend with opacity). Add toggle button "Show/Hide Ghost Paths" to filter discarded nodes. Key insight: the AI must emit alternative branches explicitly — requires convention where AI writes all considered options to the diagram, not just the chosen one. |
| **Risk Heatmap** | Color-code diagram nodes by risk level — red for high-risk steps (API calls, data mutations, complex logic), yellow for medium, green for safe. AI agent annotates risk via `%% @risk NodeId high|medium|low "reason"`. Overlay as gradient backgrounds. Similar to security risk heatmaps but applied to AI reasoning steps. | MEDIUM | MCP tools, Annotation system | New annotation type. Server parses `@risk` annotations. Browser renders as background gradient: red (#ef4444 at 20% opacity) for high, yellow (#eab308 at 15%) for medium, green default. Risk reasons shown in tooltip on hover. MCP tool `set_risk_level(nodeId, level, reason)`. Risk panel in sidebar lists all high-risk nodes. |
| **Session Replay** | Record diagram evolution over time and play it back. Developer sees "at 10:05 AI added step X, at 10:06 AI changed Y to Z, at 10:07 developer flagged Z." Like Datadog Session Replay but for diagram evolution. LogRocket and CubeAPM show that session replay with timeline scrubbing is the gold standard for understanding temporal behavior. | VERY HIGH | WebSocket events, State history | Capture every diagram state change as a timestamped snapshot. Store in memory (ring buffer, last N states) or persist to `.smartb/history/`. UI: timeline scrubber at bottom of canvas. Playback speed control (1x, 2x, 4x). Diff highlighting between frames (green = added, red = removed, yellow = modified). ~72% of enterprises now use session replay for debugging (2025 market data). |
| **Pattern Memory** | SmartB recognizes recurring diagram patterns across sessions. "Last 3 times the AI hit a 'Parse Config' step, the developer flagged it. Suggesting pre-emptive flag." Learns from developer feedback history. | VERY HIGH | Flag history, Local storage/file persistence | Store flag history in `.smartb/patterns.json`: `{ nodeLabel: "Parse Config", flagCount: 3, lastFlag: "...", suggestedAction: "..." }`. Pattern matching: fuzzy match node labels across sessions. UI: warning icon on nodes matching flagged patterns, with tooltip "This pattern was flagged 3 times before." MCP tool `get_patterns()` returns learned patterns to AI for self-correction. **Novel — no competitor has this.** |
| **Diagram as Executable Contract** | Define expected states and transitions in the diagram, then validate AI execution against them. Diagram becomes a spec that the AI must follow. If AI deviates, SmartB flags the deviation automatically. Like Pact contract testing but for AI reasoning flow. | VERY HIGH | MCP tools, Validation engine | New annotation `%% @expect NodeId status:ok after:NodeX`. Validation engine checks: did node X complete before node Y? Did all expected nodes reach expected status? Deviations shown as red borders with "Expected: ok, Got: problem." Export contract as JSON for CI/CD validation. Specmatic and Pact show this pattern works for APIs — apply to AI reasoning. |

**Confidence:**
- Canvas differentiators: MEDIUM (based on competitor analysis of Excalidraw, draw.io, Mermaid Chart)
- AI Breakpoints: LOW (novel concept, no competitor to reference)
- Ghost Paths: LOW (novel concept, must validate with users)
- Risk Heatmap: MEDIUM (risk heatmap pattern well-established in security/business; novel for AI reasoning)
- Session Replay: MEDIUM (session replay well-established in web observability; novel for diagram editors)
- Pattern Memory: LOW (novel concept, requires ML-like pattern matching)
- Executable Contract: LOW (contract testing well-established for APIs; novel for AI reasoning diagrams)

---

## Anti-Features

Features to explicitly NOT build in v2. Builds on v1 anti-features list.

| Anti-Feature | Why Tempting | Why Avoid | What to Do Instead |
|--------------|-------------|-----------|-------------------|
| **Full drag-to-position with layout persistence** | "I want to drag nodes freely like Excalidraw." | Mermaid recalculates layout on every render. Persisting positions means fighting the layout engine. This is why mermaid-live-editor Issue #1284 has been open since 2022 with no solution. Building a custom renderer to replace Mermaid is a 6-month project. | Use position annotations (`%% @position`) as CSS transform overrides post-render. Accept that positions reset when Mermaid content changes substantially. This is good enough for "nudge this node over" without rebuilding the renderer. |
| **Collaborative real-time editing (multi-cursor)** | "Two people editing the same diagram simultaneously." | Requires OT/CRDT for conflict resolution on .mmd text. Adds tremendous complexity. Figma and tldraw have hundreds of engineers working on this. | Diagrams live in git. Use VS Code Live Share for real-time collaboration. SmartB's WebSocket already syncs view state — both users see the same diagram, just can't edit simultaneously. |
| **Custom node shapes beyond Mermaid syntax** | "I want star-shaped nodes, custom SVGs, icon-in-node." | Breaks Mermaid compatibility. Custom shapes cannot be represented in .mmd text. Creates a proprietary format that doesn't work in other Mermaid tools. | Support all Mermaid-native shapes (rectangle, rounded, stadium, subroutine, cylinder, circle, diamond, hexagon, parallelogram, trapezoid). These cover all practical use cases. |
| **AI model integration (embedding AI calls)** | "SmartB should call the AI directly to auto-fill diagrams." | SmartB is an observability layer, not an AI agent. Calling AI models adds API key management, cost tracking, model selection UI. Competes with Cursor/Claude Code on their turf. | MCP is the integration layer. AI tools call SmartB, not the other way around. SmartB observes and enables feedback, it does not orchestrate AI execution. |
| **Complex animation/transition system** | "Animate node state changes with smooth transitions." | SVG animation in Mermaid-rendered diagrams is fragile. Mermaid re-renders the entire SVG on changes, destroying animation state. Complex animations add performance overhead. | Use simple CSS transitions for selection highlights, hover effects, and opacity changes (ghost paths). Animate only the overlay layer, not the Mermaid SVG itself. |
| **Database/backend persistence** | "Store diagram history in SQLite/PostgreSQL." | Adds database dependency to a local-first tool. Violates the "zero infrastructure" principle. Makes installation heavier. | Use file-based persistence: `.mmd` files for diagrams, `.smartb/history/` directory for session replay snapshots, `patterns.json` for pattern memory. All git-friendly, all local. |

---

## Feature Dependencies

```
[Node Selection System] (new)
    |
    |--required-by--> [Context Menu]
    |--required-by--> [Property Panel]
    |--required-by--> [Inline Edit]
    |--required-by--> [Copy/Paste/Duplicate]
    |--required-by--> [Multi-Select]
    |--required-by--> [Drag to Reposition]
    |--required-by--> [Keyboard Delete]

[Undo/Redo System] (new)
    |--required-by--> [All edit operations must be undoable]
    |--requires--> [Centralized edit pipeline] (refactor applyEdit())

[Context Menu] (new)
    |--enhances--> [Existing flag popover actions]
    |--enhances--> [Existing editor popover actions]

[Property Panel] (new)
    |--requires--> [Node Selection System]
    |--requires--> [Mermaid style directive generation]
    |--extends--> [Existing Flag Panel]

[AI Breakpoints] (new)
    |--requires--> [Existing annotation system (%% @flag)]
    |--requires--> [Existing MCP tools]
    |--requires--> [WebSocket notification system]

[Ghost Paths] (new)
    |--requires--> [Existing status system (%% @status)]
    |--requires--> [CSS opacity/dash rendering]
    |--requires--> [Toggle visibility UI]

[Risk Heatmap] (new)
    |--requires--> [New annotation type (%% @risk)]
    |--requires--> [Existing MCP tools (new tool)]
    |--requires--> [SVG post-processing (background colors)]

[Session Replay] (new)
    |--requires--> [State history capture]
    |--requires--> [Timeline scrubber UI]
    |--requires--> [Diff highlighting engine]
    |--blocked-by--> [Undo/Redo] (same state history mechanism)

[Pattern Memory] (new)
    |--requires--> [Flag history persistence]
    |--requires--> [Fuzzy label matching]
    |--requires--> [New MCP tool]

[Executable Contract] (new)
    |--requires--> [New annotation type (%% @expect)]
    |--requires--> [Validation engine]
    |--requires--> [Deviation visualization]
    |--blocked-by--> [Risk Heatmap] (shares annotation infrastructure)

[Folder Management] (new)
    |--extends--> [Existing file tree sidebar]
    |--requires--> [New server endpoints]
```

### Critical Path

The dependency chain reveals a clear build order:

1. **Node Selection System** unlocks all canvas interactions
2. **Undo/Redo System** must exist before shipping any destructive edit operation
3. **Context Menu + Inline Edit** are the highest-impact canvas features with moderate complexity
4. **Property Panel** is complex but transformative for usability
5. **AI Breakpoints + Ghost Paths** are the AI observability quick wins (extend existing annotation system)
6. **Session Replay** is the most complex feature and should come last

---

## MVP Recommendation (v2)

### Phase A: Canvas Foundation (must ship first)

1. **Node selection with visual feedback** — blue border, handles on corners
2. **Undo/Redo system** — Memento pattern with string[] history
3. **Context menu** — right-click with Edit/Delete/Duplicate/Flag/Connect actions
4. **Inline edit** — double-click to edit label in-place
5. **Copy/Paste/Duplicate** — Ctrl+C/V/D with generated IDs
6. **Folder management** — rename/delete folders in sidebar

### Phase B: Property Panel + Polish

7. **Property Panel** — right sidebar with color/shape/status controls
8. **Multi-select** — Shift+click and rubber-band selection
9. **Keyboard delete** — Delete/Backspace removes selected nodes

### Phase C: AI Observability Layer

10. **AI Breakpoints** — pause AI execution at flagged nodes
11. **Ghost Paths** — show discarded reasoning branches at reduced opacity
12. **Risk Heatmap** — color-code nodes by risk level

### Phase D: Advanced Observability

13. **Session Replay** — timeline scrubber for diagram evolution
14. **Pattern Memory** — learn from repeated flags
15. **Executable Contract** — validate AI execution against diagram spec

### Defer to v3+

- Drag-to-reposition (requires Mermaid layout override system)
- Multi-cursor collaboration
- Custom shapes beyond Mermaid syntax

---

## Complexity Assessment

| Feature | Estimated Effort | Risk Level | Notes |
|---------|-----------------|------------|-------|
| Node Selection | 1-2 days | Low | Extend existing extractNodeId() |
| Context Menu | 2-3 days | Low | Replace popover system |
| Inline Edit | 2-3 days | Medium | Overlay positioning tricky with zoom/pan |
| Undo/Redo | 3-4 days | Medium | Must integrate with all edit paths |
| Copy/Paste/Duplicate | 2-3 days | Low | String manipulation, ID generation |
| Property Panel | 5-7 days | High | Mermaid style syntax is complex |
| Multi-Select | 3-4 days | Medium | Rubber band + batch operations |
| Folder Management | 1-2 days | Low | Server endpoints + tree UI |
| AI Breakpoints | 4-5 days | High | MCP cooperation model is novel |
| Ghost Paths | 3-4 days | Medium | CSS overlay + toggle |
| Risk Heatmap | 3-4 days | Medium | New annotation + SVG processing |
| Session Replay | 8-12 days | Very High | State capture + timeline UI + diff engine |
| Pattern Memory | 5-7 days | High | Fuzzy matching + persistence |
| Executable Contract | 7-10 days | Very High | Validation engine + deviation UI |

**Total estimated effort:** 49-70 developer-days for all features.

---

## Competitor Feature Matrix (v2 scope)

### Canvas Editors

| Feature | Excalidraw | draw.io | Mermaid Chart Visual | tldraw | SmartB v2 |
|---------|-----------|---------|---------------------|--------|-----------|
| Select/click nodes | Yes | Yes | Yes | Yes | **Planned** |
| Drag to reposition | Yes | Yes | Partial | Yes | Deferred (v3) |
| Context menu | Yes | Yes | No | Yes | **Planned** |
| Inline text edit | Yes | Yes | Yes | Yes | **Planned** |
| Property panel | Yes (right sidebar) | Yes (right panel) | No | Yes | **Planned** |
| Undo/Redo | Yes (rebuilt 2024) | Yes | No | Yes | **Planned** |
| Copy/Paste | Yes | Yes | No | Yes | **Planned** |
| Multi-select | Yes | Yes | No | Yes | **Planned** |
| Export SVG/PNG | Yes | Yes | Yes | Yes | Already built |
| Real-time sync | Yes (Excalidraw+) | No | No | Yes | Already built |

### AI Observability

| Feature | LangSmith | Langfuse | Datadog APM | Weights & Biases | SmartB v2 |
|---------|-----------|---------|-------------|------------------|-----------|
| Trace visualization | Tree/waterfall | Tree/waterfall | Flamegraph | Tree | **Flowchart diagram** |
| Execution replay | Yes (trace replay) | Yes | Yes (session replay) | No | **Planned (timeline scrubber)** |
| Developer intervention | No (read-only) | No (read-only) | No (read-only) | No (read-only) | **Yes (flags + breakpoints)** |
| Risk assessment | No | No | Error tracking | No | **Planned (heatmap)** |
| Discarded paths | No | No | No | No | **Planned (ghost paths)** |
| Pattern learning | No | Partial (eval suites) | Anomaly detection | Experiment tracking | **Planned (pattern memory)** |
| Contract validation | No | No | SLOs | No | **Planned (executable contract)** |
| Local-first | No (cloud) | Self-host option | No (cloud) | No (cloud) | **Yes (always local)** |
| Open integration | SDK lock-in | OpenTelemetry | Proprietary | SDK | **MCP (open standard)** |

### Key Competitive Insight (v2)

SmartB v2's unique position intensifies: it is the **only tool** that combines:
1. **Direct manipulation** of AI reasoning diagrams (not just viewing traces)
2. **Bidirectional feedback** that the AI can read and act on (breakpoints, flags)
3. **Temporal analysis** of how reasoning evolved (session replay, not just final state)
4. **Pattern learning** from developer corrections (no competitor does this)
5. **Local-first** with open integration (MCP, not proprietary SDK)

The closest competitor in the canvas editing space is Mermaid Chart Visual Editor, but it has no AI observability features. The closest competitor in AI observability is LangSmith, but it has no direct-manipulation editor and is read-only.

---

## User Behavior Expectations

### Canvas Interactions (based on Excalidraw/draw.io conventions)

| Action | Expected Behavior | Notes |
|--------|-------------------|-------|
| Click node | Select node, show handles | Deselect previous |
| Shift+Click node | Add to selection | Multi-select |
| Click empty space | Deselect all | Standard |
| Double-click node | Enter inline edit mode | Or open property panel |
| Right-click node | Show context menu | Edit, Delete, Duplicate, Flag, Connect |
| Right-click empty space | Show canvas context menu | Add Node, Paste, Fit to View |
| Ctrl+Z | Undo last action | Works globally |
| Ctrl+Shift+Z | Redo | Or Ctrl+Y |
| Ctrl+C | Copy selected node(s) | To internal clipboard |
| Ctrl+V | Paste copied node(s) | With offset and new IDs |
| Ctrl+D | Duplicate selected | Same as copy+paste |
| Delete / Backspace | Remove selected node(s) | With edges |
| Escape | Exit current mode / deselect | Cancel any operation |

### AI Observability Interactions

| Action | Expected Behavior | Notes |
|--------|-------------------|-------|
| Click breakpoint icon | Toggle breakpoint on node | Visual indicator (red circle like IDE debuggers) |
| AI hits breakpoint | Notification bar appears at top | "Breakpoint hit: Node X. [Continue] [Step] [Remove]" |
| Toggle ghost paths | Show/hide discarded branches | Toggle in toolbar |
| Hover risk node | Show risk tooltip with reason | "High risk: External API call to payment gateway" |
| Drag timeline scrubber | Diagram updates to historical state | Frame-by-frame or continuous |
| Click pattern warning | Show pattern history | "Flagged 3 times. Last flag: 'Wrong config format'" |

---

## Sources

### Canvas Editors
- [Excalidraw GitHub](https://github.com/excalidraw/excalidraw) — HIGH confidence
- [Excalidraw Keyboard Shortcuts](https://csswolf.com/excalidraw-keyboard-shortcuts-pdf/) — MEDIUM confidence
- [Excalidraw 2024 Changelog](https://plus.excalidraw.com/blog/excalidraw-in-2024) — HIGH confidence
- [tldraw Docs](https://tldraw.dev/) — HIGH confidence
- [Konva.js Canvas Context Menu](https://konvajs.org/docs/sandbox/Canvas_Context_Menu.html) — HIGH confidence
- [Konva.js Select and Transform](https://konvajs.org/docs/select_and_transform/Basic_demo.html) — HIGH confidence
- [GoJS Custom Context Menu](https://gojs.net/latest/samples/customContextMenu.html) — HIGH confidence
- [Mermaid Chart Visual Editor Announcement](https://docs.mermaidchart.com/blog/posts/mermaid-chart-releases-new-visual-editor-for-flowcharts) — MEDIUM confidence
- [Mermaid Live Editor Drag Issues (#1284, #1507)](https://github.com/mermaid-js/mermaid-live-editor/issues/1284) — HIGH confidence
- [Mermaid Node Positioning Limitation (#270)](https://github.com/mermaid-js/mermaid/issues/270) — HIGH confidence

### Property Panel UX
- [How to Design Properties Panel — UX Planet](https://uxplanet.org/how-to-design-properties-panel-4d562cc47da3) — MEDIUM confidence
- [BPMN.js Properties Panel](https://www.npmjs.com/package/bpmn-js-properties-panel) — HIGH confidence

### Undo/Redo Patterns
- [Konva.js Undo/Redo with React](https://konvajs.org/docs/react/Undo-Redo.html) — HIGH confidence
- [Undo/Redo in Multiplayer — Liveblocks](https://liveblocks.io/blog/how-to-build-undo-redo-in-a-multiplayer-environment) — MEDIUM confidence
- [Command Pattern vs Memento for Undo](https://codinghelmet.com/articles/does-the-command-pattern-require-undo) — MEDIUM confidence
- [Writing Undo/Redo Systems in JavaScript](https://medium.com/fbbd/intro-to-writing-undo-redo-systems-in-javascript-af17148a852b) — MEDIUM confidence

### AI Observability
- [LLM Observability Tools 2026](https://research.aimultiple.com/llm-observability/) — MEDIUM confidence
- [Best AI Observability Platforms 2025](https://www.comet.com/site/blog/llm-observability-tools/) — MEDIUM confidence
- [15 AI Agent Observability Tools 2026](https://research.aimultiple.com/agentic-monitoring/) — MEDIUM confidence
- [Agent Tracing for Debugging — Maxim](https://www.getmaxim.ai/articles/agent-tracing-for-debugging-multi-agent-ai-systems/) — MEDIUM confidence
- [Datadog Session Replay](https://www.datadoghq.com/knowledge-center/session-replay/) — HIGH confidence
- [Session Replay Monitoring Tools 2025](https://cubeapm.com/blog/top-session-replay-monitoring-tools/) — MEDIUM confidence

### Risk Heatmaps
- [Risk Heat Map Guide — Creately](https://creately.com/guides/risk-heat-map/) — MEDIUM confidence
- [Risk Heat Map — MetricStream](https://www.metricstream.com/learn/risk-heat-map.html) — MEDIUM confidence

### Mermaid Constraints
- [Mermaid Layout Engines — DeepWiki](https://deepwiki.com/mermaid-js/mermaid/2.3-diagram-types-detection) — MEDIUM confidence
- [Mermaid ELK Layout Positioning (#5420)](https://github.com/mermaid-js/mermaid/issues/5420) — HIGH confidence

---
*Feature research for: Interactive Canvas + AI Observability (v2 milestone)*
*Researched: 2026-02-15*
