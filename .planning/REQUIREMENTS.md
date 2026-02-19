# Requirements: SmartB Diagrams v2.1

**Defined:** 2026-02-19
**Core Value:** Developers can see what their AI is thinking and intervene surgically before it finishes
**Milestone:** v2.1 Stability & Usability
**Source:** Deep 4-agent audit + 4-researcher investigation

## v2.1 Requirements

Requirements for stability and usability release. Each maps to roadmap phases.

### Critical MCP Fixes

- [x] **MCP-01**: `update_diagram` preserves existing flags and breakpoints instead of destroying them
- [x] **MCP-02**: `get_diagram_context` returns ghost paths, breakpoints, and risk annotations
- [x] **MCP-03**: `DiagramContent` type includes breakpoints and risks fields
- [x] **MCP-04**: Modal prompt allows empty/optional input (fixes ghost path creation from UI)

### Write Safety

- [x] **SAFE-01**: `/save` endpoint routes through DiagramService write lock (prevents race with MCP)
- [x] **SAFE-02**: FileWatcher pre-populates `knownFiles` on startup (fixes first-event misclassification)
- [x] **SAFE-03**: Additional project watchers are closed on server shutdown

### Ghost Path Usability

- [x] **GHOST-01**: Ghost paths persist as `@ghost FROM TO "label"` annotations in .mmd files
- [x] **GHOST-02**: Both backend (annotations.ts) and frontend (annotations.js) parse/serialize @ghost
- [x] **GHOST-03**: Ghost paths load from file on page load and file switch
- [x] **GHOST-04**: UI button to clear all ghost paths for current file
- [x] **GHOST-05**: Individual ghost path deletion via context menu or list panel
- [x] **GHOST-06**: Auto-show respects user's explicit hide preference (no forced visibility)
- [x] **GHOST-07**: Keyboard shortcut (G key) for ghost path toggle

### Heatmap Usability

- [x] **HEAT-01**: Automatic click tracking on nodes feeds heatmap frequency data (no MCP session required)
- [x] **HEAT-02**: Heatmap updates in real-time during session recording (not only on end_session)
- [x] **HEAT-03**: UI toggle between risk and frequency modes (dropdown or cycle button)
- [x] **HEAT-04**: Heatmap data re-fetches when user switches files in file tree
- [x] **HEAT-05**: Empty state guidance when heatmap has no data

### Code Quality

- [ ] **QUAL-01**: Split main.css (577 lines) into component-specific files (each under 500 lines)
- [ ] **QUAL-02**: Fix keyboard shortcut 'B' to not fire in unexpected input contexts
- [ ] **QUAL-03**: PNG export includes visible ghost paths
- [ ] **QUAL-04**: Export missing types from public API (RiskLevel, RiskAnnotation, GhostPath)

## Deferred to v2.2

### Advanced Features (from v2.0 scope)

- **ADV-01**: Pattern Memory — learn correction patterns from flag history
- **ADV-02**: Diagram as executable contract — validate AI output against diagram structure

### Infrastructure

- **INFRA-01**: Unify backend/frontend annotation parsers (single source of truth)
- **INFRA-02**: Project-scoped broadcast for ghost paths (replace broadcastAll)
- **INFRA-03**: Frontend test suite
- **INFRA-04**: `fs.watch` recursive fallback for Linux Node 18

## Out of Scope

| Feature | Reason |
|---------|--------|
| Full heatmap hover/viewport tracking | Clicks-only for v2.1, expand later. Risk of feedback loops |
| broadcastAll to broadcast refactor | Frontend already filters by file. Requires larger refactor |
| Ghost path sidecar (.smartb/) | Decided @ghost in-file for consistency. Requires parser sync |
| Session REST creation endpoints | Sessions remain MCP-only for now |
| Workspace registry file locking | Edge case, concurrent launches rare |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| MCP-01 | Phase 17 | Complete |
| MCP-02 | Phase 17 | Complete |
| MCP-03 | Phase 17 | Complete |
| MCP-04 | Phase 17 | Complete |
| SAFE-01 | Phase 17 | Complete |
| SAFE-02 | Phase 17 | Complete |
| SAFE-03 | Phase 17 | Complete |
| GHOST-01 | Phase 18 | Complete |
| GHOST-02 | Phase 18 | Complete |
| GHOST-03 | Phase 18 | Complete |
| GHOST-04 | Phase 18 | Complete |
| GHOST-05 | Phase 18 | Complete |
| GHOST-06 | Phase 18 | Complete |
| GHOST-07 | Phase 18 | Complete |
| HEAT-01 | Phase 19 | Complete |
| HEAT-02 | Phase 19 | Complete |
| HEAT-03 | Phase 19 | Complete |
| HEAT-04 | Phase 19 | Complete |
| HEAT-05 | Phase 19 | Complete |
| QUAL-01 | Phase 20 | Pending |
| QUAL-02 | Phase 20 | Pending |
| QUAL-03 | Phase 20 | Pending |
| QUAL-04 | Phase 20 | Pending |

**Coverage:**
- v2.1 requirements: 23 total
- Mapped to phases: 23
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-19*
*Last updated: 2026-02-19 after deep audit + research synthesis*
