# SmartB Diagrams

**See what your AI is thinking.** A visual debugger for AI reasoning — watch your AI agent think in real-time, set breakpoints, flag mistakes, and replay sessions.

[![npm version](https://img.shields.io/npm/v/smartb-diagrams.svg)](https://www.npmjs.com/package/smartb-diagrams)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.17-brightgreen.svg)](https://nodejs.org/)

---

## Why SmartB Diagrams?

AI coding tools are **black boxes**. You give Cursor, Claude Code, or Copilot a task and wait. If it goes down a wrong path, you only find out when it's done — after wasted time and tokens.

SmartB Diagrams makes AI reasoning **visible and controllable**:

- **See** the AI's reasoning as a live flowchart that updates in real-time
- **Intervene** by flagging nodes mid-execution — the AI reads your feedback and course-corrects
- **Debug** with breakpoints that pause AI execution at specific reasoning steps
- **Understand** what the AI considered and rejected via ghost paths
- **Analyze** patterns with session replay and heatmaps

It's the **Datadog for AI reasoning** — not another AI tool, but a plugin that makes your existing tools transparent.

## Quick Start

```bash
npm install -g smartb-diagrams
smartb init
smartb serve
```

Your browser opens with a live diagram viewer. Edit any `.mmd` file and see changes instantly.

## Key Features

### Real-Time AI Observability

AI agents write Mermaid diagrams via MCP tools. A file watcher detects changes and pushes updates to your browser via WebSocket — all within 100ms.

### Interactive Canvas

Custom SVG renderer with dagre layout engine. Select, drag, edit, delete, and connect nodes directly on the canvas. Full undo/redo support (Ctrl+Z / Ctrl+Shift+Z).

### AI Breakpoints

Set breakpoints on diagram nodes. When the AI reaches that node, it **pauses** and waits for you to review. Click "Continue" when ready — just like a code debugger, but for AI reasoning.

### Ghost Paths

See the reasoning branches the AI considered but **rejected**. Rendered as dashed translucent edges, ghost paths reveal the "deleted scenes" of AI thinking — information normally invisible.

### Developer Flags

Click any node to flag it with a message. The AI reads your flag via MCP, gets structured correction context, and adjusts its approach. Bidirectional human-AI communication embedded in the diagram.

### Session Recording & Replay

Every AI reasoning session is recorded as JSONL. Replay sessions with a timeline scrubber at 1x/2x/4x speed. Diff highlighting shows what changed between frames.

### Risk Heatmap

Color-code nodes by visit frequency (cold blue to hot red). Identify which reasoning steps the AI revisits most — potential confusion points or bottlenecks.

### Node Status Tracking

Color-coded progress: green (ok), yellow (in-progress), red (problem), gray (discarded). See at a glance where the AI succeeded and where it struggled.

## CLI Reference

### `smartb init`

Initialize a SmartB project.

```bash
smartb init [--dir <path>] [--force]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--dir <path>` | `.` | Project directory |
| `--force` | `false` | Overwrite existing config |

### `smartb serve`

Start the diagram viewer server.

```bash
smartb serve [--port <number>] [--dir <path>] [--no-open]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--port <number>` | `3333` | Server port |
| `--dir <path>` | `.` | Project directory |
| `--no-open` | `false` | Don't open browser automatically |

### `smartb status`

Check server health.

```bash
smartb status [--port <number>]
```

Shows uptime, diagram count, connected clients, and active flags.

### `smartb mcp`

Start the MCP server for AI tool integration.

```bash
smartb mcp [--dir <path>] [--serve] [--port <number>]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--dir <path>` | `.` | Project directory |
| `--serve` | `false` | Co-host HTTP+WS server for browser viewing |
| `--port <number>` | `3333` | HTTP server port (requires `--serve`) |

## MCP Integration

### Setup with Claude Code

One command:

```bash
claude mcp add --transport stdio smartb -- npx -y smartb-diagrams mcp --dir .
```

Or add a `.mcp.json` to your project root:

```json
{
  "mcpServers": {
    "smartb": {
      "command": "npx",
      "args": ["-y", "smartb-diagrams", "mcp", "--dir", "."]
    }
  }
}
```

### Setup with Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "smartb-diagrams": {
      "command": "npx",
      "args": ["-y", "smartb-diagrams", "mcp", "--dir", "/path/to/project"]
    }
  }
}
```

### With Browser Viewer

Run MCP and browser viewer in a single process:

```bash
smartb mcp --dir . --serve --port 3333
```

AI tool calls and browser updates share the same `DiagramService` — zero-latency sync.

## MCP Tools

SmartB exposes 11 tools via the Model Context Protocol:

| Tool | Description |
|------|-------------|
| `update_diagram` | Create or update a `.mmd` file |
| `read_flags` | Read developer feedback annotations |
| `get_diagram_context` | Get full diagram state (content, flags, statuses, validation) |
| `update_node_status` | Set node status: `ok` / `problem` / `in-progress` / `discarded` |
| `get_correction_context` | Get structured correction prompt for a flagged node |
| `check_breakpoints` | Check if AI should pause at the current node |
| `record_ghost_path` | Record a discarded reasoning branch |
| `start_session` | Begin a recording session |
| `record_step` | Record a node visit in the active session |
| `end_session` | End session and get summary statistics |
| `set_risk_level` | Set risk annotation (high/medium/low) on a node |

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` | Redo |
| `Ctrl+C` / `Ctrl+V` | Copy / Paste |
| `Ctrl+D` | Duplicate |
| `Ctrl+F` | Search nodes |
| `Delete` | Delete selected |
| `Escape` | Deselect |
| Mouse wheel | Zoom |
| Click + drag | Pan |

