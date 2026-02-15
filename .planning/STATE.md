# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-14)

**Core value:** Developers can see what their AI is thinking and intervene surgically before it finishes
**Current focus:** Phase 7 in progress — VS Code Extension (file navigation)

## Current Position

Phase: 7 of 8 (VS Code Extension)
Plan: 4 of 4 in current phase (07-04 pending execution)
Status: Ready to execute 07-04
Last activity: 2026-02-15 — Plans 07-01/02/03 completed, 07-04 created (file navigation)

Progress: [████████░░] 85%

## Handoff

**Active handoff:** `.planning/HANDOFF.md`
- Prepared 2026-02-15 for OpenClaw continuation
- Contains full context, architecture, plan details, and commands
- Next action: Execute 07-04-PLAN.md

## Performance Metrics

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

**Recent Trend:**
- Last 5 plans: 2min, 3min, 4min, 3min, 4min
- Trend: stable

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: 8-phase comprehensive roadmap derived from requirement dependencies — Core+DIAG first, then HTTP, then WS, then UI+MCP in parallel, then DX+AI, then VSCode, then Scale
- [Roadmap]: Phase 5 (MCP) depends on Phase 3 (WS) not Phase 4 (UI) — MCP needs real-time broadcast but not interactive UI
- [Roadmap]: DX and AI requirements grouped together in Phase 6 — CLI polish, AI conventions, and flag-to-prompt pipeline are all post-MCP enhancements
- [01-01]: Hardcoded version string in CLI instead of importing package.json to avoid ESM import assertion complexity
- [01-01]: tsup onSuccess callback with cpSync for cross-platform static asset copy instead of shell cp command
- [01-01]: Type-only barrel export in index.ts -- runtime exports are empty, types are in dist/index.d.ts
- [01-02]: Node.js built-in fs.glob instead of fast-glob to avoid CJS-to-ESM bundling issues with tsup
- [01-02]: Regex heuristic validator instead of @mermaid-js/parser since it lacks flowchart support
- [01-02]: Annotation block format with %% --- ANNOTATIONS (auto-managed by SmartB Diagrams) --- markers
- [02-01]: Node.js built-in http.createServer with thin router instead of framework -- 8 routes do not justify Fastify overhead
- [02-01]: Route matching via RegExp array with named groups for URL parameters
- [02-01]: Two separate file roots: getStaticDir() for static assets, project dir for .mmd files
- [02-01]: Dynamic import of server module in CLI serve action for lazy loading
- [02-02]: Status classDefs appended after clean content, before render -- classDef + class directives
- [02-02]: Error panel built entirely with DOM methods (createElement + textContent) for XSS safety
- [02-02]: Extracted createHttpServer() from startServer() for integration test reuse
- [02-02]: getStaticDir() dev fallback with existsSync for dev/test compatibility
- [03-01]: ServerInstance composite return type instead of bare http.Server from createHttpServer
- [03-01]: chokidar v5 installed (ESM-only, TypeScript-native) -- compatible with project's ESM setup
- [03-01]: WsMessage discriminated union type for type-safe server-to-client messages
- [03-02]: Status dot/text driven by WebSocket onStatusChange callback, not autoSync toggle
- [03-02]: Auto-Sync toggle controls re-render only -- WS connection stays open regardless
- [03-02]: var declarations in ws-client.js for broadest browser compatibility (no build step)
- [03-03]: noServer mode with HTTP upgrade handler for multi-project URL routing
- [03-03]: Map<string, WebSocketServer> keyed by project name for namespace isolation
- [03-03]: WsMessage connected type gains project field for client namespace awareness
- [03-03]: addProject() on ServerInstance for lazy project registration with per-project FileWatcher
- [04-01]: Temporarily re-initialize mermaid with htmlLabels:false for PNG export rather than stripping foreignObject from DOM
- [04-01]: escapeHtml() on both display names and onclick path attributes with single-quote escaping for safe inline event handlers
- [04-01]: isInitialRender flag reset in loadFile() ensures file navigation always triggers zoomFit while live updates preserve position
- [04-02]: IIFE module following same pattern as annotations.js for consistency across all UI modules
- [04-02]: Substring match on nodeLabel textContent (case-insensitive) for broad search
- [04-02]: Pan-to-match using existing getPan/setPan hooks instead of new scroll mechanism
- [05-01]: Raw Zod shapes (not z.object wrapped) for MCP SDK registerTool inputSchema compatibility
- [05-01]: @status annotation format without quotes (%% @status nodeId statusValue) since status is a constrained enum
- [05-01]: parseFlags silently skips @status lines to avoid spurious debug warnings for valid annotations
- [05-01]: Dynamic import of DiagramService in startMcpServer for lazy loading consistency with serve command
- [05-02]: Tools return isError:true with plain message text on failure, never stack traces (AI agent safety)
- [05-02]: diagram-content resource uses decodeURIComponent on filePath template variable for special character support
- [05-02]: Resources return empty contents array on error (MCP resources have no isError mechanism)
- [05-03]: Optional existingService parameter on createHttpServer() for backward-compatible dependency injection between MCP and HTTP servers
- [05-03]: Dynamic imports of createHttpServer and detect-port in --serve path for lazy loading
- [05-03]: Ordered shutdown mirrors existing startServer() pattern: fileWatcher -> wsManager -> httpServer
- [06-02]: CorrectionContext includes full mermaid content, all flags, all statuses, and natural language instruction for AI self-correction
- [06-02]: get_correction_context returns isError:true with descriptive message when nodeId has no flag (not an exception)
- [06-02]: No-mmd-files check uses a temporary DiagramService instance in startServer, server does not refuse to start
- [Phase 06-01]: node:http built-in request() for status CLI instead of fetch -- avoids experimental warnings and gives timeout control
- [Phase 06-01]: CLI module pattern: src/cli/*.ts with dynamic import from commander actions for lazy loading
- [Phase 06-01]: wsManager created before registerRoutes for dependency injection of client count into /api/status
- [07-01]: Separate tsconfig.webview.json with DOM lib for browser-context webview code, main tsconfig excludes src/webview/
- [07-01]: SmartBWsClient.updateUrl() method for handling config changes without manual disconnect/reconnect
- [07-01]: @types/ws added as devDependency for proper Node.js WebSocket typing in extension host
- [07-02]: mermaid marked as external in esbuild webview config -- loaded via separate script tag to avoid CSP chunk-loading issues
- [07-02]: node:http built-in for flag save POST -- consistent with Phase 6 CLI status pattern, avoids fetch experimental warnings
- [07-02]: File contents tracked in Map<string, string> in extension host -- enables flag append without refetching from server
- [07-02]: DOM.Iterable added to tsconfig.webview.json lib -- required for NodeListOf iteration in flag-ui.ts
- [07-03]: Extracted httpPost and getHttpBaseUrl to http-client.ts to keep extension.ts under 200 lines (was 207, now 159)
- [07-03]: StatusBarManager uses vscode.ThemeColor for errorBackground and warningBackground -- follows VS Code API conventions

### Pending Todos

#### Pre-Release Cleanup (code review findings — resolver antes de npm publish)

**CRITICOS — resolver obrigatoriamente antes de qualquer release:**

1. **Mermaid `securityLevel: 'loose'` -> trocar pra `'sandbox'` ou `'strict'`**
   - **Onde:** `static/live.html` linhas 638, 1184, 1219, 1281 (4 ocorrencias)
   - **Problema:** Modo `loose` permite execucao de HTML/JS arbitrario dentro dos diagramas. Se um agente de IA gerar um `.mmd` com `click A href "javascript:alert(1)"` via prompt injection, executa no browser.
   - **Fix:** Trocar para `securityLevel: 'sandbox'` nas 4 ocorrencias. Testar se rendering de click handlers legitimos continua funcionando.

2. **`readJsonBody` sem limite de tamanho — vulneravel a DoS**
   - **Onde:** `src/server/server.ts` linhas 61-67
   - **Problema:** Acumula chunks sem limite. Payload de gigas estoura memoria. Porta pode estar exposta na rede local.
   - **Fix:** Adicionar `MAX_BODY_SIZE = 1 * 1024 * 1024` (1MB). Abortar com 413 se exceder. Validar shape do JSON com Zod (ja e dependencia).

**ALTOS — resolver antes de release publica:**

3. **`nodeId` sem escape no innerHTML do flag panel**
   - **Onde:** `static/annotations.js` linha 291-292
   - **Problema:** `nodeId` vem do parsing do `.mmd` e e injetado direto no HTML: `data-node-id="${nodeId}"` e `${nodeId}`. Se o node ID contiver HTML malicioso, executa.
   - **Fix:** Aplicar `escapeHtml(nodeId)` em ambas as ocorrencias.

4. **`onclick` inline com string interpolation vulneravel a injection**
   - **Onde:** `static/live.html` linhas 1007-1031 (renderNodes)
   - **Problema:** `escapeHtml` nao escapa `\` nem newlines. Nome de pasta como `test\');alert(1);//` passa pela sanitizacao no contexto de atributo onclick.
   - **Fix:** Substituir onclick inline por `addEventListener` com `data-*` attributes e event delegation. Ou adicionar escape de `\` e newlines na sanitizacao.

5. **Race condition em `setFlag/removeFlag/setStatus/removeStatus`**
   - **Onde:** `src/diagram/service.ts` linhas 79-102
   - **Problema:** Read -> modify -> write async sem sincronizacao. Se a IA e o dev salvarem simultaneamente, um sobrescreve o outro. Risco real num produto de observabilidade onde dev e IA escrevem ao mesmo tempo.
   - **Fix:** Lock simples por arquivo (Map<string, Promise>) que serializa operacoes de escrita no mesmo `.mmd`.

6. **`addProject` nao registra rotas REST para projetos adicionais**
   - **Onde:** `src/server/server.ts` linhas 191-221
   - **Problema:** `registerRoutes` so e chamado pro projeto default. Projetos adicionais recebem WebSocket updates mas nao podem ser acessados via REST (`/api/diagrams`, `/save`, `/tree.json`).
   - **Fix:** Chamar `registerRoutes` ou criar routes parametrizadas por projeto no `addProject`.

7. **Zero testes para frontend**
   - **Problema:** ~1200 linhas de logica em `annotations.js`, `diagram-editor.js`, `search.js`, `ws-client.js` sem nenhum teste. Funcoes de parsing/manipulacao sao puras e testaveis.
   - **Fix:** Extrair logica pura pra modulos ES importaveis. Testar com vitest (ja configurado) ou test runner de browser.

**MEDIOS — resolver antes de v1 estavel:**

8. **`KNOWN_DIAGRAM_TYPES` duplicado**
   - **Onde:** `src/diagram/parser.ts` linhas 4-16 (com `as const`) e `src/diagram/validator.ts` linhas 4-16 (sem `as const`)
   - **Fix:** Exportar de um unico lugar (ex: `types.ts`).

9. **Logica de parsing duplicada entre backend e frontend**
   - **Onde:** `src/diagram/annotations.ts` (TypeScript) e `static/annotations.js` (JavaScript) — mesmas regexes, mesma logica
   - **Fix:** Backend faz o parsing e envia dados prontos via WebSocket, ou compartilhar modulo ES entre ambos.

10. **`live.html` com 1532 linhas**
    - **Fix:** Extrair JavaScript inline para `app.js`. Extrair config Mermaid (duplicada 4x) para constante.

11. **Watchers de projetos adicionais nunca fechados no shutdown**
    - **Onde:** `src/server/server.ts` — SIGINT handler so fecha `fileWatcher` default, nao os do map `watchers`.
    - **Fix:** Iterar `watchers.values()` e chamar `.close()` em cada um no shutdown.

12. **Static file path traversal check menos rigorosa**
    - **Onde:** `src/server/server.ts` linhas 110-115
    - **Fix:** Usar `+ path.sep` no `startsWith` check, igual ao `resolveProjectPath`.

13. **Sem testes para rotas POST, WebSocketManager, FileWatcher**
    - **Fix:** Adicionar testes para `/save`, `/delete`, `/mkdir`, `/move`. Testes unitarios para broadcast/namespace. Testes de FileWatcher com tmpdir.

**BAIXOS — cleanup quando possivel:**

14. **Bug no drag & drop — `knownFiles` e `renderFileList` nao existem**
    - **Onde:** `static/live.html` linhas 1506-1507
    - **Fix:** Remover ou implementar corretamente. Hoje da ReferenceError.

15. **Deps nao utilizadas: `fast-glob` e `@mermaid-js/parser`**
    - **Fix:** `npm uninstall fast-glob @mermaid-js/parser`

16. **Versao hardcoded em `cli.ts` e `mcp/server.ts`**
    - **Fix:** Ler de `package.json` ou constante compartilhada.

17. **`refreshFileList` redundante quando dados ja vem via WebSocket**
    - **Fix:** Usar dados do evento `tree:updated` direto em vez de fazer fetch adicional.

18. **Mistura de `var`/`let`/`const` no frontend**
    - **Fix:** Padronizar para `const`/`let` em todos os modulos.

---

#### v2 Feature Ideas (post-milestone completion)

1. **Breakpoints no raciocinio da IA**
2. **Ghost Paths — caminhos descartados pela IA**
3. **Diagrama como contrato executavel**
4. **Pattern Memory — aprender com flags historicos**
5. **Risk Heatmap — custo/impacto visual por no**
6. **Session Replay — rebobinar o raciocinio da IA**

(Detalhes completos em versoes anteriores deste arquivo)

### Blockers/Concerns

- Research flag: Phase 8 (Scalability) needs research on hierarchical diagram navigation UX patterns

## Session Continuity

Last session: 2026-02-15
Stopped at: Handoff prepared for OpenClaw — 07-04-PLAN.md ready for execution
Resume file: .planning/HANDOFF.md
Next action: Execute .planning/phases/07-vscode-extension/07-04-PLAN.md
