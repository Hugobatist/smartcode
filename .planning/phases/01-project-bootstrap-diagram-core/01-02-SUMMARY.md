---
phase: 01-project-bootstrap-diagram-core
plan: 02
subsystem: diagram-core
tags: [mermaid, parser, annotations, validator, service, project-manager, esm]

# Dependency graph
requires:
  - phase: 01-01
    provides: "Buildable ESM TypeScript project, diagram domain types, logger, path utilities"
provides:
  - "DiagramService class for all .mmd file operations (read, write, parse, validate, flag management)"
  - "Annotation system (parseFlags, stripAnnotations, injectAnnotations) with round-trip integrity"
  - "Mermaid syntax validator with bracket matching and dangling arrow detection"
  - "ProjectManager for multi-project management with independent DiagramService instances"
  - "discoverMmdFiles using Node.js built-in fs.glob"
  - "53 passing tests across 6 test files"
affects: [02-http-server, 03-websocket, 04-ui, 05-mcp, 06-dx-ai, 07-vscode, 08-scale]

# Tech tracking
tech-stack:
  added: []
  patterns: [annotation-block-parsing, regex-heuristic-validation, service-per-project, node-builtin-glob]

key-files:
  created:
    - src/diagram/annotations.ts
    - src/diagram/parser.ts
    - src/diagram/validator.ts
    - src/diagram/service.ts
    - src/project/discovery.ts
    - src/project/manager.ts
    - test/diagram/annotations.test.ts
    - test/diagram/parser.test.ts
    - test/diagram/validator.test.ts
    - test/diagram/service.test.ts
    - test/project/manager.test.ts
    - test/fixtures/valid-flowchart.mmd
    - test/fixtures/with-flags.mmd
    - test/fixtures/malformed.mmd
    - test/fixtures/multi-project/project-a/diagram.mmd
    - test/fixtures/multi-project/project-b/diagram.mmd
  modified:
    - src/index.ts

key-decisions:
  - "Node.js built-in fs.glob instead of fast-glob to avoid CJS-to-ESM bundling issues with tsup"
  - "Regex heuristic validator instead of @mermaid-js/parser since it lacks flowchart support (only info, packet, pie, architecture, gitGraph, radar)"
  - "Annotation block format: %% --- ANNOTATIONS (auto-managed by SmartB Diagrams) --- as start/end markers"

patterns-established:
  - "Annotation block: delimited by ANNOTATION_START/END markers, flags as %% @flag nodeId \"message\""
  - "Service-per-project: each project directory gets its own DiagramService with independent path security"
  - "Validator tolerance: heuristic catches obvious errors (brackets, dangling arrows), browser Mermaid catches the rest"
  - "Round-trip integrity: stripAnnotations(injectAnnotations(content, flags)) returns original clean content"

# Metrics
duration: 6min
completed: 2026-02-14
---

# Phase 1 Plan 02: Diagram Service Summary

**Diagram service with .mmd parsing, flag annotation round-trip, regex-based Mermaid validation, and multi-project management via Node.js built-in APIs**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-14T18:13:04Z
- **Completed:** 2026-02-14T18:18:55Z
- **Tasks:** 2
- **Files modified:** 17

## Accomplishments
- Full annotation system (parse, strip, inject) with round-trip integrity and quote escaping
- Mermaid syntax validator using regex heuristics (bracket matching, dangling arrows, diagram type detection) since @mermaid-js/parser lacks flowchart support
- DiagramService class as single entry point for all .mmd operations with path traversal protection
- ProjectManager managing multiple project directories with independent DiagramService instances
- 53 passing tests across 6 test files (annotations: 13, parser: 9, validator: 8, service: 11, manager: 8, smoke: 4)
- All public APIs exported from package barrel (DiagramService, ProjectManager, parseFlags, stripAnnotations, injectAnnotations, validateMermaidSyntax, discoverMmdFiles, parseDiagramType, parseDiagramContent)
- Build output 15KB (clean ESM, no CJS bundling issues)

## Task Commits

Each task was committed atomically:

