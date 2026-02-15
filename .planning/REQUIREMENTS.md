# Requirements: SmartB Diagrams

**Defined:** 2026-02-14
**Core Value:** Developers can see what their AI is thinking and intervene surgically before it finishes

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Core Infrastructure

- [ ] **CORE-01**: TypeScript project compiles and runs as single Node.js process
- [ ] **CORE-02**: npm global package installable via `npm install -g smartb-diagrams`
- [ ] **CORE-03**: CLI entry point with `smartb` command and subcommands (init, serve, status)
- [ ] **CORE-04**: Cross-platform support (macOS, Linux, Windows) with correct path handling
- [ ] **CORE-05**: Static assets (HTML, CSS, JS) bundled correctly with npm package

### Diagram Service

- [ ] **DIAG-01**: Parse .mmd files and extract Mermaid diagram content
- [ ] **DIAG-02**: Parse `%% @flag nodeId "message"` annotations from .mmd files
- [ ] **DIAG-03**: Write/update .mmd files with diagram content and annotations
- [ ] **DIAG-04**: Validate Mermaid syntax and return structured error messages
- [ ] **DIAG-05**: Support multiple .mmd files organized by project directory
- [ ] **DIAG-06**: TypeScript types for diagram nodes, flags, annotations, and status

### HTTP Server

- [ ] **HTTP-01**: HTTP server serves browser UI (live.html equivalent) on configurable port (default 3333)
- [ ] **HTTP-02**: REST endpoint to list available diagram files
- [ ] **HTTP-03**: REST endpoint to read diagram content
- [ ] **HTTP-04**: Graceful port fallback if default port is occupied
- [ ] **HTTP-05**: CORS headers for local development

### WebSocket & Real-Time

- [ ] **WS-01**: WebSocket server attached to HTTP server instance
- [ ] **WS-02**: File watcher (chokidar) monitors .mmd files for changes
- [ ] **WS-03**: File changes broadcast to all connected WebSocket clients within 50ms
- [ ] **WS-04**: WebSocket client auto-reconnects with exponential backoff
- [ ] **WS-05**: Multi-project support — each project directory gets its own namespace
- [ ] **WS-06**: File tree updates broadcast when .mmd files are added/removed

### Browser UI

- [ ] **UI-01**: Mermaid.js renders diagrams client-side from .mmd content
- [ ] **UI-02**: Pan, zoom, and fit-to-view controls on diagram canvas
- [ ] **UI-03**: Keyboard shortcuts (F=flag mode, Esc=cancel, Ctrl+F=search)
- [ ] **UI-04**: Color-coded node status visualization (green=OK, red=problem, yellow=in-progress, gray=discarded)
- [ ] **UI-05**: Flag mode: click node to add flag annotation with message
- [ ] **UI-06**: Flag panel showing all active flags with navigation to flagged nodes
- [ ] **UI-07**: Inline error display for malformed Mermaid syntax with line numbers
- [ ] **UI-08**: Export diagram as SVG and PNG
- [ ] **UI-09**: File tree sidebar for navigating multiple .mmd files
- [ ] **UI-10**: Real-time updates via WebSocket (no polling)

### MCP Server

- [ ] **MCP-01**: MCP server using stdio transport for AI tool integration
- [ ] **MCP-02**: MCP tool `update_diagram` — AI agent can create/update .mmd diagram content
- [ ] **MCP-03**: MCP tool `read_flags` — AI agent can read all active developer flags
- [ ] **MCP-04**: MCP tool `get_diagram_context` — AI agent can get current diagram state with metadata
- [ ] **MCP-05**: MCP tool `update_node_status` — AI agent can set node status (ok/problem/in-progress/discarded)
- [ ] **MCP-06**: MCP resource exposing list of available diagram files
- [ ] **MCP-07**: MCP resource exposing individual diagram file content
- [ ] **MCP-08**: Zod schemas for all MCP tool inputs and outputs
- [ ] **MCP-09**: stderr-only logging (no stdout writes that corrupt stdio transport)
- [ ] **MCP-10**: MCP server and HTTP/WS server share same process and state

