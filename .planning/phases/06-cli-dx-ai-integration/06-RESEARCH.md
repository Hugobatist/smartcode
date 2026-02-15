# Phase 6: CLI + Developer Experience + AI Integration - Research

**Researched:** 2026-02-15
**Domain:** CLI scaffolding, server diagnostics, MCP zero-config setup, AI diagram conventions, flag-to-prompt pipeline
**Confidence:** HIGH

## Summary

Phase 6 covers three distinct but interconnected domains: (1) CLI polish with `smartb init`, enhanced `smartb serve`, and new `smartb status`; (2) zero-config MCP integration and developer-friendly error messages; and (3) AI agent conventions for diagram generation plus a `get_correction_context` tool that converts developer flags into structured correction prompts.

The existing codebase is well-positioned for this phase. The CLI already uses `commander` (v14) with `serve` and `mcp` subcommands. The `serve` command already opens the browser via the `open` package. The MCP server already works with `StdioServerTransport` and shares `DiagramService` with the HTTP server. The flag annotation system (`%% @flag nodeId "message"`) is robust and can be leveraged directly for the flag-to-prompt pipeline. `picocolors` is already a dependency used in the logger for colored stderr output.

The main new engineering work is: (a) `smartb init` project scaffolding (write a config file + sample `.mmd`), (b) `smartb status` diagnostics via an HTTP health endpoint on the running server, (c) a new MCP tool `get_correction_context` that reads flags and surrounding diagram state to produce a structured AI correction prompt, and (d) documentation artifacts (CLAUDE.md template, Mermaid conventions, README quick start).

**Primary recommendation:** Implement CLI commands using existing `commander` patterns with `picocolors` for styled output. For `smartb status`, add an HTTP `/api/status` endpoint to the running server and have the CLI command make an HTTP request to it. For `get_correction_context`, implement it as an MCP tool (not a prompt) since it needs to read state and return structured data. Keep AI conventions as a documented schema in a markdown file, not enforced code.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `commander` | ^14.0.3 | CLI subcommand framework | Already in project; handles init/serve/status commands |
| `picocolors` | ^1.1.1 | Terminal color output | Already in project (devDep); lightweight (3.8kb), zero deps |
| `open` | ^11.0.0 | Open browser from CLI | Already in project; used by `smartb serve` |
| `@modelcontextprotocol/sdk` | ^1.26.0 | MCP server and tools | Already in project; needed for `get_correction_context` tool |
| `zod` | ^4.3.6 | Schema validation for MCP | Already in project; needed for new tool input schemas |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `detect-port` | ^2.1.0 | Port availability check | Already in project; used for better error messages in DX-06 |
| `node:fs/promises` | built-in | File system for init scaffolding | Creating config and sample .mmd files |
| `node:http` | built-in | HTTP client for status command | Querying the running server's /api/status endpoint |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| HTTP status endpoint | PID file / lock file | PID file is unreliable (stale PID if process crashes); HTTP endpoint gives live data (connected clients, flags) |
| `picocolors` for CLI output | `chalk` | chalk is 6x larger, picocolors already in project |
| `get_correction_context` as MCP tool | MCP prompt | Tools return structured data to AI; prompts inject messages into conversation. Tool is more appropriate since we return JSON context, not conversation messages. However, MCP prompts could complement tools for user-triggered correction workflows |
| Writing conventions as code enforcement | Writing conventions as documentation | Documentation is cheaper and more flexible; AI agents read markdown instructions, not type systems |

**Installation:**
```bash
# No new dependencies needed -- all are already in the project
# picocolors should move from devDependencies to dependencies (currently devDep only)
npm install picocolors
```

## Architecture Patterns

### Recommended Project Structure
```
src/
  cli.ts                    # Add init, status commands; keep serve + mcp
  cli/
    init.ts               # smartb init scaffolding logic
    status.ts             # smartb status HTTP client logic
  server/
    routes.ts             # Add GET /api/status endpoint
    ...                   # Existing HTTP/WS server
  mcp/
    tools.ts              # Add get_correction_context tool
    schemas.ts            # Add GetCorrectionContextInput schema
    ...                   # Existing MCP server
  utils/
    logger.ts             # Already uses picocolors
```

