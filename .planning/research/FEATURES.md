# Feature Landscape

**Domain:** AI Observability Tool -- Bug Fixes & Usability (v2.1)
**Researched:** 2026-02-19
**Previous:** v2.0 features research (2026-02-15) covered the full interactive canvas + AI observability vision. This v2.1 research focuses ONLY on bug fixes and usability improvements for existing features.

---

## Table Stakes

Features that are broken or missing, making existing capabilities feel incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Ghost path persistence | Users expect data to survive server restart. Ghost paths vanish on restart because they are only in `GhostPathStore` (in-memory Map). | Low | Extend existing annotation system with `%% @ghost` format |
| Write safety for `/save` | Browser saves via `/save` endpoint bypass `DiagramService.withWriteLock()`. Concurrent MCP writes can corrupt files. | Low | 3-line fix: route `/save` through `service.writeDiagram()` |
| CSS under 500 lines | Project rule: no file > 500 lines. `main.css` is at 577 lines. | Low | Extract 3 component CSS files following established pattern |
| Ghost paths load on file open | When opening a diagram, ghost paths from annotations should render immediately, not wait for MCP to re-record them. | Low | Parse `@ghost` from annotation block on file read, populate cache |
| Ghost path individual delete | Every graph editor (React Flow, Cytoscape, draw.io) lets users delete individual edges. Bulk "clear all" without individual delete violates baseline expectation. | Low | REST endpoint + store method + X button per ghost path in list |
| Ghost path list/panel | When ghost paths exist, users need a list view (not just SVG overlay). draw.io Layers panel, Figma layers panel, SmartB's own Flags Panel all establish this pattern. | Low | Follows existing flag panel pattern. Show from->to, label, delete button per row |
| Heatmap manual mode toggle | Hotjar, Contentsquare, FullStory all provide explicit mode switching (click/scroll/move tabs). Current auto-detect mode selection is confusing and uncontrollable. | Low | Two buttons or dropdown: "Risk" / "Frequency" in the heatmap UI |
| Heatmap file switch refresh | When user switches files, heatmap must update. Hotjar and Contentsquare auto-update on page navigation. Current code only fetches on `init()`. | Low | Listen for `file:changed` event, refetch `/api/heatmap/:newFile` |
| Heatmap empty state messaging | When toggled on with zero data, showing nothing is confusing. Hotjar shows "No data yet -- add tracking snippet." Contentsquare shows "Waiting for data." | Low | Toast or legend message explaining why no data exists and how to get it |
| MCP read access for ghost paths | AI creates ghost paths but cannot query them. Breaks the feedback loop. Existing MCP tools for flags have both `set_flag` and `get_flags`. Ghost paths need `list_ghost_paths`. | Low | New MCP tool following existing pattern |

## Differentiators

Features that improve the experience beyond fixing what is broken.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Automatic heatmap tracking | Heatmap works without MCP sessions -- tracks user browsing (clicks, hovers, viewport) automatically. Follows Contentsquare/Hotjar "auto-capture" philosophy: zero-setup data collection. | Medium | New `interaction-tracker.js` module, new POST endpoint, `IntersectionObserver` + batched flush |
| Merged heatmap data | Browser interactions + MCP session visits combined in same heatmap view | Medium | Merge counts from new `.smartb/heatmap.json` with session JSONL data |
| Ghost path management from UI | Delete individual ghost paths via context menu (currently only "clear all" exists) | Low | Add DELETE endpoint with `fromNodeId`+`toNodeId`, context menu item |
| Heatmap data persisted per file | Heatmap counts survive server restart (currently only session-based, explicit MCP recording) | Low | Store browser interaction counts in `.smartb/heatmap.json` |
| Ghost path context menu creation | Replace modal with right-click "Add Ghost Path From Here" -> click target. draw.io, React Flow, Cytoscape all use context menu for adding edges. | Medium | Extends existing context menu system |
| Ghost path promotion to real edge | User sees a useful ghost path, clicks "Promote to Edge" to make it real in the .mmd file. Inverse of draw.io "hide layer." Unique to SmartB. | Medium | Combines ghost delete + MmdEditor edge creation |
| Ghost path reason field | AI includes WHY a path was discarded: "Rejected: API rate limits." Shown as tooltip. Braintrust captures reasoning tokens; SmartB shows reasoning for the road NOT taken. | Low | MCP tool schema extension + tooltip UI |
| Heatmap real-time WebSocket updates | When AI records steps mid-session, heatmap updates live. `session:event` WS message already exists but heatmap ignores it. FullSession emphasizes real-time heatmaps. | Low | WS listener in heatmap.js for `session:event` messages |
| Cumulative heatmap with time windows | "Last hour / Last day / All time" selector. Datadog continuous profiler pattern. The longer the tool runs, the more valuable the heatmap. | Medium | Query changes + time range UI in legend |

