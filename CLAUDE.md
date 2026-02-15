# Instrucoes para o Claude - SmartB Diagrams

---

## REGRA CRITICA: Nunca Fazer Push Sem Autorizacao

- **NUNCA** executar `git push` sem autorizacao explicita do usuario
- Sempre fazer commit e mostrar o resultado, depois **perguntar** antes de dar push

---

## REGRA CRITICA: Sempre Usar Opus

Ao usar a ferramenta `Task` para lancar agentes, **SEMPRE** especificar `"model": "opus"`.
**NUNCA usar haiku ou sonnet para este projeto.**

---

## Regra de Arquitetura: Limite de 500 Linhas

**Nenhum arquivo deve ultrapassar 500 linhas.**

- Se o arquivo passar de 400 linhas apos a mudanca, planejar refatoracao imediata
- Extrair modulos, utilitarios, ou separar por responsabilidade

| Tipo | Limite | Acao quando proximo |
|------|--------|---------------------|
| Modulos TypeScript (src/) | 500 linhas | Separar por responsabilidade |
| Arquivos de teste | 400 linhas | Separar por suite/feature |
| Static (HTML/JS/CSS) | 500 linhas | Extrair modulos JS separados |

---

## Stack e Convencoes

- **Runtime**: Node.js >= 22 (este projeto e um pacote npm, nao usa Bun)
- **Linguagem**: TypeScript (~5.9), ESM (`"type": "module"`)
- **Build**: tsup (bundler)
- **Testes**: Vitest (`npm test` ou `vitest run`)
- **Dependencias**: Minimas — sem frameworks pesados
- **Formato de diagrama**: Apenas Mermaid (.mmd)

### Comandos do projeto

```bash
npm run build      # Build com tsup
npm run dev        # Build em watch mode
npm test           # Rodar testes (vitest)
npm run typecheck  # Checagem de tipos
```

---

## Estrutura do Projeto

```
src/
  cli.ts           # Entry point CLI (comando smartb)
  index.ts         # Exports publicos do pacote
  diagram/         # Parsing .mmd, anotacoes, validacao, tipos
  server/          # HTTP server, rotas REST, WebSocket, static assets
  watcher/         # File watcher (chokidar) para .mmd
  project/         # Gerenciamento multi-projeto
  utils/           # Utilitarios compartilhados
static/            # Browser UI (live.html, JS, CSS) — vanilla JS, sem framework
test/              # Testes espelhando a estrutura de src/
.planning/         # Roadmap, requirements, planos de fase (GSD workflow)
```

---

## Regras de Codigo

- **Sem Python em producao** — o serve.py e legado do prototipo, nao modificar
- **Browser UI e vanilla JS** — sem React/Vue/frameworks no static/
- **Tipos exportados** — manter types.ts como fonte unica de tipos do dominio
- **Testes obrigatorios** — toda feature nova precisa de teste em test/
- **Static assets sao bundled** — tsup copia static/ para dist/ via onSuccess

---

## Arquitetura

- **Processo unico**: HTTP server + WebSocket + (futuro) MCP server no mesmo processo
- **Local-first**: Roda na maquina do dev, sem cloud
- **Performance**: Updates de diagrama < 100ms de latencia percebida
- **WebSocket**: Mudancas em .mmd propagam para todos os browsers conectados via ws

---

## Progresso (Roadmap)

- Fases 1-3 completas (bootstrap, HTTP, WebSocket)
- Fase 4 em andamento (UI interativa)
- Fases 5-8 pendentes (MCP, CLI/DX, VS Code, escalabilidade)
- Detalhes completos em `.planning/ROADMAP.md`
