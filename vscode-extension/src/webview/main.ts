/**
 * Webview script for the SmartB Diagrams sidebar panel.
 * Runs inside the VS Code webview context (browser sandbox).
 *
 * Renders Mermaid diagrams via the globally loaded mermaid.min.js,
 * handles flag click interactions, and persists state across hide/show.
 */

// Declare the VS Code API type for TypeScript
declare function acquireVsCodeApi(): {
  postMessage(msg: unknown): void;
  getState(): WebviewState | undefined;
  setState(state: WebviewState): void;
};

// Declare global mermaid from the separately loaded mermaid.min.js
declare const mermaid: {
  initialize(config: Record<string, unknown>): void;
  render(id: string, definition: string): Promise<{ svg: string }>;
};

/** Persisted webview state across hide/show cycles. */
interface WebviewState {
  currentFile: string;
  lastContent: string;
  fileList: string[];
}

/** Messages received from the extension host. */
interface DiagramUpdateMessage {
  type: 'diagram:update';
  file?: string;
  content?: string;
  files?: string[];
  project?: string;
}

interface TreeUpdateMessage {
  type: 'tree:updated';
  files: string[];
}

interface ConnectionStatusMessage {
  type: 'connection:status';
  status: string;
}

type ExtensionMessage = DiagramUpdateMessage | TreeUpdateMessage | ConnectionStatusMessage;

import { initFlagUI, initFlagClickHandlers, hideFlagInput } from './flag-ui.js';
import { initFileList, updateFileList, setActiveFile, hideFileList } from './file-list.js';

/**
 * Strip SmartB annotation blocks from raw .mmd content.
 */
function stripAnnotations(content: string): string {
  const startMarker = '%% --- ANNOTATIONS';
  const endMarker = '%% --- END ANNOTATIONS ---';
  const startIdx = content.indexOf(startMarker);
  const endIdx = content.indexOf(endMarker);

  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) return content;

  const endLineEnd = content.indexOf('\n', endIdx);
  const before = content.substring(0, startIdx);
  const after = endLineEnd === -1 ? '' : content.substring(endLineEnd + 1);
  return (before + after).replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

(function () {
  const vscode = acquireVsCodeApi();

  // Restore previous state
  const state: WebviewState = vscode.getState() || { currentFile: '', lastContent: '', fileList: [] };

  const diagramEl = document.getElementById('diagram');
  const statusEl = document.getElementById('connection-status');

  // Initialize mermaid for dark theme rendering.
  mermaid.initialize({
    startOnLoad: false,
    theme: 'dark',
    securityLevel: 'sandbox',
    flowchart: { htmlLabels: true, curve: 'basis' },
  });

  // Initialize UI components
  initFlagUI(vscode);
  initFileList(vscode);

  // Restore file list and active file from persisted state
  if (state.fileList.length > 0) {
    updateFileList(state.fileList);
  }
  if (state.currentFile) {
    setActiveFile(state.currentFile);
  }

  let renderCounter = 0;

  /**
   * Render a Mermaid diagram into the container.
   */
  async function renderDiagram(content: string, file: string): Promise<void> {
    if (!diagramEl) return;

    hideFlagInput();
    hideFileList();

    const cleanContent = stripAnnotations(content);

    try {
      renderCounter++;
      const { svg } = await mermaid.render('diagram-' + renderCounter, cleanContent);

      diagramEl.textContent = '';
      diagramEl.insertAdjacentHTML('afterbegin', svg);

      initFlagClickHandlers();

      // Update header with current file
      setActiveFile(file);

      // Persist state
      state.currentFile = file;
      state.lastContent = content;
      vscode.setState(state);
    } catch (err) {
      diagramEl.textContent = '';
      const container = document.createElement('div');
      container.className = 'status-message error';

      const title = document.createElement('p');
      title.style.fontWeight = 'bold';
      title.style.marginBottom = '8px';
      title.textContent = `Syntax error in ${file || 'diagram'}`;

      const detail = document.createElement('p');
      detail.style.opacity = '0.8';
      detail.style.fontSize = '0.85em';
      const rawMsg = err instanceof Error ? err.message : 'Unknown error';
      const match = rawMsg.match(/Parse error on line (\d+):/);
      detail.textContent = match
        ? `Parse error on line ${match[1]}. Check your Mermaid syntax.`
        : rawMsg;

      container.appendChild(title);
      container.appendChild(detail);
      diagramEl.appendChild(container);
    }
  }

  // Listen for messages from the extension host
  window.addEventListener('message', (event: MessageEvent<ExtensionMessage>) => {
    const msg = event.data;

    switch (msg.type) {
      case 'diagram:update': {
        if (msg.content && msg.file) {
          renderDiagram(msg.content, msg.file);
        }
        break;
      }

      case 'tree:updated': {
        const files = msg.files || [];
        updateFileList(files);
        state.fileList = files;
        vscode.setState(state);
        break;
      }

      case 'connection:status': {
        if (statusEl) {
          const status: string = msg.status;
          statusEl.textContent = status.charAt(0).toUpperCase() + status.slice(1);
          statusEl.className = `connection-status ${status}`;
        }
        break;
      }
    }
  });

  // On startup, restore the previous diagram if we have cached content
  if (state.lastContent) {
    renderDiagram(state.lastContent, state.currentFile);
  }
})();