1. **Task 1: Annotation parsing, Mermaid parser, validator, and test fixtures** - `a0ed068` (feat)
2. **Task 2: DiagramService, ProjectManager, integration tests, and barrel exports** - `93e238f` (feat)

## Files Created/Modified
- `src/diagram/annotations.ts` - parseFlags, stripAnnotations, injectAnnotations with annotation block markers
- `src/diagram/parser.ts` - parseDiagramType (11 known types), parseDiagramContent convenience function
- `src/diagram/validator.ts` - validateMermaidSyntax with bracket matching and dangling arrow detection
- `src/diagram/service.ts` - DiagramService class with read/write/parse/validate/flag operations
- `src/project/discovery.ts` - discoverMmdFiles using Node.js built-in fs.glob
- `src/project/manager.ts` - ProjectManager with addProject/removeProject/getProject/listProjects/discoverAll
- `src/index.ts` - Updated barrel export with all public APIs
- `test/diagram/annotations.test.ts` - 13 tests: parseFlags, stripAnnotations, injectAnnotations, round-trip
- `test/diagram/parser.test.ts` - 9 tests: parseDiagramType, parseDiagramContent
- `test/diagram/validator.test.ts` - 8 tests: valid/invalid content, error structure, bracket/arrow detection
- `test/diagram/service.test.ts` - 11 tests: read/write round-trip, path traversal, flag operations, listFiles
- `test/project/manager.test.ts` - 8 tests: add/remove/get/list projects, discoverAll
- `test/fixtures/valid-flowchart.mmd` - Valid Mermaid flowchart LR with 4 nodes
- `test/fixtures/with-flags.mmd` - Flowchart with 2 flag annotations (B and C)
- `test/fixtures/malformed.mmd` - Intentionally broken syntax (unclosed brackets, dangling arrow)
- `test/fixtures/multi-project/project-a/diagram.mmd` - Simple TD flowchart
- `test/fixtures/multi-project/project-b/diagram.mmd` - Simple LR flowchart

## Decisions Made
- Used Node.js built-in `fs.glob` (available since Node 22) instead of `fast-glob` to avoid CJS-to-ESM bundling issues with tsup -- fast-glob uses dynamic `require('os')` which fails in ESM bundle
- Chose regex heuristic validator instead of `@mermaid-js/parser` since the parser (v0.6) only supports info, packet, pie, architecture, gitGraph, and radar -- NOT flowchart, which is SmartB's primary diagram type
- Annotation block uses explicit start/end markers (`%% --- ANNOTATIONS (auto-managed by SmartB Diagrams) ---`) for reliable parsing

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Replaced fast-glob with Node.js built-in fs.glob**
- **Found during:** Task 2 (DiagramService and barrel exports)
- **Issue:** `fast-glob` is a CommonJS package. When tsup bundles it into ESM, dynamic `require('os')` calls fail at runtime with "Dynamic require of 'os' is not supported"
- **Fix:** Replaced `fast-glob` import in `src/project/discovery.ts` with `node:fs/promises` built-in `glob()` function (available since Node 22)
- **Files modified:** `src/project/discovery.ts`
- **Verification:** Build succeeds (15KB vs 200KB), REPL import works, all tests pass
- **Committed in:** `93e238f` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential fix for runtime correctness. No scope creep. Node.js built-in glob is actually a better fit (no external dependency, smaller bundle).

## Issues Encountered
- `@mermaid-js/parser` v0.6 does not support flowchart diagrams -- only info, packet, pie, architecture, gitGraph, radar. This was anticipated by the plan (which specified a regex fallback) and is documented in the validator comments.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 1 complete: project bootstrap + diagram core fully operational
- DiagramService and ProjectManager are ready for consumption by HTTP server (Phase 2), WebSocket (Phase 3), and all future phases
- All 53 tests pass, build succeeds, types exported
- Static assets bundled for future HTTP server serving
- No blockers for Phase 2

## Self-Check: PASSED

All 17 created files verified present. Both task commits (a0ed068, 93e238f) verified in git log.

---
*Phase: 01-project-bootstrap-diagram-core*
*Completed: 2026-02-14*
