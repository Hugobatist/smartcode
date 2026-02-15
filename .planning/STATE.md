# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-14)

**Core value:** Developers can see what their AI is thinking and intervene surgically before it finishes
**Current focus:** Phase 5 complete — ready for Phase 6

## Current Position

Phase: 5 of 8 (MCP Server) -- COMPLETE
Plan: 3 of 3 in current phase (05-03 complete)
Status: Phase Complete
Last activity: 2026-02-15 — Completed 05-03 (Shared Process and Graceful Shutdown)

Progress: [████████░░] 83%

## Performance Metrics

**Velocity:**
- Total plans completed: 12
- Average duration: 3.3min
- Total execution time: 0.7 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-project-bootstrap-diagram-core | 2 | 9min | 4.5min |
| 02-http-server | 2 | 8min | 4min |
| 03-websocket-real-time-sync | 3 | 8min | 2.7min |
| 04-interactive-browser-ui | 2 | 4min | 2min |
| 05-mcp-server | 3 | 8min | 2.7min |

**Recent Trend:**
- Last 5 plans: 2min, 2min, 4min, 2min, 2min
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

### Pending Todos

#### Pre-Release Cleanup (code review findings — resolver antes de npm publish)

**CRÍTICOS — resolver obrigatoriamente antes de qualquer release:**

1. **Mermaid `securityLevel: 'loose'` → trocar pra `'sandbox'` ou `'strict'`**
   - **Onde:** `static/live.html` linhas 638, 1184, 1219, 1281 (4 ocorrências)
   - **Problema:** Modo `loose` permite execução de HTML/JS arbitrário dentro dos diagramas. Se um agente de IA gerar um `.mmd` com `click A href "javascript:alert(1)"` via prompt injection, executa no browser.
   - **Fix:** Trocar para `securityLevel: 'sandbox'` nas 4 ocorrências. Testar se rendering de click handlers legítimos continua funcionando.

2. **`readJsonBody` sem limite de tamanho — vulnerável a DoS**
   - **Onde:** `src/server/server.ts` linhas 61-67
   - **Problema:** Acumula chunks sem limite. Payload de gigas estoura memória. Porta pode estar exposta na rede local.
   - **Fix:** Adicionar `MAX_BODY_SIZE = 1 * 1024 * 1024` (1MB). Abortar com 413 se exceder. Validar shape do JSON com Zod (já é dependência).

**ALTOS — resolver antes de release pública:**

3. **`nodeId` sem escape no innerHTML do flag panel**
   - **Onde:** `static/annotations.js` linha 291-292
   - **Problema:** `nodeId` vem do parsing do `.mmd` e é injetado direto no HTML: `data-node-id="${nodeId}"` e `${nodeId}`. Se o node ID contiver HTML malicioso, executa.
   - **Fix:** Aplicar `escapeHtml(nodeId)` em ambas as ocorrências.