### Pattern 1: CLI Init Scaffolding
**What:** `smartb init` creates a minimal project structure in the current directory: a `.smartb.json` config file and a sample `reasoning.mmd` diagram file.
**When to use:** When a developer sets up SmartB in a new project for the first time.
**Example:**
```typescript
// Source: Derived from project conventions and CLI patterns
import { writeFile, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import pc from 'picocolors';

const CONFIG_FILE = '.smartb.json';
const SAMPLE_DIAGRAM = 'reasoning.mmd';

const DEFAULT_CONFIG = {
  version: 1,
  diagramDir: '.',
  port: 3333,
};

const SAMPLE_CONTENT = `flowchart LR
    Start["Problem Statement"] --> Analyze["Analyze Requirements"]
    Analyze --> Plan["Create Plan"]
    Plan --> Implement["Implement Solution"]
    Implement --> Verify["Verify Results"]
    Verify --> Done["Complete"]
`;

export async function initProject(dir: string): Promise<void> {
  const configPath = path.join(dir, CONFIG_FILE);

  // Check if already initialized
  try {
    await access(configPath);
    throw new Error(`Already initialized: ${CONFIG_FILE} exists`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }

  // Write config
  await writeFile(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n');

  // Write sample diagram
  const diagramPath = path.join(dir, SAMPLE_DIAGRAM);
  await writeFile(diagramPath, SAMPLE_CONTENT);

  console.log(pc.green('Initialized SmartB Diagrams'));
  console.log(`  Config: ${pc.dim(CONFIG_FILE)}`);
  console.log(`  Sample: ${pc.dim(SAMPLE_DIAGRAM)}`);
  console.log('');
  console.log(`Run ${pc.cyan('smartb serve')} to start the viewer`);
}
```