## AI Diagram Conventions

### Diagram Direction

- `flowchart TD` for sequential reasoning (top to bottom)
- `flowchart LR` for parallel or branching logic (left to right)

### Node Naming

- IDs: lowercase-hyphenated (`analyze-requirements`)
- Labels: short action phrases (`["Analyze Requirements"]`)

### Status Annotations

```
%% @status analyze-requirements ok            -- completed (green)
%% @status design-schema in-progress          -- working (yellow)
%% @status implement-api problem              -- issue found (red)
%% @status abandoned-approach discarded       -- abandoned (gray)
```

### Developer Flags

```
%% @flag design-schema "Consider normalized schema instead"
```

### Example CLAUDE.md Integration

Add to your project's `CLAUDE.md`:

```markdown
## SmartB Diagrams

- Use `update_diagram` to create/update .mmd reasoning diagrams
- Use `flowchart TD` for sequential steps, node IDs lowercase-hyphenated
- Set nodes to `in-progress` when starting, `ok` when done, `problem` on issues
- Check `read_flags` before starting — respond to developer feedback
- Use `get_correction_context` when flags exist for structured guidance
```

## Architecture

```
Developer's Machine (single process)
+-----------------------------------------------+
|  smartb serve / smartb mcp --serve             |
|                                                |
|  +------------------+  +-------------------+   |
|  | MCP Server       |  | HTTP Server       |   |
|  | (stdio transport)|  | (port 3333)       |   |
|  +--------+---------+  +--------+----------+   |
|           |                      |              |
|           v                      v              |
|  +------------------------------------------+  |
|  |          DiagramService (shared)          |  |
|  |  parse | validate | annotate | serialize  |  |
|  +------------------------------------------+  |
|           |                      |              |
|           v                      v              |
|  +----------------+    +------------------+     |
|  | File Watcher   |--->| WebSocket Server |     |
|  | (.mmd files)   |    | (broadcast)      |     |
|  +----------------+    +------------------+     |
+-----------------------------------------------+
          |                        |
          v                        v
   .mmd files on disk       Browser / VS Code
   (source of truth)         (live viewer)
```

## Requirements

- Node.js >= 18.17
- npm or npx

## Contributing

Contributions are welcome! Please open an issue first to discuss what you'd like to change.

```bash
git clone https://github.com/Hugobatist/smartb-diagrams.git
cd smartb-diagrams
npm install
npm run build
npm test
```

## License

[MIT](LICENSE)
