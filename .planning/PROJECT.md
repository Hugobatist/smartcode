# SmartB Diagrams

## What This Is

An AI observability layer that visualizes how AI coding agents think in real-time. Developers connect it to their AI tools (Cursor, VS Code + Copilot, Claude Code) and see live interactive diagrams of the AI's reasoning as it works. When something looks wrong, they flag it directly on the diagram and the AI course-corrects. It's a visual debugger for AI agents — not another coding tool, but a plugin that makes existing tools transparent.

## Core Value

Developers can see what their AI is thinking and intervene surgically before it finishes — turning black-box AI coding into a transparent, collaborative process.

## Current Milestone: v2.0 Interactive Canvas + Advanced Features

**Goal:** Replace the static Mermaid SVG renderer with a custom interactive canvas, enabling direct manipulation of diagram elements (drag, select, edit inline, context menu), and build advanced AI observability features (breakpoints, ghost paths, session replay) on top of this new foundation.

**Target features:**
- Custom interactive canvas renderer (ELK.js/Dagre layout + custom SVG)
- Direct node manipulation (select, drag, resize, inline edit)
- Context menu, property panel, undo/redo, copy/paste
- Folder management (delete, rename)
- AI Breakpoints — pause AI reasoning at specific nodes
- Ghost Paths — visualize discarded reasoning branches
- Risk Heatmap — cost/impact overlay per node
- Session Replay — rewind AI reasoning timeline
- Pattern Memory — learn from historical flags
- Diagram as executable contract

## Requirements

### Validated

<!-- Shipped and confirmed valuable in v1.0. -->

- ✓ TypeScript npm package with CLI (`smartb serve/init/status`) — v1.0
- ✓ HTTP server serving Mermaid diagrams with real-time WebSocket sync — v1.0
- ✓ Flag system with bidirectional communication via `%% @flag` annotations — v1.0
- ✓ Visual flag panel showing all active flags — v1.0
- ✓ Diagram editor with node/edge add/remove/edit — v1.0
- ✓ MCP server for AI tool integration (read flags, update diagrams, correction context) — v1.0
- ✓ VS Code extension with sidebar panel and WebSocket connection — v1.0
- ✓ Pan/zoom, keyboard shortcuts, SVG/PNG export — v1.0
- ✓ File tree sidebar with create/delete/rename files — v1.0
- ✓ Node search with highlight navigation (Ctrl+F) — v1.0
- ✓ Subgraph collapse/expand (partial) — v1.0

### Active

<!-- Current scope: v2.0 Interactive Canvas + Advanced Features -->

- [ ] Custom interactive canvas renderer replacing Mermaid static SVG
- [ ] Node selection, drag-and-drop positioning, inline text editing
- [ ] Context menu (right-click) on nodes, edges, and canvas
- [ ] Property panel for node styling (color, shape, border)
- [ ] Undo/Redo system
- [ ] Copy/paste/duplicate diagram elements
- [ ] Folder delete and rename in sidebar
- [ ] AI Breakpoints — pause reasoning at flagged nodes
- [ ] Ghost Paths — visualize discarded AI reasoning branches
- [ ] Risk Heatmap — cost/impact visual overlay per node
- [ ] Session Replay — rewind AI reasoning timeline
- [ ] Pattern Memory — learn correction patterns from flag history
- [ ] Diagram as executable contract — validate AI output against diagram structure

### Out of Scope

- Full IDE replacement (Cursor competitor) — we're a plugin, not a platform
- Non-developer users (no-code builders) — our users are devs who use AI tools
- Cloud/SaaS hosting — local-first tool, runs on developer's machine
- Mobile support — desktop IDE plugin only
- Non-Mermaid input formats — .mmd remains the source format (but rendering is custom)
- Freehand drawing / whiteboard mode — we're a structured diagram tool, not Excalidraw

## Context

**v1.0 delivered:** TypeScript npm package with HTTP server, WebSocket real-time sync, browser UI with pan/zoom/flags/search/export, MCP server for AI tools, VS Code extension, and partial subgraph collapse/expand. 8 phases completed.

**v2.0 motivation:** The Mermaid.js renderer produces static SVG — nodes can't be selected, dragged, or directly manipulated. The UI feels "rigid" compared to modern diagram tools. Replacing the renderer with an interactive canvas unlocks both UX improvements and advanced AI observability features that require fine-grained element control.

**Architecture pivot:** v1 used Mermaid.js as a black-box renderer (text in → SVG out). v2 will parse .mmd files into an internal graph model, use ELK.js or Dagre for layout computation, and render custom interactive SVG where each element is individually addressable and manipulable.

**Market context:** AI coding tools (Cursor $400M+, GitHub Copilot, Claude Code, Devin) are exploding but none offer visual reasoning transparency. The interactive canvas makes SmartB the "Datadog for AI reasoning" with a UX that matches modern expectations.

## Constraints

- **Tech stack**: TypeScript + Node.js — must be npm-installable, no Python dependency in production
- **Architecture**: Single process for MCP server + HTTP server — simplicity over microservices
- **Compatibility**: Must work with MCP-compatible tools (Claude Code, Cursor) and VS Code
- **Performance**: Diagram updates must feel instant (<100ms perceived latency)
- **Dependencies**: Minimal — no heavy frameworks, keep install size small
- **Input format**: .mmd files remain the source of truth — custom renderer reads .mmd, not a new format
- **Browser UI**: Vanilla JS — no React/Vue/frameworks in static/
- **Backward compatibility**: Existing .mmd files with flags/statuses must work with new renderer

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| TypeScript over Python for production | npm ecosystem for global install, MCP SDK is TypeScript-first | ✓ Good |
| Single process (MCP + HTTP) | Simpler deployment, one `npx` command to start | ✓ Good |
| npm global package distribution | Standard for dev tools, easy install/update | ✓ Good |
| Plugin approach over standalone product | Compete on niche (observability) not platform (IDE) | ✓ Good |
| Mermaid-only input format (.mmd) | Widely known, text-based (git-friendly), AI tools can generate it | ✓ Good |
| Local-first architecture | Privacy, speed, no cloud dependency | ✓ Good |
| Replace Mermaid renderer with custom canvas | Mermaid SVG is static — can't select/drag/manipulate nodes. Custom renderer unlocks interactive UX and advanced features | — Pending |
| ELK.js or Dagre for layout engine | Same engines Mermaid uses internally, proven for directed graphs | — Pending |

---
*Last updated: 2026-02-15 after v2.0 milestone initialization*