### Pattern 2: Status via HTTP Health Endpoint
**What:** `smartb status` queries a running server's `/api/status` endpoint to show diagnostics. The server exposes a GET endpoint that returns server uptime, connected WebSocket clients, and active flags.
**When to use:** When developers want to check if the server is running and see its state without opening the browser.
**Example:**
```typescript
// Source: Derived from existing server/routes.ts pattern
// Server side: add to registerRoutes()
routes.push({
  method: 'GET',
  pattern: new RegExp('^/api/status$'),
  handler: async (_req, res) => {
    const files = await service.listFiles();
    // Count connected WS clients across all namespaces
    const clientCount = wsManager.getClientCount();
    // Collect all flags across all files
    const allFlags: Array<{ file: string; nodeId: string; message: string }> = [];
    for (const file of files) {
      const flags = await service.getFlags(file);
      for (const flag of flags) {
        allFlags.push({ file, nodeId: flag.nodeId, message: flag.message });
      }
    }
    sendJson(res, {
      status: 'running',
      uptime: process.uptime(),
      port: actualPort,
      projectDir,
      files: files.length,
      connectedClients: clientCount,
      activeFlags: allFlags,
    });
  },
});

// Client side: smartb status
import { request as httpReq } from 'node:http';

function httpGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = httpReq(url, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(Buffer.concat(chunks).toString('utf-8'));
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

export async function showStatus(port: number): Promise<void> {
  try {
    const data = await httpGet(`http://localhost:${port}/api/status`);
    const status = JSON.parse(data);
    console.log(pc.green('Server is running'));
    console.log(`  Port: ${status.port}`);
    console.log(`  Uptime: ${formatUptime(status.uptime)}`);
    console.log(`  Files: ${status.files}`);
    console.log(`  Connected clients: ${status.connectedClients}`);
    console.log(`  Active flags: ${status.activeFlags.length}`);
  } catch {
    console.log(pc.red('Server is not running'));
    console.log(`  Tried port ${port}`);
    console.log(`  Run ${pc.cyan('smartb serve')} to start`);
  }
}
```

### Pattern 3: get_correction_context MCP Tool
**What:** A new MCP tool that reads flags from a diagram and returns a structured prompt context containing the flag message, the flagged node's context (edges, labels), and the full diagram state. This enables AI agents to course-correct based on developer feedback.
**When to use:** When an AI agent needs to respond to developer flags on a diagram.
**Example:**
```typescript
// Source: Designed from existing MCP tools pattern + AI-02/AI-03 requirements
server.registerTool(
  'get_correction_context',
  {
    description:
      'Get structured correction context for a flagged node. Returns the flag message, ' +
      'the node context, and the full diagram for context. ' +
      'Use this when a developer has flagged a node for correction.',
    inputSchema: {
      filePath: z.string().describe('Relative path to the .mmd file'),
      nodeId: z.string().describe('ID of the flagged node to get correction context for'),
    },
  },
  async ({ filePath, nodeId }) => {
    const diagram = await service.readDiagram(filePath);
    const flag = diagram.flags.get(nodeId);
    if (!flag) {
      return {
        content: [{ type: 'text', text: `No flag found on node "${nodeId}"` }],
        isError: true,
      };
    }

    // Build correction context
    const context = {
      correction: {
        nodeId: flag.nodeId,
        flagMessage: flag.message,
      },
      diagramState: {
        filePath,
        mermaidContent: diagram.mermaidContent,
        allFlags: Array.from(diagram.flags.values()),
        statuses: Object.fromEntries(diagram.statuses),
      },
      instruction: `The developer flagged node "${nodeId}" with the message: "${flag.message}". ` +
        `Review the diagram and update it to address this feedback. ` +
        `Use update_diagram to write the corrected diagram.`,
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(context, null, 2) }],
    };
  }
);
```

### Pattern 4: Zero-Config MCP Entry
**What:** The MCP integration should work with a single JSON entry in `claude_desktop_config.json` or `.mcp.json`, with no additional setup needed.
**When to use:** This is the standard developer onboarding path for MCP.
**Example:**
```json
// For Claude Desktop (~/Library/Application Support/Claude/claude_desktop_config.json)
{
  "mcpServers": {
    "smartb-diagrams": {
      "command": "npx",
      "args": ["-y", "smartb-diagrams", "mcp", "--dir", "."]
    }
  }
}
```

```json
// For Claude Code (.mcp.json at project root, checked into version control)
{
  "mcpServers": {
    "smartb": {
      "command": "npx",
      "args": ["-y", "smartb-diagrams", "mcp", "--dir", "."]
    }
  }
}
```

```bash
# For Claude Code via CLI:
claude mcp add --transport stdio smartb -- npx -y smartb-diagrams mcp --dir .
```

```json
// For globally installed smartb:
{
  "mcpServers": {
    "smartb": {
      "command": "smartb",
      "args": ["mcp", "--dir", "/path/to/project"]
    }
  }
}
```

### Anti-Patterns to Avoid
- **Interactive prompts in `smartb init`:** Do not use inquirer or readline for interactive setup. SmartB init should be zero-interaction: create config + sample file and exit. Interactive prompts are a DX anti-pattern for tools that need to work in CI/scripts.
- **PID file for status:** Do not write PID files to track the running server. They go stale when the process crashes. Use an HTTP health check endpoint instead -- it either responds (running) or fails to connect (not running).
- **Console.log in MCP-adjacent code:** The `get_correction_context` tool and any shared code path must never use `console.log()`. Stick to the existing `log.*` pattern that writes to stderr.
- **Enforcing diagram conventions in code:** Do not add runtime validation that rejects diagrams not following the AI convention schema. Conventions are documentation for AI agents, not enforcement code.
- **Large monolithic cli.ts:** Do not add all init/status logic directly to cli.ts. Extract handler logic into `src/cli/init.ts` and `src/cli/status.ts` to keep cli.ts under 80 lines.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CLI argument parsing | Manual argv parsing | `commander` (already installed) | Handles --help, --version, subcommands, option defaults |
| Terminal colors | ANSI escape codes | `picocolors` (already installed) | Cross-platform, handles NO_COLOR env var |
| Port availability | `net.createServer().listen().close()` | `detect-port` (already installed) | Handles race conditions, finds next available |
| Browser opening | `child_process` calls | `open` package (already installed) | Cross-platform (macOS, Linux, Windows), WSL support |
| MCP tool registration | Raw JSON-RPC handler | `McpServer.registerTool()` (SDK) | Auto-handles discovery, validation, error formatting |

**Key insight:** All libraries needed for Phase 6 are already installed. The main work is writing business logic (init scaffolding, status endpoint, correction context builder) and documentation artifacts (README, CLAUDE.md template, conventions).

## Common Pitfalls

### Pitfall 1: Status Endpoint Needs Server-Level Access
**What goes wrong:** The `/api/status` endpoint needs access to `WebSocketManager` to count connected clients, but `registerRoutes()` currently only receives `DiagramService` and `projectDir`.
**Why it happens:** The route registration function was designed before server-level diagnostics were needed.
**How to avoid:** Either pass `WebSocketManager` as an additional parameter to `registerRoutes()`, or add a `getClientCount()` method to `ServerInstance` and pass that. The cleaner approach is extending `registerRoutes()` with an optional context object.
**Warning signs:** Status endpoint returns 0 clients even when browsers are connected.

### Pitfall 2: picocolors as devDependency
**What goes wrong:** `picocolors` is currently listed in `devDependencies`, but it's imported by `src/utils/logger.ts` which runs in production. If a user installs `smartb-diagrams` globally with `npm install -g`, `picocolors` won't be available.
**Why it happens:** It was added as a devDependency during initial development when tests were the primary consumer.
**How to avoid:** Move `picocolors` from `devDependencies` to `dependencies` in `package.json`. This should be done as the first task in this phase.
**Warning signs:** `Error: Cannot find module 'picocolors'` when running `smartb` after global install.

### Pitfall 3: Init Overwriting Existing Files
**What goes wrong:** Running `smartb init` in a directory that already has `.smartb.json` or `reasoning.mmd` could overwrite existing work.
**Why it happens:** No existence check before writing.
**How to avoid:** Check for existing files before writing and fail with a helpful message: "Already initialized. Use --force to reinitialize."
**Warning signs:** Developer loses their diagram content after accidentally running init again.

### Pitfall 4: Status Command Port Mismatch
**What goes wrong:** `smartb status` tries port 3333 but the server is running on a different port (due to port fallback).
**Why it happens:** The CLI defaults to port 3333 but the server may have fallen back to 3334 or another port.
**How to avoid:** Accept `--port` option on `smartb status`. Also consider having the server write its actual port to a `.smartb-server.json` ephemeral lock file (not committed) that the status command reads.
**Warning signs:** Status shows "not running" even though the server is active on a different port.

### Pitfall 5: get_correction_context Without Node Context
**What goes wrong:** The correction context only includes the flag message and raw Mermaid content, but doesn't extract the specific node's edges and connections. The AI gets a wall of Mermaid text without targeted guidance.
**Why it happens:** The existing parser (`parseDiagramContent`) doesn't extract individual node relationships from the Mermaid source.
**How to avoid:** For v1, include the full Mermaid content plus the flag message -- this is sufficient for AI agents that can parse Mermaid. Extracting individual node relationships (edges, neighbors) is a nice-to-have that can be deferred. The `instruction` field in the response provides the targeted guidance.
**Warning signs:** AI responses that modify the wrong part of the diagram because they lacked context.

### Pitfall 6: README and CLAUDE.md Not Bundled
**What goes wrong:** The README and example CLAUDE.md are created but not discoverable by users or AI agents.
**Why it happens:** These are documentation files, not code -- they need to be in the right place for their audience.
**How to avoid:** README.md goes in the project root (npm publishes it automatically). The example CLAUDE.md instructions could be output by `smartb init` or included in the README. Consider a `smartb init --with-claude-md` option.
**Warning signs:** Users don't know how to set up MCP; AI agents don't follow diagram conventions.

## Code Examples

Verified patterns from official sources and the existing codebase:

### Commander Subcommand Registration (Existing Pattern)
```typescript
// Source: Existing src/cli.ts pattern in this project
program
  .command('init')
  .description('Initialize SmartB Diagrams in the current directory')
  .option('-d, --dir <path>', 'target directory', '.')
  .option('--force', 'overwrite existing files')
  .action(async (options: { dir: string; force?: boolean }) => {
    const { initProject } = await import('./cli/init.js');
    await initProject(options.dir, options.force);
  });

