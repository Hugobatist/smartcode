---
phase: 01-project-bootstrap-diagram-core
plan: 01
subsystem: infra
tags: [typescript, esm, tsup, vitest, commander, cli, npm-package]

# Dependency graph
requires: []
provides:
  - "Buildable ESM TypeScript project with tsup bundler"
  - "smartb CLI command globally installable via npm"
  - "Diagram domain types (DiagramNode, Flag, DiagramContent, ValidationResult, etc.)"
  - "stderr-only logger (stdout reserved for MCP stdio transport)"
  - "Cross-platform path utilities with traversal protection"
  - "Static asset bundling (live.html, annotations.js/css, diagram-editor.js)"
  - "vitest test infrastructure with smoke tests"
affects: [01-02, 02-http-server, 03-websocket, 04-ui, 05-mcp, 06-dx-ai, 07-vscode, 08-scale]

# Tech tracking
tech-stack:
  added: [typescript@~5.9, tsup@8.5, vitest@4.0, commander@14, picocolors@1, fast-glob, "@mermaid-js/parser"]
  patterns: [esm-only, stderr-logging, path-traversal-protection, static-asset-bundling]

key-files:
  created:
    - package.json
    - tsconfig.json
    - tsup.config.ts
    - vitest.config.ts
    - .gitignore
    - src/cli.ts
    - src/index.ts
    - src/diagram/types.ts
    - src/utils/logger.ts
    - src/utils/paths.ts
    - test/smoke.test.ts
  modified:
    - static/live.html (moved from root)
    - static/annotations.js (moved from root)
    - static/annotations.css (moved from root)
    - static/diagram-editor.js (moved from root)

key-decisions:
  - "Hardcoded version string in CLI instead of importing package.json to avoid ESM import assertion complexity"
  - "tsup onSuccess callback with cpSync for cross-platform static asset copy instead of shell cp command"
  - "Type-only barrel export in index.ts -- runtime exports are empty, types are in dist/index.d.ts"

patterns-established:
  - "stderr-only logging: all output via console.error, never console.log (stdout reserved for MCP stdio)"
  - "ESM-only: .js extension in imports, type:module in package.json"
  - "Path traversal protection: resolveProjectPath validates resolved path starts with project root"
  - "Static assets in static/ copied to dist/static/ during build via tsup onSuccess"

# Metrics
duration: 3min
completed: 2026-02-14
---

# Phase 1 Plan 01: Project Bootstrap Summary

**TypeScript ESM project with tsup build, smartb CLI via commander, diagram domain types, stderr logger, and static asset bundling**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-14T18:07:16Z
- **Completed:** 2026-02-14T18:10:25Z
- **Tasks:** 2
- **Files modified:** 15

## Accomplishments
- Fully buildable TypeScript project targeting Node.js 22 with ESM output via tsup
- `smartb` CLI command globally installable via `npm install -g .` with `--version` support
- All 8 diagram domain types exported from `dist/index.d.ts` (DiagramNode, Flag, DiagramContent, ValidationResult, ValidationError, DiagramEdge, NodeStatus, Project)
- Static assets (live.html, annotations.js/css, diagram-editor.js) bundled in dist/static/ after build
- stderr-only logger established -- no console.log in codebase
- Path traversal protection in resolveProjectPath utility
- 4 smoke tests passing via vitest

## Task Commits

Each task was committed atomically:

1. **Task 1: Project scaffolding** - `e84ca0d` (chore)
2. **Task 2: CLI, types, utilities, static assets, smoke tests** - `fb85be2` (feat)

## Files Created/Modified
- `package.json` - npm package config with bin, type:module, ESM exports, node>=22 engine
- `tsconfig.json` - TypeScript strict mode, Node16 module resolution
- `tsup.config.ts` - ESM build with node22 target, DTS generation, static asset copy
- `vitest.config.ts` - Test runner config with test/**/*.test.ts pattern
- `.gitignore` - Ignore node_modules, dist, tgz, DS_Store
- `src/cli.ts` - CLI entry point with shebang, commander setup, --version
- `src/index.ts` - Barrel export for all diagram domain types
- `src/diagram/types.ts` - NodeStatus, Flag, DiagramNode, DiagramEdge, DiagramContent, ValidationResult, ValidationError, Project
- `src/utils/logger.ts` - stderr-only logger using picocolors
- `src/utils/paths.ts` - getStaticDir, getStaticFile, resolveProjectPath with traversal protection
- `static/live.html` - Browser UI (moved from root via git mv)
- `static/annotations.js` - Flag system JS (moved from root via git mv)
- `static/annotations.css` - Flag styles (moved from root via git mv)
- `static/diagram-editor.js` - Editor JS (moved from root via git mv)
- `test/smoke.test.ts` - 4 smoke tests for imports, logger, path traversal, static dir

## Decisions Made
- Hardcoded version `'0.1.0'` in CLI instead of importing from package.json to avoid ESM import assertion complexity
- Used tsup `onSuccess` callback with `cpSync` from `node:fs` for cross-platform static asset copy instead of shell `cp -r`
- Type-only barrel export in `src/index.ts` -- runtime JS exports are empty, all types available via `dist/index.d.ts`

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Project foundation complete, ready for Plan 02 (diagram service, parser, annotations, validator)
- All types are defined and exported for consumption by diagram service modules
- Build, typecheck, and test infrastructure fully operational
- Static assets bundled for future HTTP server (Phase 2)

## Self-Check: PASSED

All 15 created files verified present. Both task commits (e84ca0d, fb85be2) verified in git log.

---
*Phase: 01-project-bootstrap-diagram-core*
*Completed: 2026-02-14*