### VS Code Extension

- [ ] **VSC-01**: VS Code extension with WebviewViewProvider for sidebar panel
- [ ] **VSC-02**: Sidebar displays live Mermaid diagram from connected server
- [ ] **VSC-03**: WebSocket client connecting to smartb-diagrams server
- [ ] **VSC-04**: Flag interaction from within VS Code webview
- [ ] **VSC-05**: Webview state persistence via getState()/setState() API
- [ ] **VSC-06**: Extension published to VS Code Marketplace
- [ ] **VSC-07**: Status bar indicator showing connection status to server
- [ ] **VSC-08**: File name/path visible in webview panel header
- [ ] **VSC-09**: File selector (dropdown or mini file-list) for navigating between .mmd files
- [ ] **VSC-10**: Project/folder context indicator when monitoring multiple projects

### Scalability

- [ ] **SCALE-01**: Hierarchical collapsing — expand/collapse Mermaid subgraphs
- [ ] **SCALE-02**: Maximum 50 visible nodes rendering limit with "show more" navigation
- [ ] **SCALE-03**: Breadcrumb navigation for hierarchical diagram levels
- [ ] **SCALE-04**: Focus mode — show relevant subgraph for selected node plus surrounding context

### Developer Experience

- [ ] **DX-01**: `smartb init` creates project config and sample .mmd in current directory
- [ ] **DX-02**: `smartb serve` starts server and opens browser
- [ ] **DX-03**: `smartb status` shows server status, connected clients, active flags
- [ ] **DX-04**: Zero-config MCP integration — works with claude_desktop_config.json format
- [ ] **DX-05**: README with quick start guide, MCP setup instructions, and VS Code extension link
- [ ] **DX-06**: Helpful error messages when server fails to start (port taken, no .mmd files found)

### AI Integration

- [ ] **AI-01**: Convention/schema for AI agents to emit reasoning as Mermaid flowcharts
- [ ] **AI-02**: Flag-to-prompt pipeline — generate contextual correction prompt from flag content
- [ ] **AI-03**: MCP tool `get_correction_context` returns structured prompt with flag, node context, and diagram state
- [ ] **AI-04**: Example CLAUDE.md instructions for AI agents to use SmartB Diagrams

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Advanced Visualization

- **VIS-01**: Session timeline — scrub through diagram version history
- **VIS-02**: Cursor Blame-style attribution — link nodes to AI conversation turns
- **VIS-03**: Minimap for large diagrams
- **VIS-04**: Animation of diagram changes (node additions, status transitions)

### Integrations

- **INT-01**: OpenTelemetry span emission for integration with Grafana/Datadog
- **INT-02**: Cursor-specific extension/integration
- **INT-03**: JetBrains IDE plugin
- **INT-04**: Neovim integration

### Collaboration

- **COLLAB-01**: VS Code Live Share integration for shared diagram viewing
- **COLLAB-02**: Multi-user flag annotations with author attribution

## Out of Scope

