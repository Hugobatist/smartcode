---
phase: 10-graph-model-parser
plan: 02
subsystem: diagram
tags: [typescript, mermaid, parser, graph-model, tdd]

requires:
  - phase: 10-graph-model-parser
    provides: GraphModel type system, SHAPE_PATTERNS, 22 .mmd fixture files
  - phase: 01-project-bootstrap-diagram-core
    provides: annotations.ts (parseFlags, parseStatuses, stripAnnotations)
  - phase: 02-http-server
    provides: validator.ts (validateMermaidSyntax)
provides:
  - parseMermaidToGraph() function for converting raw .mmd to GraphModel
  - graph-edge-parser.ts helpers (parseNodeShape, parseEdgesFromLine, extractNodeSegments)
  - 30 unit tests covering all 8 parsing categories
affects: [10-03-serializer, 11-custom-renderer, mcp-tools]

tech-stack:
  added: []
  patterns: [multi-pass-pipeline, node-segment-extraction, chained-edge-parsing]

key-files:
  created:
    - src/diagram/graph-parser.ts
    - src/diagram/graph-edge-parser.ts
    - test/diagram/graph-parser.test.ts
  modified:
    - test/fixtures/graph/with-flags-and-statuses.mmd

key-decisions:
  - "Split parser into graph-parser.ts (orchestration, 350 lines) + graph-edge-parser.ts (helpers, 230 lines) to stay under 500-line limit"
  - "Edge operators ordered by specificity: bidirectional first, then labeled, then simple -- prevents partial matches"
  - "Implicit nodes created with shape 'rect' and label equal to ID when only referenced in edges"
  - "Inline :::className handled in both node-definition pass (with shape) and bare-reference pass (without shape)"

patterns-established:
  - "Multi-pass pipeline: preprocess, direction, styles, subgraphs, nodes, edges, annotations, validate"
  - "Edge chaining: parse leftmost operator, track lastNode, advance past node definition, repeat"
  - "Node segment extraction: replace edge operators with separator, split, parse each segment independently"

duration: 7min
completed: 2026-02-15
---

# Phase 10 Plan 02: parseMermaidToGraph Parser Summary

**Multi-pass Mermaid parser converting raw .mmd to GraphModel with 13 node shapes, 5 edge types, subgraphs, style directives, and annotation integration -- TDD with 30 tests**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-15T21:58:15Z
- **Completed:** 2026-02-15T22:05:55Z
- **Tasks:** 2
- **Files created:** 3
- **Files modified:** 1

## Accomplishments

- Complete TDD cycle: 30 failing tests (RED) then all passing (GREEN) with refactor for file size
- 7-pass parser pipeline: preprocessing, direction, styles, subgraphs, nodes, edges, validation
- Handles all 13 node shapes, 5 edge types, nested subgraphs, chained edges, bidirectional edges, implicit nodes, inline :::className, pipe/inline labels, classDef/style/linkStyle/class directives, and SmartB annotation integration
- All 22 fixture files parse correctly into GraphModel objects
- Refactored into two files (350 + 230 lines) to stay under 500-line limit

## Task Commits

Each task was committed atomically:

1. **Task 1: Write failing parser tests (RED)** - `ac5a0c3` (test)
2. **Task 2: Implement parseMermaidToGraph (GREEN)** - `0e8220e` (feat)

## Files Created/Modified

- `src/diagram/graph-parser.ts` - Main parser with parseMermaidToGraph() orchestrating 7-pass pipeline (350 lines)
- `src/diagram/graph-edge-parser.ts` - Edge/node parsing helpers: parseNodeShape, parseEdgesFromLine, extractNodeSegments, stripInlineClass (230 lines)
- `test/diagram/graph-parser.test.ts` - 30 test cases across 8 groups: direction, shapes, edges, subgraphs, styles, annotations, edge cases, validation (328 lines)
- `test/fixtures/graph/with-flags-and-statuses.mmd` - Fixed to use proper ANNOTATION_START/END block markers

## Decisions Made

- **File split for 500-line rule:** Parser exceeded 500 lines in single file. Split edge/node parsing helpers into graph-edge-parser.ts, keeping pipeline orchestration in graph-parser.ts. Both files well under limit.
- **Edge operator ordering:** Bidirectional patterns before unidirectional, labeled before unlabeled, longest before shortest -- prevents `-->` from matching before `<-->` or `-->|label|`.
- **Implicit node creation:** Nodes referenced only in edges get `shape: 'rect'` and `label: id`. This matches Mermaid's default behavior.
- **Bare ID:::className handling:** Added special case in Pass 4 for node references with only `:::className` and no shape brackets (e.g., `A:::myClass`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed with-flags-and-statuses.mmd fixture format**
- **Found during:** Task 1 (writing tests)
- **Issue:** Fixture file had bare `%% @flag` lines without the required `ANNOTATION_START`/`ANNOTATION_END` block markers. The existing `parseFlags()` function only detects annotations within those markers.
- **Fix:** Wrapped annotations in proper `%% --- ANNOTATIONS (auto-managed by SmartB Diagrams) ---` block with correct `%% @flag nodeId "message"` quoted format
- **Files modified:** test/fixtures/graph/with-flags-and-statuses.mmd
- **Verification:** parseFlags() now correctly returns 2 flags from the fixture
- **Committed in:** ac5a0c3 (Task 1 commit)

**2. [Rule 3 - Blocking] Split parser into two files for 500-line limit**
- **Found during:** Task 2 (implementation)
- **Issue:** Single graph-parser.ts reached 536 lines, exceeding the project's 500-line limit
- **Fix:** Extracted edge parsing helpers (EDGE_OPS, stripInlineClass, parseNodeShape, extractNodeSegments, parseEdgesFromLine, advancePastNode) into graph-edge-parser.ts
- **Files modified:** src/diagram/graph-parser.ts, src/diagram/graph-edge-parser.ts (new)
- **Verification:** All 161 tests pass, typecheck passes, graph-parser.ts at 350 lines, graph-edge-parser.ts at 230 lines
- **Committed in:** 0e8220e (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both fixes necessary for correctness and code quality. No scope creep.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- parseMermaidToGraph() ready for import by serializer (Plan 10-03)
- All 22 fixture files parse correctly -- ready for round-trip testing
- graph-edge-parser.ts exports (parseNodeShape, parseEdgesFromLine) available for reuse
- All 161 tests pass (131 existing + 30 new) -- no regressions

## Self-Check: PASSED

- [x] src/diagram/graph-parser.ts exists (350 lines)
- [x] src/diagram/graph-edge-parser.ts exists (230 lines)
- [x] test/diagram/graph-parser.test.ts exists (328 lines, 30 tests)
- [x] 10-02-SUMMARY.md exists
- [x] Commit ac5a0c3 exists (Task 1 - RED)
- [x] Commit 0e8220e exists (Task 2 - GREEN)

---
*Phase: 10-graph-model-parser*
*Completed: 2026-02-15*