program
  .command('status')
  .description('Show server status, connected clients, and active flags')
  .option('-p, --port <number>', 'server port', '3333')
  .action(async (options: { port: string }) => {
    const { showStatus } = await import('./cli/status.js');
    await showStatus(parseInt(options.port, 10));
  });
```

### MCP Tool with Structured JSON Response (Existing Pattern)
```typescript
// Source: Existing src/mcp/tools.ts pattern in this project
server.registerTool(
  'get_correction_context',
  {
    description: 'Get structured correction prompt for a flagged diagram node...',
    inputSchema: GetCorrectionContextInput,
  },
  async ({ filePath, nodeId }) => {
    try {
      // ... build context object ...
      return {
        content: [{ type: 'text', text: JSON.stringify(context, null, 2) }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [{ type: 'text', text: message }],
        isError: true,
      };
    }
  }
);
```

### HTTP GET Client for Status (Node.js Built-in)
```typescript
// Source: Node.js built-in http module
import { request as httpReq } from 'node:http';

function httpGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = httpReq(url, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(Buffer.concat(chunks).toString('utf-8'));
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}
```

### MCP Configuration for Claude Code (Verified)
```bash
# Source: https://code.claude.com/docs/en/mcp
# Add via CLI:
claude mcp add --transport stdio smartb -- npx -y smartb-diagrams mcp --dir .

# Or via .mcp.json at project root (checked into version control):
```
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

### MCP Configuration for Claude Desktop (Verified)
```json
// Source: https://modelcontextprotocol.io/docs/develop/connect-local-servers
// File: ~/Library/Application Support/Claude/claude_desktop_config.json
{
  "mcpServers": {
    "smartb-diagrams": {
      "command": "npx",
      "args": ["-y", "smartb-diagrams", "mcp", "--dir", "/path/to/project"]
    }
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| MCP only in claude_desktop_config.json | `.mcp.json` at project root for team sharing | Claude Code 2025 | Teams can share MCP config via version control |
| `claude mcp add` with manual JSON | `claude mcp add --transport stdio` CLI | Claude Code 2025 | Simpler setup, no JSON editing needed |
| `--scope global` | `--scope user` | Claude Code late 2025 | Renamed for clarity; `--scope project` writes `.mcp.json` |
| Manual MCP server configuration | Desktop Extensions for one-click install | Anthropic 2025 | Streamlined install UX (not relevant for stdio servers yet) |

**Deprecated/outdated:**
- SSE transport in MCP: Deprecated in favor of Streamable HTTP. Not relevant for SmartB (uses stdio).
- `server.tool()` / `server.prompt()`: Legacy variadic API in MCP SDK. Use `registerTool()` / `registerPrompt()`.
- `--scope global` flag in Claude Code: Renamed to `--scope user`.

## AI Diagram Convention Design

### Convention Schema (AI-01)
The convention defines how AI agents should structure reasoning diagrams. This is documentation, not enforced code.

**Recommended Mermaid flowchart conventions for AI reasoning:**
```
flowchart TD
    %% Node ID naming: lowercase-hyphenated (e.g., analyze-requirements)
    %% Node labels: Short action phrases in quotes (e.g., "Analyze Requirements")
    %% Diagram direction: TD for sequential reasoning, LR for parallel/branching

    %% Status annotations track progress:
    %% @status nodeId ok          -- step completed successfully (green)
    %% @status nodeId in-progress -- currently working on this (yellow)
    %% @status nodeId problem     -- encountered an issue (red)
    %% @status nodeId discarded   -- abandoned this approach (gray)

    %% Flag annotations for developer feedback:
    %% @flag nodeId "message"     -- developer feedback on this step
```

### get_correction_context Response Shape (AI-02, AI-03)
```typescript
interface CorrectionContext {
  correction: {
    nodeId: string;
    flagMessage: string;
  };
  diagramState: {
    filePath: string;
    mermaidContent: string;
    allFlags: Array<{ nodeId: string; message: string }>;
    statuses: Record<string, string>;
  };
  instruction: string;  // Natural language instruction for AI
}
```

### Example CLAUDE.md for AI Agents (AI-04)
The CLAUDE.md template would include:
1. How to update diagrams via `update_diagram` MCP tool
2. Mermaid conventions (node naming, status usage)
3. How to read and respond to developer flags via `get_correction_context`
4. When to create new diagram files vs update existing ones

## Open Questions

1. **Config file format and name (.smartb.json)**
   - What we know: Need a config file for `smartb init`. The config should store at minimum the diagram directory and default port.
   - What's unclear: Should it be `.smartb.json` (dotfile, hidden) or `smartb.json` (visible)? Should it store the running server's actual port?
   - Recommendation: Use `.smartb.json` (consistent with `.mcp.json`, `.eslintrc.json` conventions). Do NOT store the running port in the committed config -- use a separate ephemeral `.smartb-server.json` that the server writes on startup and deletes on shutdown.

2. **WebSocketManager client count exposure**
   - What we know: `WebSocketManager` has access to `wss.clients` per namespace but doesn't expose a method to count them.
   - What's unclear: Should we add a `getClientCount()` method to `WebSocketManager`, or pass the WS manager to the routes?
   - Recommendation: Add a `getClientCount(namespace?: string): number` method to `WebSocketManager`. This keeps the API clean and avoids leaking WS internals to the routes module. Pass `WebSocketManager` reference via a context object to `registerRoutes()`.

3. **Should `smartb init` write the .mcp.json too?**
   - What we know: Users need to configure MCP separately from the SmartB init.
   - What's unclear: Should `smartb init` also create a `.mcp.json` with the SmartB MCP entry? This would be truly zero-config.
   - Recommendation: Yes, optionally. `smartb init` creates `.smartb.json` + sample `.mmd`. Print instructions for MCP setup. Consider a `smartb init --mcp` flag that also creates `.mcp.json`. Keep it simple for v1 -- just print the MCP setup command in the init output.

4. **Error message for "no .mmd files found" (DX-06)**
   - What we know: When `smartb serve` is run in a directory with no `.mmd` files, the server starts but the browser shows nothing.
   - What's unclear: Should the server refuse to start, or start and show a helpful empty state?
   - Recommendation: Start the server but log a prominent warning: "No .mmd files found in [dir]. Run 'smartb init' to create a sample diagram." The browser UI already handles empty states gracefully. Refusing to start would break the use case where an AI agent creates diagrams via MCP after the server starts.

5. **MCP Prompts vs Tools for correction context**
   - What we know: The MCP SDK supports both `registerTool()` and `registerPrompt()`. Tools return structured data. Prompts inject conversation messages.
   - What's unclear: Should `get_correction_context` be a tool, a prompt, or both?
   - Recommendation: Implement as a **tool** (returns structured JSON). Tools are more appropriate because: (a) the AI agent needs the data, not a conversation injection; (b) tools can return `isError: true` for error handling; (c) the existing pattern uses tools for all MCP interactions. A complementary MCP prompt could be added later for user-triggered correction workflows.

## Sources

### Primary (HIGH confidence)
- Existing codebase analysis: `src/cli.ts`, `src/server/server.ts`, `src/mcp/server.ts`, `src/mcp/tools.ts`, `src/mcp/schemas.ts`, `src/diagram/service.ts`, `src/diagram/annotations.ts`, `src/server/websocket.ts` -- all directly inspected
- Context7 `/tj/commander.js` -- subcommand registration, action handlers, option parsing
- Context7 `/modelcontextprotocol/typescript-sdk` -- `registerTool()`, `registerPrompt()` API with Zod schemas
- [Claude Code MCP Documentation](https://code.claude.com/docs/en/mcp) -- `.mcp.json` format, `claude mcp add` CLI, scope hierarchy (local/project/user), environment variable expansion
- [MCP Connect Local Servers](https://modelcontextprotocol.io/docs/develop/connect-local-servers) -- `claude_desktop_config.json` format, `npx -y` pattern for zero-config
- [MCP Prompts Specification](https://modelcontextprotocol.io/specification/2025-06-18/server/prompts) -- prompt registration, message structure, arguments

### Secondary (MEDIUM confidence)
- [Claude Help: MCP Setup](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop) -- claude_desktop_config.json location on macOS/Windows
- WebSearch on Node.js health check patterns -- HTTP endpoint approach for server status

### Tertiary (LOW confidence)
- AI diagram convention schema design -- no established standard exists; this is SmartB-specific design requiring validation through usage

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- All libraries already installed and verified in the project
- Architecture: HIGH -- Extends established patterns (commander subcommands, MCP tools, HTTP routes) already proven in phases 1-5
- CLI scaffolding (init/status): HIGH -- Simple file creation and HTTP client; well-understood patterns
- MCP zero-config: HIGH -- Verified via official Claude Code and Claude Desktop documentation
- get_correction_context tool: MEDIUM -- Tool design is sound but optimal AI prompt engineering is an empirical design choice requiring iteration
- AI conventions schema: LOW -- No industry standard; requires validation through actual AI agent usage
- Pitfalls: HIGH -- Based on direct codebase analysis (picocolors devDep, WebSocketManager exposure, port mismatch)

**Research date:** 2026-02-15
**Valid until:** 2026-03-15 (stable stack; watch for MCP SDK v2 release and Claude Code MCP configuration changes)