| Feature | Reason |
|---------|--------|
| Full visual diagram editor (draw.io style) | Breaks text-based design principle; maintaining bidirectional visual<>text sync is a rabbit hole |
| Support for all 13 Mermaid diagram types | Only flowchart and state diagrams map to AI reasoning; others add complexity without value |
| Cloud sync / SaaS hosting | Violates local-first principle; competes with Mermaid Chart Pro on their turf |
| AI model selection / prompt engineering UI | SmartB is observability, not an AI coding tool; would compete with Cursor/Copilot |
| Metrics dashboards (token usage, cost) | LangSmith/Langfuse already do this well; not our differentiation |
| Natural language diagram generation | Commodity feature; our value is AI-agent-generated diagrams, not human-to-diagram NLP |
| Mobile / tablet support | Developer tools are desktop-first; responsive SVG diagrams on mobile is a rabbit hole |
| Plugin / extension marketplace | Premature abstraction; MCP IS the extension mechanism |
| Server-side Mermaid rendering | Requires headless Chromium (200MB+, 500ms+ latency); keep rendering browser-side |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| CORE-01 | Phase 1 | Pending |
| CORE-02 | Phase 1 | Pending |
| CORE-03 | Phase 2 | Pending |
| CORE-04 | Phase 1 | Pending |
| CORE-05 | Phase 1 | Pending |
| DIAG-01 | Phase 1 | Pending |
| DIAG-02 | Phase 1 | Pending |
| DIAG-03 | Phase 1 | Pending |
| DIAG-04 | Phase 1 | Pending |
| DIAG-05 | Phase 1 | Pending |
| DIAG-06 | Phase 1 | Pending |
| HTTP-01 | Phase 2 | Pending |
| HTTP-02 | Phase 2 | Pending |
| HTTP-03 | Phase 2 | Pending |
| HTTP-04 | Phase 2 | Pending |
| HTTP-05 | Phase 2 | Pending |
| WS-01 | Phase 3 | Pending |
| WS-02 | Phase 3 | Pending |
| WS-03 | Phase 3 | Pending |
| WS-04 | Phase 3 | Pending |
| WS-05 | Phase 3 | Pending |
| WS-06 | Phase 3 | Pending |
| UI-01 | Phase 2 | Pending |
| UI-02 | Phase 4 | Pending |
| UI-03 | Phase 4 | Pending |
| UI-04 | Phase 2 | Pending |
| UI-05 | Phase 4 | Pending |
| UI-06 | Phase 4 | Pending |
| UI-07 | Phase 2 | Pending |
| UI-08 | Phase 4 | Pending |
| UI-09 | Phase 4 | Pending |
| UI-10 | Phase 3 | Pending |
| MCP-01 | Phase 5 | Pending |
| MCP-02 | Phase 5 | Pending |
| MCP-03 | Phase 5 | Pending |
| MCP-04 | Phase 5 | Pending |
| MCP-05 | Phase 5 | Pending |
| MCP-06 | Phase 5 | Pending |
| MCP-07 | Phase 5 | Pending |
| MCP-08 | Phase 5 | Pending |
| MCP-09 | Phase 5 | Pending |
| MCP-10 | Phase 5 | Pending |
| VSC-01 | Phase 7 | Pending |
| VSC-02 | Phase 7 | Pending |
| VSC-03 | Phase 7 | Pending |
| VSC-04 | Phase 7 | Pending |
| VSC-05 | Phase 7 | Pending |
| VSC-06 | Phase 7 | Pending |
| VSC-07 | Phase 7 | Pending |
| VSC-08 | Phase 7 | Pending |
| VSC-09 | Phase 7 | Pending |
| VSC-10 | Phase 7 | Pending |
| SCALE-01 | Phase 8 | Pending |
| SCALE-02 | Phase 8 | Pending |
| SCALE-03 | Phase 8 | Pending |
| SCALE-04 | Phase 8 | Pending |
| DX-01 | Phase 6 | Pending |
| DX-02 | Phase 6 | Pending |
| DX-03 | Phase 6 | Pending |
| DX-04 | Phase 6 | Pending |
| DX-05 | Phase 6 | Pending |
| DX-06 | Phase 6 | Pending |
| AI-01 | Phase 6 | Pending |
| AI-02 | Phase 6 | Pending |
| AI-03 | Phase 6 | Pending |
| AI-04 | Phase 6 | Pending |

**Coverage:**
- v1 requirements: 66 total
- Mapped to phases: 66
- Unmapped: 0

---
*Requirements defined: 2026-02-14*
*Last updated: 2026-02-14 after roadmap creation*
