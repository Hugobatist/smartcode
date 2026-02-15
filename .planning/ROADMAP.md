# Roadmap: SmartB Diagrams

## Overview

SmartB Diagrams transforms from an internal Python prototype into a production TypeScript npm package that provides real-time AI reasoning observability. The roadmap follows a strict dependency chain: core diagram logic and HTTP serving come first, then real-time WebSocket sync, then the interactive browser UI, then MCP integration for AI tools, then CLI and developer experience polish, then the VS Code extension, and finally scalability features for large diagrams. Each phase delivers a coherent, independently verifiable capability that unblocks the next.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Project Bootstrap + Diagram Core** - TypeScript foundation, npm package structure, and diagram parsing/annotation service
- [x] **Phase 2: HTTP Server** - Serve browser UI, REST endpoints for diagram content, static asset bundling
- [x] **Phase 3: WebSocket + Real-Time Sync** - File watcher, WebSocket broadcast, live updates replacing polling
- [x] **Phase 4: Interactive Browser UI** - Pan/zoom, keyboard shortcuts, flag interactions, export, file tree navigation
- [x] **Phase 5: MCP Server** - AI tool integration via stdio transport with tools and resources
- [x] **Phase 6: CLI + Developer Experience + AI Integration** - CLI commands, zero-config MCP setup, AI diagram conventions, flag-to-prompt pipeline
- [ ] **Phase 7: VS Code Extension** - Sidebar webview panel, WebSocket client, file navigation, marketplace publication
- [x] **Phase 8: Scalability + Large Diagrams** - Hierarchical collapsing, rendering limits, breadcrumb navigation, focus mode

## Phase Details

### Phase 1: Project Bootstrap + Diagram Core
**Goal**: Developers have a working TypeScript project that compiles to a globally installable npm package with a complete diagram parsing and annotation service
**Depends on**: Nothing (first phase)
**Requirements**: CORE-01, CORE-02, CORE-04, CORE-05, DIAG-01, DIAG-02, DIAG-03, DIAG-04, DIAG-05, DIAG-06
**Success Criteria** (what must be TRUE):
  1. Running `npm install -g .` from the repo installs the `smartb` command that executes without error on macOS (and Linux/Windows path handling is correct)
  2. The diagram service can parse a .mmd file, extract Mermaid content and `%% @flag` annotations, write updates back, and report structured validation errors for malformed syntax
  3. Multiple .mmd files organized in different project directories are discovered and managed independently
  4. TypeScript types for diagram nodes, flags, annotations, and status are exported and usable by downstream packages
**Plans:** 2 plans

Plans:
- [x] 01-01-PLAN.md — TypeScript project scaffolding, build tooling, CLI entry point, core types, static asset bundling
- [x] 01-02-PLAN.md — Diagram service with .mmd parsing, flag annotation extraction/injection, validation, multi-file/multi-project support

### Phase 2: HTTP Server
**Goal**: Developers can start a server that serves a browser-based diagram viewer showing Mermaid diagrams rendered from .mmd files
**Depends on**: Phase 1
**Requirements**: CORE-03, HTTP-01, HTTP-02, HTTP-03, HTTP-04, HTTP-05, UI-01, UI-04, UI-07
**Success Criteria** (what must be TRUE):
  1. Running `smartb serve` starts an HTTP server on port 3333 (or falls back to next available port) and opens a browser page that renders a Mermaid diagram from a .mmd file
  2. REST endpoints list available .mmd files and return individual diagram content as JSON
  3. Diagram nodes display color-coded status (green/red/yellow/gray) and malformed Mermaid syntax shows inline error messages with line numbers
  4. CORS headers are present so the browser UI works during local development
**Plans:** 2 plans

Plans:
- [x] 02-01-PLAN.md — HTTP server core with CLI serve command, all live.html endpoints, REST API, CORS, port fallback
- [x] 02-02-PLAN.md — Status color classDef injection, structured error display with line numbers, server integration tests

### Phase 3: WebSocket + Real-Time Sync
**Goal**: Diagram changes propagate instantly to all connected browsers without manual refresh
**Depends on**: Phase 2
**Requirements**: WS-01, WS-02, WS-03, WS-04, WS-05, WS-06, UI-10
**Success Criteria** (what must be TRUE):
  1. Editing a .mmd file on disk causes the browser diagram to update within 50ms without any page refresh or user action
  2. Opening multiple browser tabs shows the same diagram updating simultaneously across all tabs
  3. Disconnecting and reconnecting the network causes the WebSocket client to automatically reconnect with exponential backoff and resume receiving updates
  4. Adding or removing .mmd files updates the file listing in all connected clients without restart
  5. Multiple project directories can be monitored simultaneously with changes isolated to their namespace
