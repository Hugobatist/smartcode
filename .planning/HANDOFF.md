# Handoff: SmartB Diagrams — VS Code Extension

**Data:** 2026-02-15
**De:** Claude Code (sessao com Simoni)
**Para:** OpenClaw (continuacao remota)
**Projeto:** /Users/simoni/Desktop/smartb-diagrams

---

## Resumo Executivo

O SmartB Diagrams e um pacote npm TypeScript que visualiza o raciocinio de agentes de IA em tempo real via diagramas Mermaid. O projeto esta na **Fase 7 (VS Code Extension)** de 8 fases. Os planos 07-01, 07-02, 07-03 ja foram executados e o codigo funciona — a extensao aparece no Cursor/VS Code, renderiza diagramas, conecta via WebSocket, tem flag interaction e status bar.

**O que falta pra fechar a Fase 7:**

1. Marcar planos 07-01/02/03 como completos no ROADMAP (ja esta feito neste handoff)
2. Executar o **plano 07-04** (novo) — melhorias de navegacao no painel da extensao
3. Publicar no VS Code Marketplace (VSC-06 — pode ser feito depois)

---

## Estado Atual do Codigo

### O que ja funciona (confirmado pelo usuario):

- Painel sidebar no Cursor/VS Code com diagrama Mermaid renderizado
- WebSocket conecta ao servidor SmartB (localhost:3333)
- Status bar mostra "Connected" com check verde
- Diagrama atualiza em tempo real quando `.mmd` muda
- Click-to-flag: clicar em nodo abre input pra adicionar flag
- State persistence: fechar/reabrir painel restaura diagrama
- VSIX empacotado em `vscode-extension/smartb-diagrams-vscode-0.1.0.vsix`

### Problemas identificados pelo usuario:

1. **Nao mostra nome do arquivo** — o painel exibe o diagrama mas nao indica QUAL arquivo `.mmd` esta sendo mostrado
2. **Nao tem seletor de arquivos** — nao da pra navegar entre multiplos `.mmd`, fica preso no primeiro carregado
3. **Nao tem indicacao de pasta/projeto** — quando tem multiplos projetos, nao ha contexto visual

### Arquivos da extensao (todos existem e compilam):

```
vscode-extension/
  src/
    extension.ts          (207 linhas) — entry point, orquestra tudo
    diagram-provider.ts   (119 linhas) — WebviewViewProvider
    ws-client.ts          (114 linhas) — WebSocket com reconnect
    http-client.ts        (84 linhas)  — HTTP GET/POST nativo
    status-bar.ts         (47 linhas)  — indicador status bar
    webview/
      main.ts             (186 linhas) — script do webview (mermaid render)
      flag-ui.ts          (124 linhas) — click-to-flag UI
  media/
    webview.css           — estilos do webview
    webview.js            — bundle compilado
    mermaid.min.js        — mermaid library local
    icon.svg              — icone activity bar
  package.json            — manifesto da extensao
  esbuild.mjs             — build script
  tsconfig.json           — TS config extensao
```

### Arquitetura da conexao:

```
smartb serve (porta 3333)
  ├── HTTP: /api/diagrams, /api/diagrams/:file, /save, /tree.json
  ├── WebSocket: /ws (file:changed, file:added, file:removed, tree:updated)
  └── Static: live.html (browser UI completa)

VS Code Extension
  ├── Extension Host (Node.js)
  │   ├── SmartBWsClient → conecta ws://localhost:3333/ws
  │   ├── httpClient → GET/POST ao servidor
  │   ├── DiagramViewProvider → gerencia webview
  │   └── StatusBarManager → barra inferior
  └── Webview (browser sandbox)
      ├── main.ts → recebe postMessage, renderiza mermaid
      └── flag-ui.ts → click em nodos, input inline
```

### Git state (dirty files):

