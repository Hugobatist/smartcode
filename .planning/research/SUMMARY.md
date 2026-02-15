# Research Summary: SmartB Diagrams v2.0

**Synthesized:** 2026-02-15
**Sources:** STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md

---

## Executive Summary

v2.0 replaces Mermaid.js as a black-box renderer with a custom interactive SVG pipeline, enabling direct manipulation of diagram elements and advanced AI observability features. The core architecture shift: `.mmd file → Custom Parser → GraphModel → dagre layout → Custom SVG Renderer → Interactive DOM`. Mermaid.js remains as fallback for non-flowchart diagram types.

The research identified 6 critical pitfalls, with #1 being "big bang renderer replacement" — all existing UI modules (annotations, search, collapse, editor) are deeply coupled to Mermaid's SVG DOM output. The recommended approach is strangler fig: build new renderer alongside Mermaid, abstract DOM queries first, migrate module by module.

Estimated scope: 49-70 developer-days across 15 features. The recommended phasing groups these into Foundation (refactoring + graph model + renderer), Canvas Interactions (select, context menu, edit, undo), AI Observability (breakpoints, ghost paths, heatmap), and Advanced features (session replay, pattern memory).

## Stack Decisions

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Layout engine | **dagre** (not ELK.js) | Same engine Mermaid uses; visual continuity; 30KB vs 1.3MB; synchronous; compound graph support |
| SVG rendering | **Native SVG DOM API** | No library needed; full control; CSS styling; browser hit testing for free |
| .mmd parsing | **Custom regex parser** | @mermaid-js/parser does NOT support flowchart (confirmed in validator.ts); extend existing patterns |
| Heatmap | **simpleheat** (3KB) | Canvas overlay; zero deps; by Mourner (Leaflet/Mapbox) |
| Undo/redo | **Command pattern** (custom) | Domain-specific commands; ~150 lines; source-tagged (user vs AI) |
| Session replay | **Custom JSONL event stream** | Lightweight; semantic events not DOM recording; ~50-100 bytes/event |
| Ghost paths | **SVG + CSS animations** | Dashed paths with opacity; no library needed |
| Breakpoints | **SVG circles + CSS pulse** | Visual indicator on nodes; extends existing annotation system |

### What NOT to Add

- No React/Vue/Svelte (vanilla JS constraint)
- No D3.js/Cytoscape.js (too heavy for our needs)
- No Konva/Fabric.js (Canvas-based; we need SVG)
- No rrweb (records DOM, not diagram semantics)
- No ELK.js initially (dagre is sufficient; ELK adds 1.3MB)

## Architecture Shift

### v1 Data Flow (current)
```
.mmd text → browser → Mermaid.render() → opaque SVG string → DOM
```
**Problem:** No internal graph model. Positions computed by Mermaid's internal dagre, never exposed. No incremental updates. No drag/drop. Collapse is text manipulation.

### v2 Data Flow (target)
```
.mmd text → server parses to GraphModel → WebSocket sends graph JSON
→ browser receives GraphModel → dagre computes positions → custom SVG renderer
→ interactive SVG in DOM (each element has data-node-id, event handlers)
```
**Benefits:** Full control over rendering, incremental updates, hit testing, drag support, overlay system.

### New Components

| Component | Location | Purpose |
|-----------|----------|---------|
| GraphModel | `src/diagram/graph-model.ts` + `static/core/` | Shared graph representation |
| MermaidParser | `src/diagram/mermaid-parser.ts` | .mmd → GraphModel |
| MermaidSerializer | `src/diagram/mermaid-serializer.ts` | GraphModel → .mmd |
| LayoutEngine | `static/core/layout-engine.js` | dagre wrapper |
| SVGRenderer | `static/core/svg-renderer.js` | GraphModel → SVG DOM |
| InteractionManager | `static/core/interaction-manager.js` | Drag/select/edit |
| ViewportTransform | `static/core/viewport-transform.js` | Screen ↔ graph coords |
| SessionStore | `src/session/session-store.ts` | Session recording data |
| HeatmapOverlay | `static/overlays/heatmap-overlay.js` | Execution frequency viz |
| GhostPathRenderer | `static/overlays/ghost-path-renderer.js` | Discarded path viz |

### live.html Refactoring (PREREQUISITE)

Current state: 1757 lines, monolithic, 5 IIFE modules with `window.*` globals.

Target structure:
```
static/
  live.html              ← reduced to ~200 lines (HTML shell + script imports)
  core/                  ← graph model, layout, renderer, interactions
  overlays/              ← heatmap, ghost paths, session player
  ui/                    ← annotations, collapse, search, editor, file-tree
  styles/                ← CSS files by component
```

## Feature Priority