## Anti-Features

Features to explicitly NOT build in this milestone.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Full analytics dashboard | Scope creep -- this is a bug-fix milestone | Keep heatmap as toggle overlay on diagram |
| Ghost path editing (change label/endpoints) | Ghost paths are AI-generated metadata, not user-editable content | Allow delete only; AI re-records if needed |
| Real-time collaboration locking | Single-user tool (local-first). Write lock is for MCP+browser concurrency | Keep single-process promise-chain serialization |
| CSS preprocessor (Sass/SCSS) | No build pipeline for static assets, adding one is scope creep | Plain CSS file splitting (existing pattern) |
| Heatmap export (CSV/PDF) | Not requested, adds complexity | Heatmap is visual overlay only |
| Ghost path animation (flowing dashes) | Nice-to-have, not a bug fix | Keep current static dashed rendering. Use CSS `transition: opacity 0.3s` for toggle only |
| simpleheat canvas overlay | Previous v2.0 research recommended this. For v2.1, the existing node-fill-based heatmap works fine. | Keep current `applyFrequencyHeatmap()` in heatmap.js |
| Drag-to-create ghost paths | Conflicts with pan/zoom drag behavior. Cytoscape edge-editing extension shows this requires significant implementation effort. | Use context menu: right-click -> "Add Ghost Path" -> click target |
| Ghost path branching tree view | Requires separate layout algorithm. Visual complexity overwhelming. iToT shows tree views need dedicated space. | Ghost paths render as individual dashed curves. For complex analysis, use session replay |
| Heatmap snapshot comparison | Requires dedicated side-by-side UI. Contentsquare "compare journeys" is a major feature on its own. | Defer to v2.2+ |
| Full session auto-start | Creates excessive JSONL files for one-off MCP interactions | Auto-track via diagram diffs without formal sessions |
| Heatmap on non-flowchart diagrams | Custom renderer only handles flowcharts. Mermaid SVG structure is unpredictable. | Show "Heatmap not available for this diagram type" |

## Feature Dependencies

```
@ghost annotation parsing --> Ghost path persistence (file read/write)
Ghost path persistence --> Ghost paths load on file open (initial population)
Ghost paths load on file open --> Ghost path management from UI (can delete persisted paths)
Ghost path persistence --> MCP list_ghost_paths tool (can read persisted paths)
Ghost path management from UI --> Ghost path promotion to real edge (requires individual delete)

Existing context menu --> Ghost path context menu creation (extends context menu)
Node selection --> Ghost path context menu creation (right-click on selected node)

Write lock for /save --> (independent, no deps)

interaction-tracker.js --> POST /api/heatmap/:file endpoint (server must accept counts)
POST /api/heatmap/:file --> mergeHeatmapCounts() in SessionStore (persist counts)
mergeHeatmapCounts() --> Merged heatmap data (combine with MCP session data)

Heatmap mode toggle --> (independent, no deps)
Heatmap file switch refresh --> (independent, no deps)
Heatmap empty state messaging --> (independent, no deps)
Heatmap real-time WS updates --> Heatmap file switch refresh (must handle current file context)

CSS splitting --> (independent, no deps)
```

### Critical Path: Two Independent Tracks

**Track 1: Ghost Paths (sequential)**
1. Persistence (`@ghost` annotations) -- unlocks everything
2. Individual delete + list panel -- makes management usable
3. MCP read tool -- closes AI feedback loop
4. Context menu creation -- improves creation UX
5. Promotion to real edge -- advanced differentiator

**Track 2: Heatmap (mostly parallel)**
1. Mode toggle + file switch refresh -- independent quick fixes
2. Empty state messaging -- independent quick fix
3. Real-time WebSocket updates -- extends existing infra
4. Auto-tracking via interaction-tracker.js -- most complex, biggest impact

