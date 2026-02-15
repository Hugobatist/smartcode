# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-15)

**Core value:** Developers can see what their AI is thinking and intervene surgically before it finishes
**Current focus:** Milestone v2.0 — Interactive Canvas + Advanced Features (defining requirements)

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-02-15 — Milestone v2.0 started

Progress: [░░░░░░░░░░] 0%

## v1.0 Performance Metrics

**Velocity:**
- Total plans completed: 20
- Average duration: 3.0min
- Total execution time: 1.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-project-bootstrap-diagram-core | 2 | 9min | 4.5min |
| 02-http-server | 2 | 8min | 4min |
| 03-websocket-real-time-sync | 3 | 8min | 2.7min |
| 04-interactive-browser-ui | 2 | 4min | 2min |
| 05-mcp-server | 3 | 8min | 2.7min |
| 06-cli-dx-ai-integration | 3 | 6min | 2min |
| 07-vscode-extension | 3/4 | 11min | 3.7min |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.

**v2.0 architectural decisions:**
- Replace Mermaid.js renderer with custom interactive canvas
- Keep .mmd as input format — parse to internal graph model
- Use ELK.js or Dagre for layout computation (same engines Mermaid uses)
- Render custom SVG with individually addressable/manipulable elements
- Vanilla JS constraint remains (no React/Vue/frameworks)

**Carried from v1.0:**
- Node.js built-in http.createServer with thin router (no framework)
- chokidar v5 for file watching
- WebSocket for real-time sync
- tsup for build, vitest for tests
- ESM-only project

### Pending Todos (carried from v1.0)

#### Pre-Release Cleanup (resolve before npm publish)

**CRITICOS:**
1. Mermaid `securityLevel: 'loose'` -> trocar pra `'sandbox'` ou `'strict'` (4 ocorrencias em live.html)
2. `readJsonBody` sem limite de tamanho — vulneravel a DoS

**ALTOS:**
3. `nodeId` sem escape no innerHTML do flag panel
4. `onclick` inline com string interpolation vulneravel a injection
5. Race condition em `setFlag/removeFlag/setStatus/removeStatus`
6. `addProject` nao registra rotas REST para projetos adicionais
7. Zero testes para frontend

**MEDIOS:**
8. `KNOWN_DIAGRAM_TYPES` duplicado entre parser.ts e validator.ts
9. Logica de parsing duplicada entre backend (annotations.ts) e frontend (annotations.js)
10. `live.html` com 1532 linhas (excede regra de 500)
11. Watchers de projetos adicionais nunca fechados no shutdown
12. Static file path traversal check menos rigorosa
13. Sem testes para rotas POST, WebSocketManager, FileWatcher

**BAIXOS:**
14. Bug no drag & drop — `knownFiles` e `renderFileList` nao existem
15. Deps nao utilizadas: `fast-glob` e `@mermaid-js/parser`
16. Versao hardcoded em `cli.ts` e `mcp/server.ts`
17. `refreshFileList` redundante quando dados ja vem via WebSocket
18. Mistura de `var`/`let`/`const` no frontend

### Blockers/Concerns

- v1.0 Phase 8 partially done (1/3 plans) — collapse/expand works but will need adaptation for new renderer
- v1.0 Phase 7 plan 07-04 never executed (file navigation in VS Code) — independent of renderer change

## Session Continuity

Last session: 2026-02-15
Stopped at: Milestone v2.0 initialization — defining requirements
Next action: Research + requirements definition for v2.0