```
Modified (staged):
  .planning/config.json
  test/fixtures/multi-project/project-a/diagram.mmd
  test/fixtures/valid-flowchart.mmd
  vscode-extension/media/webview.css
  vscode-extension/media/webview.js
  vscode-extension/media/webview.js.map
  vscode-extension/src/extension.ts
  vscode-extension/src/http-client.ts
  vscode-extension/src/webview/main.ts

Untracked:
  .planning/debug/
  CLAUDE.md
  diagram.mmd
  tsconfig.webview.tsbuildinfo
  vscode-extension/smartb-diagrams-vscode-0.1.0.vsix
```

---

## Plano 07-04: Navegacao de Arquivos no Painel VS Code

### Objetivo

Adicionar header com nome do arquivo, seletor/lista de arquivos, e navegacao entre diagramas no painel sidebar da extensao VS Code.

### Requirements novos:

- **VSC-08**: Nome do arquivo/diagrama visivel no header do painel webview
- **VSC-09**: Seletor de arquivos (dropdown ou mini file-list) para navegar entre `.mmd`
- **VSC-10**: Indicacao de pasta/projeto quando ha multiplos projetos

### Tasks detalhadas:

#### Task 1: Header com nome do arquivo e seletor

**Arquivos a modificar:**
- `vscode-extension/src/webview/main.ts` — adicionar header UI, handler de selecao
- `vscode-extension/media/webview.css` — estilos do header e file list

**Implementacao:**

1. Adicionar um `<div id="header">` acima do `<div id="diagram">` no HTML do webview
2. O header mostra:
   - Nome do arquivo atual (ex: `diagram.mmd`)
   - Path do projeto se multi-projeto (ex: `project-a/`)
   - Dropdown/botao pra abrir lista de arquivos
3. Quando o WebSocket envia `tree:updated`, popular a lista com os `.mmd` disponiveis
4. Clicar em outro arquivo envia `postMessage({ type: 'selectFile', file })` pro extension host
5. O extension host busca via HTTP GET `/api/diagrams/{file}` e envia pro webview
6. O `currentFile` no state eh atualizado pra persistir entre reopen

**CSS do header:**
```css
#header {
  display: flex;
  align-items: center;
  padding: 6px 12px;
  background: var(--vscode-sideBar-background);
  border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border);
  font-size: 12px;
  min-height: 28px;
}
#current-file {
  flex: 1;
  font-weight: 600;
  color: var(--vscode-sideBarTitle-foreground);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
#file-selector-btn { /* botao dropdown */ }
#file-list { /* lista dropdown posicao absolute */ }
.file-item { /* cada item na lista */ }
.file-item:hover { background: var(--vscode-list-hoverBackground); }
.file-item.active { background: var(--vscode-list-activeSelectionBackground); }
```

#### Task 2: Extension host — suporte a file selection e tree tracking

**Arquivos a modificar:**
- `vscode-extension/src/extension.ts` — handler de selectFile, tracking de tree

**Implementacao:**

1. No handler de mensagens do WebSocket, quando receber `tree:updated`:
   - Armazenar a lista de arquivos (array de strings com paths relativos)
   - Enviar pro webview: `postMessage({ type: 'tree:updated', files: [...] })`
2. No handler de mensagens do webview, quando receber `selectFile`:
   - Fazer HTTP GET em `/api/diagrams/{file}`
   - Enviar pro webview: `postMessage({ type: 'diagram:update', data: { type: 'file:changed', file, content } })`
   - Atualizar `currentFile`
3. No connect inicial (alem de buscar primeiro diagrama valido), buscar `/tree.json` pra popular a lista

**NOTA:** O extension host ja tem `fileContents` (Map) e `currentFile` tracking — a mudanca eh conectar eles ao webview e ao tree:updated.

#### Task 3: Atualizar diagram-provider.ts com HTML do header

**Arquivos a modificar:**
- `vscode-extension/src/diagram-provider.ts` — atualizar getHtmlForWebview()

**Implementacao:**