**Plans:** 3 plans

Plans:
- [x] 03-01-PLAN.md — WebSocket server (ws) attached to HTTP server, chokidar file watcher on .mmd files, ServerInstance return type
- [x] 03-02-PLAN.md — Client-side WebSocket with auto-reconnect and exponential backoff, replace polling in live.html
- [x] 03-03-PLAN.md — Multi-project namespacing via noServer mode, per-project WebSocket isolation

### Phase 4: Interactive Browser UI
**Goal**: Developers can interact with diagrams through pan/zoom, keyboard shortcuts, flag annotations, and export — a complete diagram workstation in the browser
**Depends on**: Phase 3
**Requirements**: UI-02, UI-03, UI-05, UI-06, UI-08, UI-09
**Success Criteria** (what must be TRUE):
  1. Developer can pan, zoom, and fit-to-view the diagram canvas using mouse and keyboard controls
  2. Pressing F enters flag mode where clicking a node opens a dialog to add a `%% @flag` annotation that persists to the .mmd file
  3. A flag panel lists all active flags and clicking a flag navigates to and highlights the flagged node on the diagram
  4. Developer can export the current diagram view as SVG or PNG
  5. A file tree sidebar lets the developer navigate between multiple .mmd files and the selected diagram loads in the main canvas
**Plans:** 2 plans

Plans:
- [x] 04-01-PLAN.md — Fix PNG export (Canvas taint), XSS-safe file tree rendering, zoom preservation on live updates
- [x] 04-02-PLAN.md — Ctrl+F node search with highlight navigation

### Phase 5: MCP Server
**Goal**: AI coding tools (Claude Code, Cursor) can connect via MCP to read developer flags, update diagrams, and get diagram context — completing the bidirectional feedback loop
**Depends on**: Phase 3
**Requirements**: MCP-01, MCP-02, MCP-03, MCP-04, MCP-05, MCP-06, MCP-07, MCP-08, MCP-09, MCP-10
**Success Criteria** (what must be TRUE):
  1. An AI tool connected via MCP stdio can call `update_diagram` to create or modify a .mmd file and the change appears in the browser within 100ms
  2. An AI tool can call `read_flags` and receive a structured JSON list of all active developer flags with node IDs and messages
  3. An AI tool can call `get_diagram_context` and `update_node_status` to read diagram state and set node statuses that render as colors in the browser
  4. MCP resources expose the list of available diagram files and individual file content for AI tool discovery
  5. No stdout writes occur from the server process — all logging goes to stderr so the MCP stdio transport is never corrupted
**Plans:** 3 plans

Plans:
- [x] 05-01-PLAN.md — MCP foundation: SDK install, Zod schemas, @status annotation support, MCP server skeleton, smartb mcp CLI command
- [x] 05-02-PLAN.md — MCP tools (update_diagram, read_flags, get_diagram_context, update_node_status) and resources (diagram list, diagram content)
- [x] 05-03-PLAN.md — Shared-process integration (--serve mode), graceful shutdown, end-to-end verification

### Phase 6: CLI + Developer Experience + AI Integration
**Goal**: Developers have a polished CLI workflow (init, serve, status), zero-config MCP setup, and AI agents have conventions and tools for generating useful diagrams and responding to flags
**Depends on**: Phase 5
**Requirements**: DX-01, DX-02, DX-03, DX-04, DX-05, DX-06, AI-01, AI-02, AI-03, AI-04
**Success Criteria** (what must be TRUE):
  1. Running `smartb init` in a new directory creates a project config and sample .mmd file; `smartb serve` starts the server and opens the browser; `smartb status` shows server status, connected clients, and active flags
  2. Adding the SmartB MCP entry to claude_desktop_config.json (or equivalent) requires zero additional configuration — the AI tool connects and can immediately use all MCP tools
  3. An AI agent following the provided CLAUDE.md instructions and Mermaid conventions emits structured reasoning diagrams that render correctly in the browser
  4. When a developer flags a node, the `get_correction_context` MCP tool returns a structured prompt containing the flag message, node context, and surrounding diagram state that the AI can use to course-correct