Tracks can execute in parallel with no cross-dependencies.

## MVP Recommendation

### Priority 1: Fix the Broken (must ship)

1. **CSS splitting** -- Zero risk, immediate compliance with 500-line rule
2. **Write safety for `/save`** -- Critical bug fix, 3-line change
3. **Ghost path persistence (`@ghost` annotations)** -- Core feature fix
4. **Ghost paths load on file open** -- Natural completion of persistence
5. **Ghost path individual delete + list panel** -- Basic management
6. **Heatmap mode toggle** -- Manual risk/frequency switching
7. **Heatmap file switch refresh** -- Eliminate stale data
8. **Heatmap empty state messaging** -- Explain missing data

### Priority 2: Close the Feedback Loop (should ship)

9. **MCP `list_ghost_paths` tool** -- AI reads its own discarded paths
10. **Ghost path context menu creation** -- Replace broken modal
11. **Heatmap real-time WebSocket updates** -- Live frequency updates
12. **Ghost path reason field** -- AI explains discarded paths

### Priority 3: Differentiate (nice to have)

13. **Ghost path promotion to real edge** -- Rescue discarded ideas
14. **Automatic heatmap tracking** -- Zero-setup frequency data
15. **Merged heatmap data** -- Browser + MCP data combined
16. **Cumulative heatmap with time windows** -- Historical analysis

---

## Ecosystem Research: How Similar Tools Handle These Patterns

### Ghost Path / Alternative Path Visualization in the Ecosystem

SmartB's ghost paths are genuinely novel -- no production tool shows "roads not taken" as a first-class overlay concept. The closest analogies come from four different domains:

