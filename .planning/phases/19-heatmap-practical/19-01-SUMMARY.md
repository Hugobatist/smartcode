---
phase: "19"
plan: "01"
status: "complete"
duration: "~5min"
tests_added: 7
tests_total: 397
files_created: 3
files_modified: 7
---

# Summary: Plan 19-01 -- Automatic Click Tracking and Heatmap Backend

## What was done

1. **Created HeatmapStore** (`src/server/heatmap-routes.ts`) -- In-memory Map<file, Map<nodeId, count>> for browser click frequency data
2. **Added POST /api/heatmap/:file/increment** -- Accepts `{counts: Record<string, number>}`, merges into store, broadcasts via WebSocket
3. **Refactored GET /api/heatmap/:file** -- Merges click store + session store data, moved from session-routes.ts to heatmap-routes.ts
4. **Created interaction-tracker.js** -- Client-side click batching with 2-second flush interval, retry on failure
5. **Wired trackClick into selection.js** -- Every node selection increments the click count
6. **Updated file-tree.js** -- Resets interaction tracker on file switch
7. **Added 7 tests** -- GET empty, POST increment, accumulation, file isolation, error handling

## Key decisions

- Click data is ephemeral (in-memory). Session JSONL provides persistent data. This avoids disk I/O on every click.
- Batch flush interval is 2 seconds to balance responsiveness and request volume.
- Failed flushes re-add counts to pending for retry on next flush.
- HeatmapStore exposed on ServerInstance for test access.

## Requirements covered

- HEAT-01: Automatic click tracking feeds heatmap (no MCP session required)
- HEAT-04 (partial): File switch re-fetches heatmap data