4. **`onclick` inline com string interpolation vulnerável a injection**
   - **Onde:** `static/live.html` linhas 1007-1031 (renderNodes)
   - **Problema:** `escapeHtml` não escapa `\` nem newlines. Nome de pasta como `test\');alert(1);//` passa pela sanitização no contexto de atributo onclick.
   - **Fix:** Substituir onclick inline por `addEventListener` com `data-*` attributes e event delegation. Ou adicionar escape de `\` e newlines na sanitização.

5. **Race condition em `setFlag/removeFlag/setStatus/removeStatus`**
   - **Onde:** `src/diagram/service.ts` linhas 79-102
   - **Problema:** Read → modify → write async sem sincronização. Se a IA e o dev salvarem simultaneamente, um sobrescreve o outro. Risco real num produto de observabilidade onde dev e IA escrevem ao mesmo tempo.
   - **Fix:** Lock simples por arquivo (Map<string, Promise>) que serializa operações de escrita no mesmo `.mmd`.

6. **`addProject` não registra rotas REST para projetos adicionais**
   - **Onde:** `src/server/server.ts` linhas 191-221
   - **Problema:** `registerRoutes` só é chamado pro projeto default. Projetos adicionais recebem WebSocket updates mas não podem ser acessados via REST (`/api/diagrams`, `/save`, `/tree.json`).
   - **Fix:** Chamar `registerRoutes` ou criar routes parametrizadas por projeto no `addProject`.

7. **Zero testes para frontend**
   - **Problema:** ~1200 linhas de lógica em `annotations.js`, `diagram-editor.js`, `search.js`, `ws-client.js` sem nenhum teste. Funções de parsing/manipulação são puras e testáveis.
   - **Fix:** Extrair lógica pura pra módulos ES importáveis. Testar com vitest (já configurado) ou test runner de browser.

**MÉDIOS — resolver antes de v1 estável:**

8. **`KNOWN_DIAGRAM_TYPES` duplicado**
   - **Onde:** `src/diagram/parser.ts` linhas 4-16 (com `as const`) e `src/diagram/validator.ts` linhas 4-16 (sem `as const`)
   - **Fix:** Exportar de um único lugar (ex: `types.ts`).

9. **Lógica de parsing duplicada entre backend e frontend**
   - **Onde:** `src/diagram/annotations.ts` (TypeScript) e `static/annotations.js` (JavaScript) — mesmas regexes, mesma lógica
   - **Fix:** Backend faz o parsing e envia dados prontos via WebSocket, ou compartilhar módulo ES entre ambos.

10. **`live.html` com 1532 linhas**
    - **Fix:** Extrair JavaScript inline para `app.js`. Extrair config Mermaid (duplicada 4x) para constante.

11. **Watchers de projetos adicionais nunca fechados no shutdown**
    - **Onde:** `src/server/server.ts` — SIGINT handler só fecha `fileWatcher` default, não os do map `watchers`.
    - **Fix:** Iterar `watchers.values()` e chamar `.close()` em cada um no shutdown.

12. **Static file path traversal check menos rigorosa**
    - **Onde:** `src/server/server.ts` linhas 110-115
    - **Fix:** Usar `+ path.sep` no `startsWith` check, igual ao `resolveProjectPath`.

13. **Sem testes para rotas POST, WebSocketManager, FileWatcher**
    - **Fix:** Adicionar testes para `/save`, `/delete`, `/mkdir`, `/move`. Testes unitários para broadcast/namespace. Testes de FileWatcher com tmpdir.

**BAIXOS — cleanup quando possível:**

14. **Bug no drag & drop — `knownFiles` e `renderFileList` não existem**
    - **Onde:** `static/live.html` linhas 1506-1507
    - **Fix:** Remover ou implementar corretamente. Hoje dá ReferenceError.

15. **Deps não utilizadas: `fast-glob` e `@mermaid-js/parser`**
    - **Fix:** `npm uninstall fast-glob @mermaid-js/parser`

16. **Versão hardcoded em `cli.ts` e `mcp/server.ts`**
    - **Fix:** Ler de `package.json` ou constante compartilhada.

17. **`refreshFileList` redundante quando dados já vêm via WebSocket**
    - **Fix:** Usar dados do evento `tree:updated` direto em vez de fazer fetch adicional.

18. **Mistura de `var`/`let`/`const` no frontend**
    - **Fix:** Padronizar para `const`/`let` em todos os módulos.

---

#### v2 Feature Ideas (post-milestone completion)

1. **Breakpoints no raciocínio da IA**
   - **O que:** O dev marca um nó do fluxograma como "breakpoint". Quando a IA chega naquele passo do plano, a execução pausa e espera aprovação do dev antes de continuar.
   - **Por que:** Flags são reativos (dev corrige depois). Breakpoints são preventivos (dev intercepta antes). Dá controle cirúrgico sobre decisões críticas da IA.
   - **Como se conecta:** Estende o sistema de flags existente (`%% @flag`) com uma nova semântica `%% @breakpoint nodeId`. O MCP server (Phase 5) precisaria de um tool `check_breakpoints` que a IA chama antes de executar cada passo. O WebSocket (Phase 3) notifica o browser quando a IA está pausada num breakpoint.
   - **Complexidade estimada:** Média — reutiliza flag infrastructure, precisa de novo MCP tool e UI de aprovação.
   - **Diferencial competitivo:** Nenhuma ferramenta de IA oferece breakpoints no raciocínio. É o conceito de debugger aplicado a agentes de IA.

2. **Ghost Paths — caminhos descartados pela IA**
   - **O que:** Quando a IA toma uma decisão entre múltiplos caminhos, os caminhos não escolhidos aparecem no diagrama como nós semitransparentes ("fantasmas") com a razão do descarte. O dev pode clicar num ghost path e dizer "vai por aqui".
   - **Por que:** Hoje o dev só vê o resultado final. Não sabe o que a IA considerou e rejeitou. Às vezes o caminho descartado era o certo. Mostrar alternativas dá contexto completo do raciocínio.
   - **Como se conecta:** Precisa de uma nova annotation `%% @ghost nodeId "razão do descarte"` ou um campo extra no MCP tool `update_diagram`. O renderer (live.html) precisaria de CSS para nós fantasma (opacity, dashed borders). Clicar num ghost path geraria um flag automático "prefiro esse caminho".
   - **Complexidade estimada:** Alta — requer protocolo novo entre IA e SmartB, mudanças no Mermaid rendering (classDef para ghost nodes), e UX de redirecionamento.
   - **Diferencial competitivo:** Transparência total do processo decisório da IA. Nenhum concorrente mostra alternativas descartadas.

3. **Diagrama como contrato executável**
   - **O que:** Inversão do fluxo atual. Em vez de a IA gerar o diagrama e o dev observar, o dev desenha/esboça um fluxograma com os passos desejados e a IA é obrigada a seguir essa estrutura. Se a IA desviar do plano, o SmartB detecta e alerta.
   - **Por que:** Transforma o SmartB de "monitor" em "linguagem de programação visual". O dev expressa a arquitetura desejada como fluxograma, e a IA implementa dentro dessas constraints. É literalmente "programar via fluxogramas".
   - **Como se conecta:** O MCP tool `get_diagram_context` (Phase 5) já dá à IA o estado do diagrama. Precisa de um novo modo "contract" onde o diagrama pré-existe e a IA atualiza status dos nós (pendente→em progresso→concluído) em vez de criar nós novos. O FileWatcher (Phase 3) monitoraria desvios. A UI (Phase 4) precisaria de um editor simplificado para o dev esboçar o plano.
   - **Complexidade estimada:** Alta — mudança conceitual grande, precisa de editor de diagrama, sistema de validação de conformidade, e novo modo no MCP.
   - **Diferencial competitivo:** Ninguém oferece "programação visual que constrains a IA". É o diferencial máximo do SmartB.

4. **Pattern Memory — aprender com flags históricos**
   - **O que:** O SmartB armazena todos os flags por projeto e identifica padrões recorrentes. Quando a IA está prestes a repetir um erro já flagado antes, o SmartB avisa proativamente antes que o dev precise intervir.
   - **Por que:** Cada flag é um dado de preferência do dev. Com o tempo, centenas de flags formam um perfil de "como esse dev quer que a IA trabalhe nesse projeto". O SmartB aprende e fica mais valioso quanto mais é usado — criando um moat de retenção.
   - **Como se conecta:** Precisa de um storage persistente de flags (SQLite ou JSON) além do `.mmd` atual. Um matcher de similaridade (embeddings ou keyword) compara a intenção da IA com flags passados. Um novo MCP tool `get_learned_preferences` retorna warnings antes da IA executar. O WebSocket notificaria o dev: "SmartB preveniu um erro baseado no flag X do dia Y".
   - **Complexidade estimada:** Média — storage é simples, o matching de padrões pode começar com keyword matching e evoluir pra embeddings.
   - **Diferencial competitivo:** Lock-in positivo — quanto mais o dev usa, mais o SmartB sabe. Migrar pra concorrente perde meses de aprendizado. É o equivalente a "histórico de code review" mas para interações com IA.

5. **Risk Heatmap — custo/impacto visual por nó**
   - **O que:** Cada nó do fluxograma recebe uma anotação de risco/impacto baseada no que a IA pretende fazer. Nós que modificam muitos arquivos, tocam banco de dados, ou são irreversíveis ficam destacados em cores quentes (laranja/vermelho). Nós read-only ou pure functions ficam frios (azul/verde).
   - **Por que:** O dev bate o olho no diagrama e sabe imediatamente onde estão os pontos perigosos. Combina naturalmente com breakpoints — breakpoints automáticos em nós de alto risco.
   - **Como se conecta:** A IA reportaria metadata de risco via MCP tool `update_node_status` (Phase 5) com campos adicionais (files_affected, is_reversible, touches_db). O classDef system (Phase 2) já suporta cores por nó — precisa de novos classDefs para risk levels. A UI (Phase 4) poderia ter um toggle "show risk overlay".
   - **Complexidade estimada:** Média — a IA já sabe o risco (tem contexto do codebase), precisa de schema pra reportar e UI pra renderizar.
   - **Diferencial competitivo:** Visual risk assessment de AI actions. Nenhum tool mostra "quão perigoso é o que a IA vai fazer" de forma visual.

6. **Session Replay — rebobinar o raciocínio da IA**
   - **O que:** Cada mudança no diagrama é versionada com timestamp. O dev pode arrastar um slider temporal e ver o diagrama evoluindo passo a passo — como um replay de partida. Mostra quando cada nó foi adicionado, quando status mudou, quando flags foram criados.
   - **Por que:** Permite post-mortem ("onde a IA errou?"), aprendizado ("como a IA pensa sobre refactoring?"), e compartilhamento ("olha o replay de como a IA resolveu esse bug"). É observabilidade temporal, não só espacial.
   - **Como se conecta:** O FileWatcher (Phase 3) já detecta mudanças em .mmd. Precisa de um changelog persistente (append-only log de diffs com timestamps). A UI precisaria de um componente de timeline/slider. O WebSocket poderia ter um modo "replay" além do modo "live". Export do replay como GIF/vídeo seria killer pra compartilhar.
   - **Complexidade estimada:** Alta — versionamento temporal, UI de timeline, storage de histórico, rendering de diffs animados.
   - **Diferencial competitivo:** "Git blame para raciocínio de IA". Nenhum concorrente oferece replay temporal de como a IA pensou.

### Blockers/Concerns

- ~~Research flag: Phase 5 (MCP) needs research on MCP tool/resource schema design for optimal AI agent UX~~ (resolved: 05-RESEARCH.md completed)
- Research flag: Phase 8 (Scalability) needs research on hierarchical diagram navigation UX patterns

## Session Continuity

Last session: 2026-02-15
Stopped at: Completed 05-03-PLAN.md (Shared Process and Graceful Shutdown) -- Phase 5 complete
Resume file: None
