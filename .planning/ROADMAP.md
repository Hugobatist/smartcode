# Roadmap: SmartB Diagrams

## Milestones

- ✅ **v1.0 MVP** - Phases 1-8 (shipped 2026-02-15)
- ✅ **v2.0 Interactive Canvas + AI Observability** - Phases 9-16 (shipped 2026-02-16)
- 🚧 **v2.1 Stability & Usability** - Phases 17-20 (in progress)

<details>
<summary>✅ v1.0 MVP (Phases 1-8) - SHIPPED 2026-02-15</summary>

All 8 phases completed. TypeScript npm package with HTTP server, WebSocket real-time sync, browser UI with pan/zoom/flags/search/export, MCP server for AI tools, VS Code extension, and subgraph collapse/expand. 23 plans executed.

</details>

<details>
<summary>✅ v2.0 Interactive Canvas + AI Observability (Phases 9-16) - SHIPPED 2026-02-16</summary>

All 8 phases completed. Custom interactive canvas (dagre + SVG), node selection/drag/inline-edit, context menu, undo/redo, copy/paste, folder management, AI breakpoints, ghost paths, risk heatmap, session replay. Foundation refactoring reduced live.html from 1757 to 196 lines.

### Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 9. Foundation Refactoring | 4/4 | Complete | 2026-02-15 |
| 10. Graph Model + Parser | 3/3 | Complete | 2026-02-15 |
| 11. Custom Renderer | 4/4 | Complete | 2026-02-15 |
| 12. Server + Browser Integration | 3/3 | Complete | 2026-02-15 |
| 13. Canvas Interactions | 2/2 | Complete | 2026-02-15 |
| 14. Undo/Redo + Edit Actions | 3/3 | Complete | 2026-02-16 |
| 15. AI Breakpoints + Ghost Paths | 3/3 | Complete | 2026-02-16 |
| 16. Heatmap + Session Recording | 4/4 | Complete | 2026-02-16 |

</details>

## Phases

**Milestone: v2.1 Stability & Usability**

**Phase Numbering:**
- Integer phases (17, 18, 19, 20): Planned milestone work
- Decimal phases (e.g., 17.1): Urgent insertions if needed (marked with INSERTED)

- [ ] **Phase 17: Critical Fixes + Write Safety** - Fix data-destroying MCP bugs and race conditions so every tool call preserves existing data
- [ ] **Phase 18: Ghost Paths Functional** - Ghost paths persist in .mmd files, are fully manageable from UI, and visible to AI via MCP
- [ ] **Phase 19: Heatmap Practical** - Heatmap shows useful data without MCP setup, updates in real-time, and supports mode toggling
- [ ] **Phase 20: Polish** - Code quality compliance, keyboard shortcut fixes, complete exports

## Phase Details

### Phase 17: Critical Fixes + Write Safety
**Goal**: Every MCP tool call preserves existing developer data, the /save endpoint cannot corrupt files, and FileWatcher correctly classifies events from first startup
**Depends on**: v2.0 complete (Phase 16)
**Requirements**: MCP-01, MCP-02, MCP-03, MCP-04, SAFE-01, SAFE-02, SAFE-03
**Success Criteria** (what must be TRUE):
  1. Calling update_diagram on a file with existing flags and breakpoints preserves all annotations -- the developer does not lose any flags, breakpoints, or risk annotations they previously set
  2. Calling get_diagram_context returns a complete picture: ghost paths, breakpoints, and risk annotations are all present in the response alongside the existing diagram content
  3. The modal prompt for ghost path creation accepts empty/blank label input without blocking -- developers can create ghost paths with optional labels from the UI
  4. Saving a file via /save while an MCP tool is writing to the same file does not corrupt either write -- the write lock serializes access
  5. The first file change after server startup triggers a correct "change" event (not "add") for files that already existed when the server started
**Plans**: TBD

Plans:
- [ ] 17-01: MCP write safety (update_diagram annotation preservation, /save write lock routing)
- [ ] 17-02: MCP read completeness (get_diagram_context, DiagramContent types, modal fix, FileWatcher init, watcher cleanup)

