# Research Summary: SmartB Diagrams v2.1

**Domain:** Bug fixes & usability improvements for Ghost Paths, Heatmap, MCP tools, CSS
**Researched:** 2026-02-19
**Overall confidence:** HIGH
**Previous:** v2.0 research (2026-02-15) covered custom renderer + interactive canvas. This v2.1 is a focused bug-fix milestone.

---

## Executive Summary

The v2.1 milestone fixes four specific problems in the existing codebase: (1) ghost paths are lost on server restart because they are stored only in-memory, (2) the `/save` endpoint bypasses the write lock, enabling concurrent corruption, (3) heatmap data requires explicit MCP session recording with no automatic tracking, and (4) `main.css` exceeds the 500-line file limit at 577 lines.

All four fixes can be implemented with ZERO new npm dependencies. The ghost path persistence extends the existing annotation regex system (which already handles `@flag`, `@status`, `@breakpoint`, and `@risk`). The write lock fix is a 3-line change routing `/save` through the existing `DiagramService.writeDiagram()`. Automatic heatmap tracking uses native browser APIs (`IntersectionObserver`, `PointerEvent`). CSS splitting follows the project's established pattern of one CSS file per component.

The primary risk identified is the **dual annotation parser problem**: the annotation system is duplicated between backend TypeScript (`annotations.ts`) and frontend vanilla JS (`annotations.js`). Adding a 5th annotation type (`@ghost`) requires updating both parsers identically, or ghost paths will be silently destroyed when users interact with flags in the browser. The recommended mitigation is to either (a) update both parsers and add cross-validation tests, or (b) persist ghost paths in `.smartb/ghost-paths.json` instead of the annotation block -- avoiding the parser entirely.

## Key Findings

**Stack:** No new dependencies needed. All fixes use existing Node.js APIs, the existing annotation regex pattern, existing write lock infrastructure, and native browser APIs.

**Architecture:** No architectural changes. All fixes operate within existing component boundaries. The annotation system extension follows the exact same pattern used for the 4 existing annotation types.

**Critical pitfall:** The frontend annotation parser (`annotations.js`) duplicates the backend parser (`annotations.ts`). Adding `@ghost` to the backend without updating the frontend causes silent data loss -- the frontend's `injectAnnotations()` strips `@ghost` lines whenever the user adds a flag or changes a status. This is the highest-risk issue in the milestone.

## Implications for Roadmap

Based on research, suggested phase structure:

1. **Phase 1: CSS Splitting + Write Safety** -- Zero-risk compliance fix + critical 3-line bug fix
   - Addresses: `main.css` over 500 lines, `/save` bypassing write lock
   - Avoids: No pitfalls -- these are independent, low-risk changes

2. **Phase 2: Ghost Path Persistence** -- Core feature fix, requires careful annotation system work
   - Addresses: Ghost paths lost on server restart, ghost paths not loading on file open
   - Avoids: Pitfall 2 (frontend parser stripping `@ghost`) by updating BOTH parsers or using `.smartb/` storage

3. **Phase 3: Automatic Heatmap Tracking** -- Differentiator feature, new browser module + server endpoint
   - Addresses: Heatmap requires explicit MCP sessions, no passive data collection
   - Avoids: Pitfall 7 (requestAnimationFrame feedback loop) by tracking clicks only with 30s flush

**Phase ordering rationale:**
- CSS splitting and write safety are independent, zero-risk, and should ship first to clean the codebase
- Ghost path persistence is the core fix but has the highest integration risk (annotation parser duplication). It should be done second with thorough testing
- Automatic heatmap tracking is additive (new module + endpoint) and benefits from all other fixes being stable. It should be done last

**Research flags for phases:**
- Phase 2: NEEDS careful implementation. The annotation parser duplication between backend and frontend is the primary risk area. Cross-validation tests are essential.
- Phase 1 and 3: Standard patterns, unlikely to need additional research.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Zero new deps. All patterns verified in existing codebase |
| Features | HIGH | Bug fixes with clear scope. No novel concepts |
| Architecture | HIGH | No changes to architecture. Extensions of existing patterns |
| Pitfalls | HIGH | All pitfalls identified from direct codebase analysis |

## Gaps to Address

- **Frontend annotation parser sync:** The decision of whether to update the frontend parser (annotations.js) for `@ghost` or use `.smartb/` storage should be made before implementation begins. Both approaches are documented in ARCHITECTURE.md.
- **Heatmap data growth:** Browser interaction tracking is continuous. A cleanup strategy (cap per node, TTL) should be designed but can be deferred to implementation.
- **Ghost path count limits:** The in-memory `GhostPathStore` caps at 100 per file. The annotation-based persistence should enforce the same limit to prevent annotation blocks from growing unbounded.

---
*Research complete. Files ready for roadmap creation.*
*Researched: 2026-02-19*
