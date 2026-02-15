# 08-03 Routes Changes for Focus Mode Support

These changes need to be applied to `src/server/routes.ts` after the 08-02 agent
completes their work. The 08-03 agent did NOT modify routes.ts to avoid conflicts.

---

## Changes Required

### 1. New Imports from collapser.ts

Add these imports (merge with any existing collapser imports from 08-02):

```typescript
import {
  parseSubgraphs,
  generateCollapsedView,
  createEmptyState,
  focusOnNode,
  navigateToBreadcrumb,
  getBreadcrumbs,
  DEFAULT_CONFIG,
} from '../diagram/collapser.js';
```

### 2. Handle `focus` and `breadcrumb` Query Parameters

In the `GET /api/diagrams/:file` route handler, after reading the diagram content,
add support for focus/breadcrumb query params:

```typescript
// Parse URL to get query parameters
const url = new URL(req.url!, `http://${req.headers.host}`);
const focusNodeId = url.searchParams.get('focus');
const breadcrumbId = url.searchParams.get('breadcrumb');
const collapsedParam = url.searchParams.get('collapsed');

// Parse subgraphs from diagram content
const subgraphs = parseSubgraphs(diagram.mermaidContent);

// Build collapse state
let state = createEmptyState();

// Apply manual collapsed (from UI)
if (collapsedParam) {
  try {
    const ids = JSON.parse(collapsedParam);
    if (Array.isArray(ids)) {
      state.collapsed = new Set(ids);
    }
  } catch { /* ignore parse errors */ }
}

// Apply focus mode
if (focusNodeId) {
  state = focusOnNode(focusNodeId, subgraphs, state);
} else if (breadcrumbId) {
  state = navigateToBreadcrumb(breadcrumbId, subgraphs, state);
}

// Generate collapsed view
const collapseConfig = { ...DEFAULT_CONFIG };
const result = generateCollapsedView(diagram.mermaidContent, subgraphs, state, collapseConfig);
const breadcrumbs = getBreadcrumbs(state, subgraphs);
```

### 3. Add `collapse` Object to Response

The response JSON should include a `collapse` property:

```typescript
sendJson(res, {
  filePath: diagram.filePath,
  mermaidContent: result.content,  // Use collapsed content instead of raw
  flags: Object.fromEntries(diagram.flags),
  validation: {
    valid: diagram.validation.valid,
    errors: diagram.validation.errors,
    diagramType: diagram.validation.diagramType,
  },
  collapse: {
    visibleNodes: result.visibleNodes,
    autoCollapsed: result.autoCollapsed,
    manualCollapsed: result.manualCollapsed,
    breadcrumbs,
    focusedSubgraph: state.focusedSubgraph,
    config: collapseConfig,
  },
});
```

### 4. Query Parameters Summary

| Parameter | Type | Description |
|-----------|------|-------------|
| `focus` | string | Node ID to focus on (enters focus mode) |
| `breadcrumb` | string | Breadcrumb ID to navigate to (or 'root' to exit focus) |
| `collapsed` | JSON string | Array of manually collapsed subgraph IDs |

### 5. Interaction with 08-02 Changes

If 08-02 already added collapse/auto-collapse support to the route, the focus mode
changes should be integrated into the same handler. The key additions are:
- Reading `focus` and `breadcrumb` query params
- Calling `focusOnNode()` or `navigateToBreadcrumb()` on the state
- Including `breadcrumbs` and `focusedSubgraph` in the collapse response object