### Phase 18: Ghost Paths Functional
**Goal**: Ghost paths survive server restarts by persisting as @ghost annotations in .mmd files, load automatically on page open, and can be managed (created, deleted individually or in bulk) entirely from the browser UI
**Depends on**: Phase 17 (MCP write safety must be solid before adding new annotation type)
**Requirements**: GHOST-01, GHOST-02, GHOST-03, GHOST-04, GHOST-05, GHOST-06, GHOST-07
**Success Criteria** (what must be TRUE):
  1. Ghost paths created via MCP or UI appear as `%% @ghost FROM TO "label"` lines in the .mmd file and survive server restarts
  2. Opening a .mmd file in the browser automatically loads and renders any persisted ghost paths -- no manual fetch or toggle required
  3. A "Clear All" button removes all ghost paths for the current file, and individual ghost paths can be deleted via context menu or list panel
  4. The ghost path toggle (G key) respects the user's preference -- if the user explicitly hid ghost paths, auto-show from new data does not override their choice
  5. Both the backend (annotations.ts) and frontend (annotations.js) correctly parse and serialize @ghost annotations without destroying each other's output
**Plans**: TBD

Plans:
- [ ] 18-01: Backend @ghost annotation parsing, serialization, and persistence (annotations.ts, DiagramService)
- [ ] 18-02: Frontend @ghost parsing, load-on-open, clear/delete UI, toggle preference, G shortcut (annotations.js, ghost-paths.js)

### Phase 19: Heatmap Practical
**Goal**: The heatmap shows useful data from the moment a user starts clicking on nodes -- no MCP session setup required. During active sessions, data updates in real-time. Users can switch between risk and frequency views.
**Depends on**: Phase 17 (get_diagram_context completeness needed for heatmap data flow)
**Requirements**: HEAT-01, HEAT-02, HEAT-03, HEAT-04, HEAT-05
**Success Criteria** (what must be TRUE):
  1. Clicking on diagram nodes in the browser automatically accumulates frequency data that the heatmap can display -- no MCP session recording is needed for basic heatmap functionality
  2. During an active MCP session recording (record_step), the heatmap updates incrementally in real-time rather than waiting for end_session
  3. A UI control (dropdown or cycle button) lets users toggle between risk mode (annotation-based severity) and frequency mode (click/visit counts)
  4. Switching files in the file tree re-fetches heatmap data for the newly selected file instead of showing stale data from the previous file
  5. When heatmap has no data for the current file, a clear empty state message guides the user on how to populate it
**Plans**: TBD

Plans:
- [ ] 19-01: Automatic click tracking (interaction-tracker.js, POST /api/heatmap/:file/increment, batch flush)
- [ ] 19-02: Real-time session updates, mode toggle UI, file-switch re-fetch, empty state guidance

### Phase 20: Polish
**Goal**: All files comply with the 500-line limit, keyboard shortcuts work correctly in all contexts, PNG export captures the complete visual state, and the public API exports all necessary types
**Depends on**: Phases 17-19 (polish applies after feature fixes are stable)
**Requirements**: QUAL-01, QUAL-02, QUAL-03, QUAL-04
**Success Criteria** (what must be TRUE):
  1. main.css is split into component-specific files, each under 500 lines, and all styles render identically in the browser
  2. Pressing 'B' while typing in an input field, textarea, or contenteditable element does not trigger the breakpoint shortcut -- the key is correctly filtered by input context
  3. Exporting a diagram as PNG includes all visible ghost paths in the exported image
  4. RiskLevel, RiskAnnotation, and GhostPath types are importable from the smartb-diagrams package public API
**Plans**: TBD

Plans:
- [ ] 20-01: CSS splitting, keyboard shortcut fix, PNG ghost path export, type exports

## Progress

**Execution Order:**
Phases execute in numeric order: 17 → 18 → 19 → 20

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 17. Critical Fixes + Write Safety | 0/2 | Not started | - |
| 18. Ghost Paths Functional | 0/2 | Not started | - |
| 19. Heatmap Practical | 0/2 | Not started | - |
| 20. Polish | 0/1 | Not started | - |
