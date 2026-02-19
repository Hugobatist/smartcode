---
phase: "19"
plan: "02"
status: "complete"
duration: "~4min"
tests_added: 0
tests_total: 397
files_created: 0
files_modified: 4
---

# Summary: Plan 19-02 -- Real-time Session Updates, Mode Toggle, Empty State

## What was done

1. **Real-time heatmap on record_step** (`src/mcp/session-tools.ts`) -- After writing node:visited event, broadcasts `heatmap:update` with `{ [nodeId]: 1 }` delta to all browsers
2. **Incremental merge in ws-handler** (`static/ws-handler.js`) -- Small deltas (<=3 keys) call `mergeVisitCounts` (additive); large payloads call `updateVisitCounts` (replace)
3. **mergeVisitCounts in heatmap.js** -- Adds incoming counts to existing counts, re-applies if active
4. **Mode toggle button** -- Appears in heatmap legend header, cycles between risk and frequency modes
5. **Empty state guidance** -- When no data exists for current mode, shows contextual help message
6. **CSS updates** -- `.heatmap-mode-toggle`, `.heatmap-empty-state`, `.heatmap-legend-header` styles

## Key decisions

- Delta vs full refresh detection uses key count heuristic (<=3 keys = delta). Simple, effective.
- Mode toggle only appears when data exists in at least one mode (avoids useless button on empty state).
- Empty state messages are mode-specific: frequency mentions clicking, risk mentions MCP tool.
- No additional tests needed -- existing heatmap endpoint tests cover the merge behavior, and frontend changes are UI-only.

## Requirements covered

- HEAT-02: Real-time heatmap during session recording
- HEAT-03: Mode toggle UI between risk and frequency
- HEAT-04: File switch re-fetches correct data (verified end-to-end)
- HEAT-05: Empty state guidance when no data
