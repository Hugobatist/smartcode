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
}

/** Server WebSocket message types (mirrors server WsMessage). */
type WsMessage =
  | { type: 'file:changed'; file: string; content: string }
  | { type: 'file:added'; file: string }
  | { type: 'file:removed'; file: string }
  | { type: 'tree:updated'; files: string[] }
  | { type: 'connected'; project: string };

/** Messages received from the extension host. */
interface DiagramUpdateMessage {
  type: 'diagram:update';
  // WsMessage fields are spread in by the extension host
  file?: string;
  content?: string;
  files?: string[];
  project?: string;
}

interface ConnectionStatusMessage {
  type: 'connection:status';
  status: string;
}

type ExtensionMessage = DiagramUpdateMessage | ConnectionStatusMessage;

import { initFlagUI, initFlagClickHandlers, hideFlagInput } from './flag-ui.js';

(function () {
  const vscode = acquireVsCodeApi();

  // Restore previous state
  const state: WebviewState = vscode.getState() || { currentFile: '', lastContent: '' };

  const diagramEl = document.getElementById('diagram');
  const statusEl = document.getElementById('connection-status');

  // Initialize mermaid for dark theme rendering
  mermaid.initialize({
    startOnLoad: false,
    theme: 'dark',
    securityLevel: 'sandbox',
    flowchart: { htmlLabels: true, curve: 'basis' },
  });

  // Initialize flag UI with the vscode API reference
  initFlagUI(vscode);

  let renderCounter = 0;

  /**
   * Render a Mermaid diagram into the container.
   * Uses mermaid.render() which returns sanitized SVG.
   */
  async function renderDiagram(content: string, file: string): Promise<void> {
    if (!diagramEl) return;

    // Hide any open flag input
    hideFlagInput();

    try {
      renderCounter++;
      const { svg } = await mermaid.render('diagram-' + renderCounter, content);

      // Clear container safely, then insert sanitized SVG
      diagramEl.textContent = '';
      diagramEl.insertAdjacentHTML('afterbegin', svg);

      // Attach click handlers to nodes for flag interaction
      initFlagClickHandlers();

      // Persist state for restore on reshow
      vscode.setState({ currentFile: file, lastContent: content });
      // Update local state reference
      state.currentFile = file;
      state.lastContent = content;
    } catch (err) {
      // Show render error
      diagramEl.textContent = '';
      const errorMsg = document.createElement('p');
      errorMsg.className = 'status-message error';
      errorMsg.textContent = `Render error: ${err instanceof Error ? err.message : 'Unknown error'}`;
      diagramEl.appendChild(errorMsg);
    }
  }

  // Listen for messages from the extension host
  window.addEventListener('message', (event: MessageEvent<ExtensionMessage>) => {
    const msg = event.data;

    switch (msg.type) {
      case 'diagram:update': {
        // The extension host spreads WsMessage fields into this message.
        // We check for file + content which indicates a file:changed event.
        if (msg.content && msg.file) {
          renderDiagram(msg.content, msg.file);
        }
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