1. No template HTML, adicionar antes do `#diagram`:
```html
<div id="header">
  <span id="current-file">Connecting...</span>
  <button id="file-selector-btn" title="Select diagram file">
    <span class="codicon codicon-chevron-down"></span>
  </button>
</div>
<div id="file-list" class="hidden"></div>
<div id="diagram"></div>
```

2. Incluir font do VS Code codicons se necessario, ou usar caractere unicode simples pro dropdown

### Criterios de sucesso do 07-04:

1. O header do painel mostra o nome do arquivo `.mmd` sendo exibido
2. Um dropdown lista todos os `.mmd` disponiveis no servidor
3. Clicar em outro arquivo carrega e renderiza aquele diagrama
4. A lista atualiza automaticamente quando arquivos sao adicionados/removidos
5. O arquivo selecionado persiste ao fechar/reabrir o painel
6. Quando ha multi-projeto, o path do projeto aparece no header

### Limites de linhas (verificar apos):

- `main.ts` deve ficar < 300 linhas (atualmente 186). Se passar, extrair file-list UI pra `file-list.ts`
- `extension.ts` deve ficar < 250 linhas (atualmente 207). Se precisar, extrair handlers pra modulo separado
- Nenhum arquivo > 500 linhas

---

## Comandos Uteis

```bash
# Entrar no diretorio
cd /Users/simoni/Desktop/smartb-diagrams

# Build da extensao
cd vscode-extension && node esbuild.mjs

# TypeScript check
cd vscode-extension && npx tsc --noEmit

# Empacotar VSIX
cd vscode-extension && npx vsce package --allow-missing-repository

# Instalar extensao localmente (Cursor/VS Code)
cursor --install-extension vscode-extension/smartb-diagrams-vscode-0.1.0.vsix
# ou
code --install-extension vscode-extension/smartb-diagrams-vscode-0.1.0.vsix

# Iniciar servidor SmartB pra testar
npx smartb-diagrams serve

# Rodar testes do projeto principal
npm test

# Checar linhas dos arquivos
wc -l vscode-extension/src/*.ts vscode-extension/src/webview/*.ts
```

---

## GSD State (pra /gsd:progress)

- **Fase atual:** 7 de 8 (VS Code Extension)
- **Planos 07-01, 07-02, 07-03:** Completos (marcados no ROADMAP)
- **Plano 07-04:** Novo — navegacao de arquivos (pendente execucao)
- **Checkpoint 07-03 Task 2 (human-verify):** O usuario ja verificou visualmente que a extensao funciona (screenshot confirmando diagrama renderizado + "Connected")
- **Proxima acao:** Executar plano 07-04

---

## Pendencias Alem da Fase 7

### Fase 8 (Scalability + Large Diagrams) — Nao iniciada
- Collapsing hierarquico de subgraphs
- Limite de 50 nodos visiveis
- Breadcrumb navigation
- Focus mode

### Todos de Pre-Release (code review)
Listados em `.planning/STATE.md` secao "Pending Todos". Highlights:
- CRITICO: mermaid `securityLevel: 'loose'` no live.html (trocar pra `sandbox`)
- CRITICO: `readJsonBody` sem limite de tamanho (DoS)
- ALTO: nodeId sem escape no innerHTML do flag panel
- ALTO: Race condition em setFlag/removeFlag

### v2 Feature Ideas
Tambem em STATE.md — breakpoints de IA, ghost paths, diagramas como contrato, etc.

---

## Regras do Projeto (CLAUDE.md)

- Nunca fazer git push sem autorizacao explicita
- Sempre usar model opus pra agentes
- Limite de 500 linhas por arquivo
- Runtime Node.js >= 22, TypeScript, ESM
- Browser UI e vanilla JS (sem React/Vue)
- Testes obrigatorios pra features novas
- Build com tsup (projeto principal) e esbuild (extensao)

---

*Handoff preparado em 2026-02-15 por Claude Code (Opus 4.6)*