**Plans:** 3 plans

Plans:
- [x] 06-01-PLAN.md — CLI commands: smartb init (project scaffolding) and smartb status (server diagnostics), /api/status endpoint, WebSocketManager.getClientCount()
- [x] 06-02-PLAN.md — get_correction_context MCP tool (flag-to-prompt pipeline), helpful error messages for no .mmd files and port conflicts
- [x] 06-03-PLAN.md — README with quick start guide, MCP setup instructions, AI diagram conventions, example CLAUDE.md for AI agents

### Phase 7: VS Code Extension
**Goal**: Developers see live AI reasoning diagrams in a VS Code sidebar panel without leaving their editor, with full flag interaction capability
**Depends on**: Phase 3, Phase 5
**Requirements**: VSC-01, VSC-02, VSC-03, VSC-04, VSC-05, VSC-06, VSC-07, VSC-08, VSC-09, VSC-10
**Success Criteria** (what must be TRUE):
  1. Installing the extension from VS Code Marketplace adds a sidebar panel that connects to a running SmartB server and displays the live Mermaid diagram
  2. The diagram in the VS Code sidebar updates in real-time when the .mmd file changes (same latency as browser)
  3. Developer can click nodes in the VS Code webview to add flag annotations, and flags appear in both the VS Code panel and the browser UI simultaneously
  4. Closing and reopening the sidebar panel restores the previous diagram view state without reconnection errors
  5. A status bar indicator shows whether the extension is connected to the SmartB server
  6. The panel header shows which .mmd file is currently displayed
  7. A file selector lets the developer navigate between multiple .mmd files without leaving the editor
  8. When multiple projects are monitored, the project/folder context is visible in the panel
**Plans:** 4 plans

Plans:
- [x] 07-01-PLAN.md — Extension scaffolding (package.json, tsconfig, esbuild), WebviewViewProvider, WebSocket client in extension host
- [x] 07-02-PLAN.md — Mermaid rendering in webview, click-to-flag interaction, state persistence via getState/setState
- [x] 07-03-PLAN.md — Status bar connection indicator, README/CHANGELOG, VSIX packaging for marketplace
- [x] 07-04-PLAN.md — File name header, file selector dropdown, multi-file navigation in webview panel

### Phase 8: Scalability + Large Diagrams
**Goal**: Diagrams with 50+ nodes remain usable through hierarchical collapsing, rendering limits, and focused navigation — preventing the "UML death" problem
**Depends on**: Phase 4
**Requirements**: SCALE-01, SCALE-02, SCALE-03, SCALE-04
**Success Criteria** (what must be TRUE):
  1. Mermaid subgraphs can be expanded and collapsed by clicking, and collapsed subgraphs show a summary node with child count
  2. Diagrams with more than 50 nodes automatically collapse to show only top-level groups with a "show more" affordance for drilling in
  3. A breadcrumb trail at the top of the diagram shows the current hierarchy path and allows navigation back to parent levels
  4. Selecting a node enters focus mode showing that node's subgraph plus one level of surrounding context, filtering out unrelated diagram sections
**Plans:** 3 plans

Plans:
- [x] 08-01-PLAN.md — Subgraph parsing, collapse/expand interaction, collapse-ui.js
- [x] 08-02-PLAN.md — Node limit (50), auto-collapse, notice UI, server integration
- [x] 08-03-PLAN.md — Breadcrumb navigation, focus mode (double-click), Escape to exit

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8
(Phases 4 and 5 can run in parallel after Phase 3; Phase 7 depends on both 3 and 5)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Project Bootstrap + Diagram Core | 2/2 | ✓ Complete | 2026-02-14 |
| 2. HTTP Server | 2/2 | ✓ Complete | 2026-02-14 |
| 3. WebSocket + Real-Time Sync | 3/3 | ✓ Complete | 2026-02-15 |
| 4. Interactive Browser UI | 2/2 | ✓ Complete | 2026-02-15 |
| 5. MCP Server | 3/3 | ✓ Complete | 2026-02-15 |
| 6. CLI + DX + AI Integration | 3/3 | ✓ Complete | 2026-02-15 |
| 7. VS Code Extension | 4/4 | ✓ Complete | 2026-02-15 |
| 8. Scalability + Large Diagrams | 3/3 | ✓ Complete | 2026-02-15 |