**1. draw.io Layers (Toggle Visibility of Element Groups)**
draw.io uses layers to organize and toggle groups of diagram elements. Users click an eye icon in the Layers panel to show/hide. Layers support custom link actions (`toggle` JSON) and tag-based cross-layer visibility. The annotation layer pattern (put docs on a hidden layer) directly maps to SmartB's ghost path toggle. Key UX patterns: eye icon toggle, per-layer CRUD, lock/unlock.
Source: [draw.io Interactive Layers](https://www.drawio.com/blog/interactive-diagram-layers)

**2. React Flow / Cytoscape Edge Management**
React Flow supports deleting edges via `onReconnectEnd` (drag edge to empty space). Context menus via `onNodeContextMenu` show "duplicate/delete" actions. Undo/redo via snapshot-based `useUndoRedo` hook (Ctrl+Z / Ctrl+Shift+Z). Cytoscape's `cytoscape-edge-editing` extension adds context menu items for "Add Bend Point" / "Remove Bend Point" on edges, with undoable operations. Both tools support individual edge selection and deletion.
Source: [React Flow Context Menu](https://reactflow.dev/examples/interaction/context-menu), [Cytoscape Edge Editing](https://github.com/iVis-at-Bilkent/cytoscape.js-edge-editing)

**3. iToT (Interactive Tree-of-Thoughts, arXiv 2024)**
The closest academic tool to SmartB's ghost paths. iToT provides "a tree-based visualization of the ToT generation paths" with interactive controls. Users can "explore each step of the model's problem-solving process as well as correct and extend the model's thoughts." The semantic grouping feature reveals AI self-consistency: "if none of the branches are grouped, this indicates high variance." Key insight: iToT shows a SEPARATE tree view, while SmartB overlays ghost paths on the MAIN diagram. SmartB's approach is less cluttered but less comprehensive.
Source: [iToT: Interactive Tree-of-Thoughts](https://arxiv.org/html/2409.00413v1)

**4. LangSmith / Langfuse Trace Visualization**
LangSmith shows execution traces as trees with spans for each step. Langfuse shows "agent graphs" as visual representations of agent workflows. Both show the TAKEN path only. Neither shows discarded alternatives. SmartB's ghost paths fill a gap these tools leave open: visibility into what the AI CONSIDERED but rejected.
Source: [Langfuse Agent Graphs](https://langfuse.com/docs/observability/features/agent-graphs), [LangSmith Observability](https://www.langchain.com/langsmith/observability)

**Table Stakes UX for Ghost Path Management (synthesized from ecosystem):**

| Pattern | Source Tools | SmartB Status | Priority |
|---------|-------------|---------------|----------|
| Toggle visibility (show/hide all) | draw.io, Figma, Photoshop | DONE (toggle button exists) | -- |
| Individual item deletion | React Flow, Cytoscape, draw.io | MISSING | P1 |
| List panel with CRUD actions | draw.io Layers, Figma Layers | MISSING | P1 |
| Create via context menu | React Flow, Cytoscape, draw.io | MISSING (modal is broken) | P2 |
| Persist to file | draw.io (.drawio XML), Figma (cloud) | MISSING (in-memory only) | P1 |
| Read via API (programmatic access) | LangSmith, Langfuse (trace API) | MISSING | P2 |
| Promote/materialize (virtual to real) | draw.io (show layer) | MISSING (differentiator) | P3 |
| Tooltip with metadata | Langfuse (span details), LangSmith | MISSING (differentiator) | P2 |

### Heatmap / Hotspot Tracking in the Ecosystem

The web analytics ecosystem has definitively solved heatmap UX. SmartB can directly apply these proven patterns:

**1. Auto-Capture Pattern (Hotjar/Contentsquare)**
Since Hotjar joined Contentsquare in 2024, the combined platform exemplifies zero-setup tracking. Installation: single script tag. Data collection begins automatically. No manual tagging, no event definitions, no code changes per page. Contentsquare's free plan gives "autocapture" by default. This is THE pattern SmartB should follow: install once, heatmap populates automatically.
Source: [Contentsquare Auto-Capture](https://contentsquare.com/blog/contentsquare-vs-hotjar/), [Hotjar Heatmap Setup](https://help.hotjar.com/hc/en-us/articles/360056147054-How-to-Set-Up-a-Hotjar-Heatmap)

**2. Explicit Mode Switching (Hotjar Click/Scroll/Move Tabs)**
Hotjar shows three heatmap types as tabs: Click maps, Scroll maps, Move maps. Users explicitly choose which mode to view. The current SmartB auto-detect (frequency if visits exist, else risk) removes user control. Every analytics tool provides manual mode selection as table stakes.
Source: [Hotjar Heatmaps](https://www.hotjar.com/product/heatmaps/)

**3. Real-Time Updates (FullSession, Contentsquare)**
FullSession emphasizes "real-time interactive heatmaps" as a key differentiator. Contentsquare updates live during user sessions. SmartB already has the WebSocket infrastructure (`session:event` messages) but the heatmap module does not listen to them.
Source: [FullSession Heatmap Tools](https://www.fullsession.io/blog/ux-heatmap-tools/)

**4. Empty State Guidance (Universal Pattern)**
Every SaaS analytics tool shows helpful empty states. Hotjar: "Add the tracking snippet to start collecting data." Mixpanel: "No events yet. Send your first event." SmartB's heatmap shows literally nothing when empty -- no explanation, no guidance.

**5. APM Flame Graph Analogy (Datadog, Splunk)**
Datadog Continuous Profiler and Splunk AlwaysOn Profiling both demonstrate "always-on, no-restart" instrumentation for code paths. The width of each bar indicates frequency. SmartB's frequency heatmap is conceptually identical but applied to diagram nodes instead of code functions. The key lesson: auto-instrumentation (no manual setup) is what makes these tools useful in practice.
Source: [Datadog Continuous Profiler](https://docs.datadoghq.com/getting_started/profiler/), [Splunk APM Flame Graph](https://docs.splunk.com/observability/apm/profiling/using-the-flamegraph.html)

**Table Stakes UX for Heatmap (synthesized from ecosystem):**

| Pattern | Source Tools | SmartB Status | Priority |
|---------|-------------|---------------|----------|
| Auto-capture (no manual setup) | Contentsquare, Hotjar, FullStory, Datadog | MISSING | P2 (differentiator) |
| Explicit mode toggle | Hotjar (click/scroll/move), Contentsquare | MISSING | P1 |
| File/page switch auto-refresh | All analytics tools | MISSING | P1 |
| Empty state with guidance | All SaaS analytics | MISSING | P1 |
| Real-time live updates | FullSession, Contentsquare | MISSING | P2 |
| Legend with mode indicator | Hotjar, Contentsquare | PARTIAL (legend shows but no mode switch) | P1 |
| Time window selector | Datadog, Hotjar, Contentsquare | MISSING | P3 |
| Compare periods | Contentsquare "compare journeys" | MISSING | Defer |

### Annotation Persistence Patterns in the Ecosystem

**1. Mermaid Native Persistence Options**
Mermaid supports three in-file metadata mechanisms: `%%` line comments (used by SmartB), YAML frontmatter (`---` blocks), and `%%{ }%%` directives. SmartB's annotation block pattern (`%% --- ANNOTATIONS ---`) is a clean extension of the standard `%%` comment mechanism. This is the right approach.
Source: [Mermaid Syntax Reference](https://mermaid.js.org/intro/syntax-reference.html)

**2. Sidecar File Pattern (DAM Industry)**
Digital Asset Management (DAM) uses sidecar files extensively: `image01.jpg` with `image01.xmp`. The sidecar stores metadata without modifying the original asset. Naming convention: same filename, different extension. Applied to Mermaid: `plan.mmd` with `plan.meta.json`. Tradeoff: non-destructive but can get out of sync when files are moved.
Source: [Sidecar Files in DAM](https://www.orangelogic.com/sidecar-in-digital-asset-management)

**3. Mermaid Chart Platform Comments**
The commercial Mermaid Chart platform added a "Comments" feature for persistent annotations beyond plain text comments. This is a cloud-managed approach, not applicable to SmartB's local-first model.
Source: [Mermaid Chart Comments](https://docs.mermaidchart.com/blog/posts/how-to-use-the-new-comments-feature-in-mermaid-chart)

**Recommendation: Use the annotation block (`%% @ghost`)** because:
1. Consistent with 4 existing annotation types (flags, statuses, breakpoints, risks)
2. Git-friendly: ghost paths appear in diffs, reviewable in PRs
3. Single source of truth: no sidecar sync issues
4. Mermaid-safe: `%%` comments are ignored by all Mermaid renderers
5. Survives file copy/move operations

### Competitor Feature Matrix

**Ghost Path / Alternative Path Management**

| Feature | draw.io | React Flow | Cytoscape | iToT | LangSmith | SmartB v2.1 |
|---------|---------|------------|-----------|------|-----------|-------------|
| Alternative paths as overlay | Layers (toggle) | Edge types | Edge classes | Tree view | No | Ghost paths (dashed) |
| Individual path delete | Select+delete | onReconnectEnd | cy.remove() | No | No | **Planned** |
| Persist to file | .drawio XML | No (runtime) | No (runtime) | No | No | **Planned (@ghost)** |
| Create via context menu | Add Edge | Handle drag | Right-click | Interactive | No | **Planned** |
| List/manage view | Layers panel | No | No | Tree panel | Trace panel | **Planned** |
| Promote to real element | Show layer | No | No | Accept branch | No | **Planned** |
| AI-readable via API | No | No | No | No | Read-only traces | **Planned (MCP)** |

**Heatmap / Hotspot Tracking**

| Feature | Hotjar/CS | FullStory | Datadog APM | LangSmith | SmartB v2.1 |
|---------|-----------|-----------|-------------|-----------|-------------|
| Auto-tracking (no setup) | Yes (script) | Yes (auto) | Yes (agent) | Yes (SDK) | **Planned** |
| Manual mode toggle | Yes (tabs) | Yes (filter) | Yes (metrics) | Yes (views) | **Planned** |
| Real-time updates | Yes | Yes | Yes | Yes | **Planned (WS)** |
| File/page switch refresh | Yes (auto) | Yes (auto) | Yes (auto) | Yes (auto) | **Planned** |
| Empty state guidance | Yes | Yes | Yes | No | **Planned** |
| Time window selector | Yes | Yes | Yes | Yes | **Planned** |

### Key Competitive Insight

SmartB's ghost paths are genuinely unique. No production tool shows "roads not taken" as a first-class diagram overlay. The closest pattern is draw.io layers, but those are user-organized groups, not AI-generated alternatives. The iToT research prototype is academic-only and uses a separate tree view rather than overlay.

For heatmaps, every problem SmartB faces has been solved by the web analytics ecosystem (Hotjar, Contentsquare, FullStory). The patterns are proven and directly applicable:
1. Auto-capture everything (no manual setup)
2. Provide explicit mode switching (not auto-detect)
3. Update in real-time via existing WebSocket infrastructure
4. Show clear empty states with actionable guidance
5. Refresh on context change (file switch)

---

## Sources

### Codebase Analysis
- `src/diagram/annotations.ts` (annotation regex pattern), `src/server/ghost-store.ts` (in-memory store), `src/server/file-routes.ts` (unprotected `/save` endpoint), `static/main.css` (577 lines)
- Project constraints: `CLAUDE.md` (500-line rule, no new heavy deps, vanilla JS)

### Ghost Path / Alternative Path Ecosystem
- [draw.io Interactive Layers](https://www.drawio.com/blog/interactive-diagram-layers) -- HIGH confidence
- [draw.io Layer Management](https://www.drawio.com/doc/layers) -- HIGH confidence
- [React Flow Delete Edge on Drop](https://reactflow.dev/examples/edges/delete-edge-on-drop) -- HIGH confidence
- [React Flow Context Menu](https://reactflow.dev/examples/interaction/context-menu) -- HIGH confidence
- [Cytoscape Edge Editing Extension](https://github.com/iVis-at-Bilkent/cytoscape.js-edge-editing) -- HIGH confidence
- [Cytoscape Quick Tour](https://manual.cytoscape.org/en/stable/Quick_Tour_of_Cytoscape.html) -- HIGH confidence
- [iToT: Interactive Tree-of-Thoughts](https://arxiv.org/html/2409.00413v1) -- MEDIUM confidence (academic)
- [Tree of Thought UI (GitHub)](https://github.com/mazewoods/tree-of-thought-ui) -- LOW confidence (community project)
- [Langfuse Agent Graphs](https://langfuse.com/docs/observability/features/agent-graphs) -- HIGH confidence
- [LangSmith Observability](https://www.langchain.com/langsmith/observability) -- HIGH confidence
- [Braintrust AI Observability](https://www.braintrust.dev/articles/best-ai-observability-tools-2026) -- MEDIUM confidence
- [Portkey Agent Observability](https://portkey.ai/blog/agent-observability-measuring-tools-plans-and-outcomes/) -- MEDIUM confidence

### Heatmap / Hotspot Ecosystem
- [Hotjar Heatmap Setup](https://help.hotjar.com/hc/en-us/articles/360056147054-How-to-Set-Up-a-Hotjar-Heatmap) -- HIGH confidence
- [Contentsquare vs Hotjar](https://contentsquare.com/blog/contentsquare-vs-hotjar/) -- HIGH confidence
- [Contentsquare Website Heatmap](https://contentsquare.com/website-heatmap-tool/) -- HIGH confidence
- [FullSession Heatmap Tools](https://www.fullsession.io/blog/ux-heatmap-tools/) -- MEDIUM confidence
- [UXCam Heatmap Tools](https://uxcam.com/blog/best-heatmap-analysis-tool/) -- MEDIUM confidence
- [Datadog Continuous Profiler](https://docs.datadoghq.com/getting_started/profiler/) -- HIGH confidence
- [Splunk APM Flame Graph](https://docs.splunk.com/observability/apm/profiling/using-the-flamegraph.html) -- HIGH confidence
- [Brendan Gregg Flame Graphs](https://www.brendangregg.com/flamegraphs.html) -- HIGH confidence

### Annotation Persistence
- [Mermaid Syntax Reference](https://mermaid.js.org/intro/syntax-reference.html) -- HIGH confidence
- [Mermaid Chart Comments](https://docs.mermaidchart.com/blog/posts/how-to-use-the-new-comments-feature-in-mermaid-chart) -- MEDIUM confidence
- [Sidecar Files in DAM](https://www.orangelogic.com/sidecar-in-digital-asset-management) -- MEDIUM confidence
- [Mermaid Class Diagram Annotations](https://mermaid.js.org/syntax/classDiagram.html) -- HIGH confidence

### AI Reasoning Observability
- [CRV: Verifying Chain-of-Thought via Computational Graph](https://arxiv.org/abs/2510.09312) -- MEDIUM confidence (academic)
- [LangGraph Tree of Thoughts](https://langchain-ai.github.io/langgraph/tutorials/tot/tot/) -- HIGH confidence
- [Hugging Face ToT Blog](https://huggingface.co/blog/sadhaklal/tree-of-thoughts) -- MEDIUM confidence

---
*Feature research for: SmartB Diagrams v2.1 -- Bug Fixes & Usability*
*Enriched with ecosystem/competitor research: 2026-02-19*
