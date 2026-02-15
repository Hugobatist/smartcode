# 08-01 Summary: Subgraph Parsing and Collapse/Expand

**Executed:** 2026-02-15
**Duration:** ~15 minutes
**Commit:** 3ad2eca

## What Was Built

Core collapse/expand system for large Mermaid diagrams:

1. **parseSubgraphs()** — Extracts subgraph hierarchy (ID, label, parent, children, nodes)
2. **generateCollapsedView()** — Transforms Mermaid with collapsed nodes as summary placeholders
3. **autoCollapseToLimit()** — Enforces 50 node max by collapsing largest leaf subgraphs
4. **focusOnNode() / getBreadcrumbs()** — Focus mode navigation with breadcrumb path
5. **collapse-ui.js** — Browser-side click handlers for expand/collapse/focus

## Files Created

| File | Lines | Purpose |
|------|-------|---------|
| `src/diagram/collapser.ts` | 469 | Core collapse logic |
| `static/collapse-ui.js` | 278 | Browser UI handlers |
| `test/diagram/collapser.test.ts` | 392 | 30 test cases |

## Key Functions

```typescript
// Parse subgraph structure
parseSubgraphs(content: string): Map<string, SubgraphInfo>

// Generate collapsed view
generateCollapsedView(content, subgraphs, state, config): CollapsedDiagram

// Auto-collapse to limit
autoCollapseToLimit(content, subgraphs, state, config): CollapseState

// Focus mode
focusOnNode(nodeId, subgraphs, currentState): CollapseState
getBreadcrumbs(state, subgraphs): { id: string; label: string }[]
```

## Verification

- ✅ TypeScript: `npm run typecheck` — clean
- ✅ Tests: 119 passing (30 new for collapser)
- ✅ Build: `npm run build` — clean
- ✅ Line counts: All under 500 lines

## Next Steps

1. **08-02**: Integrate into server routes (/api/diagrams/:file with collapse params)
2. **08-03**: Add breadcrumb bar and focus mode to live.html

## Notes

The collapse system is now a pure module that can be used by:
- Server routes (apply collapse before returning content)
- VS Code extension (apply collapse in webview)
- MCP tools (AI can request collapsed views)
