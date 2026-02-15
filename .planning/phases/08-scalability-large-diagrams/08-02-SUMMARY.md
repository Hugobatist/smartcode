# 08-02 Summary: Node Limit, Auto-Collapse, Server Integration

**Executed:** 2026-02-15
**Duration:** ~10 minutes

## What Was Built

Auto-collapse system that enforces a 50-node limit and server-side integration:

1. **autoCollapseToLimit()** — Collapses largest leaf subgraphs until under node limit
2. **countVisibleNodes()** — Accurate count handling nested collapsed subgraphs
3. **getLeafSubgraphs()** — Identifies collapse candidates (subgraphs without children)
4. **Server route integration** — GET /api/diagrams/:file returns collapse metadata
5. **Auto-collapse notice UI** — Browser notice with "Expand All" and dismiss buttons

## Files Modified

| File | Changes | Purpose |
|------|---------|---------|
| `src/server/routes.ts` | +76 lines | Collapse integration, focus/breadcrumb params |
| `static/live.html` | +100 lines | Auto-collapse notice CSS, collapse-ui init |
| `static/collapse-ui.js` | +40 lines | Notice rendering with createElement (XSS-safe) |
| `test/server/server.test.ts` | +12 lines | Verify collapse metadata in API response |

## API Changes

GET `/api/diagrams/:file` now accepts:
- `?collapsed=["id1","id2"]` — Manual collapsed subgraphs
- `?collapseConfig={"maxVisibleNodes":30}` — Override defaults
- `?focus=NodeA` — Enter focus mode on node
- `?breadcrumb=subgraphId` — Navigate to breadcrumb level

Response includes new `collapse` field:
```json
{
  "collapse": {
    "visibleNodes": 42,
    "autoCollapsed": ["large-subgraph"],
    "manualCollapsed": [],
    "config": { "maxVisibleNodes": 50, "autoCollapse": true },
    "breadcrumbs": [{ "id": "root", "label": "Overview" }],
    "focusedSubgraph": null
  }
}
```

## Verification

- Build: clean
- TypeScript: clean
- Tests: 131 passing