### Phase A: Foundation (must ship first)
1. live.html refactoring → ES modules, < 500 lines each
2. DOM abstraction layer → decouple from Mermaid SVG structure
3. Graph model + parser + serializer
4. Custom SVG renderer + dagre layout
5. Server integration (API + WebSocket for graph model)

### Phase B: Canvas Interactions
6. Node selection with visual feedback (blue border, handles)
7. Context menu (right-click: Edit, Delete, Duplicate, Flag, Connect)
8. Inline edit (double-click label → contenteditable overlay)
9. Undo/redo (Command pattern, user-only stack)
10. Copy/paste/duplicate (Ctrl+C/V/D)
11. Keyboard shortcuts (Delete, Escape, Ctrl+A)

### Phase C: AI Observability
12. AI Breakpoints — `%% @breakpoint NodeId`, MCP `check_breakpoints()` tool
13. Ghost Paths — discarded reasoning branches at 30% opacity, dashed
14. Risk Heatmap — `%% @risk NodeId high|medium|low "reason"`, color overlay

### Phase D: Advanced
15. Session Replay — JSONL event stream, timeline scrubber UI
16. Pattern Memory — flag history learning, fuzzy label matching
17. Property Panel — right sidebar for node properties

### Deferred to v3
- Drag-to-reposition with layout persistence
- Multi-cursor collaboration
- Executable contract validation
- Custom shapes beyond Mermaid syntax

## Critical Pitfalls

### 1. Big Bang Renderer Replacement (CRITICAL)
**Risk:** Replacing Mermaid at once breaks all 5 interaction modules (annotations, search, collapse, editor, diagram-editor).
**Prevention:** Strangler fig pattern. Build alongside Mermaid. Abstract DOM queries into `DiagramDOM` interface first. Toggle between renderers via `?renderer=canvas`.

### 2. .mmd Round-Trip Fidelity Loss (CRITICAL)
**Risk:** .mmd doesn't encode positions. User drags node, saves, reloads — node in different position.
**Prevention:** Sidecar `.smartb/positions/` metadata. Layout pinning for manually positioned nodes. Stable dagre config for deterministic layouts.

### 3. Vanilla JS Complexity Ceiling (CRITICAL)
**Risk:** live.html already 1757 lines. 5 modules share state via `window.*` globals. Adding canvas interactions exponentially increases complexity.
**Prevention:** Event bus for inter-module communication. Explicit interaction state machine (IDLE → PANNING → IDLE, IDLE → FLAG_MODE → FLAG_PLACING → IDLE). Single CanvasInteraction class for hit testing + coordinate transforms.

### 4. Layout Engine Performance (MODERATE)
**Risk:** dagre layout for 100+ nodes: 50-200ms. Blocks main thread during rapid AI updates.
**Prevention:** Layout debouncing (150ms). Incremental layout for small changes. Web Worker for large graphs. Layout caching by topology hash.

### 5. Undo/Redo in Collaborative System (MODERATE)
**Risk:** User undo conflicts with AI agent updates arriving via WebSocket.
**Prevention:** Source-tagged commands (user vs AI vs filesystem). Ctrl+Z only undoes user commands. Separate "Revert AI change" action.

### 6. VS Code / Browser Divergence (MODERATE)
**Risk:** Two UIs diverge as features added to one but not other.
**Prevention:** Single rendering core module. CSP-compatible from day one. Keyboard shortcut abstraction map.

## Key Types

```typescript
interface GraphNode {
  id: string; label: string;
  shape: 'rect' | 'rounded' | 'circle' | 'diamond' | 'hexagon' | 'stadium';
  x?: number; y?: number; width?: number; height?: number;
  status?: NodeStatus; flag?: Flag; subgraphId?: string;
  executionCount?: number; breakpoint?: boolean; ghostPath?: boolean;
}

interface GraphEdge {
  id: string; from: string; to: string;
  label?: string; type: 'arrow' | 'open' | 'dotted' | 'thick';
  executionCount?: number; isGhostPath?: boolean;
}

interface GraphModel {
  diagramType: string; direction: 'TB' | 'LR' | 'BT' | 'RL';
  nodes: Map<string, GraphNode>; edges: GraphEdge[];
  subgraphs: Map<string, GraphSubgraph>;
  filePath: string; flags: Map<string, Flag>; statuses: Map<string, NodeStatus>;
}
```

## Build Constraints

- Vanilla JS in browser (no React/Vue)
- All files < 500 lines
- 131 existing tests must continue passing
- Backward compatible with existing .mmd files and flags
- Custom renderer targets flowchart/graph only; Mermaid fallback for others
- VS Code extension must work with both renderers during transition

---
*Synthesized: 2026-02-15*
*Ready for roadmap: yes*
