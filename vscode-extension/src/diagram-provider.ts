import * as vscode from 'vscode';

/**
 * Manages a singleton WebviewPanel (editor tab) for rendering Mermaid diagrams.
 * Replaces the old WebviewViewProvider (sidebar) approach.
 */
export class DiagramPanelManager {
  public static readonly viewType = 'smartb.diagramPanel';

  private panel?: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

  /** Optional callback for messages received from the webview. */
  public onWebviewMessage?: (msg: unknown) => void;

  /** Optional callback invoked when the webview scripts have loaded (ready handshake). */
  public onWebviewReady?: () => void;

  constructor(private readonly extensionUri: vscode.Uri) {}

  /** Show the diagram panel, creating it if it doesn't exist. */
  show(column?: vscode.ViewColumn): void {
    if (this.panel) {
      this.panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      DiagramPanelManager.viewType,
      'SmartB Diagrams',
      column ?? vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')],
      },
    );

    this.initPanel(panel);
  }

  /** Restore a previously serialized panel (called by WebviewPanelSerializer). */
  restore(existingPanel: vscode.WebviewPanel): void {
    existingPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')],
    };
    this.initPanel(existingPanel);
  }

  /** Send a message to the webview. */
  postMessage(message: unknown): void {
    this.panel?.webview.postMessage(message);
  }

  /** Send the current diagram state to the webview (e.g., on reconnect/reshow). */
  sendCurrentState(file: string, content: string): void {
    this.postMessage({ type: 'diagram:update', file, content });
  }

  /** Whether the webview panel exists (not disposed). */
  get isVisible(): boolean {
    return this.panel !== undefined;
  }

  /** Dispose the panel and clean up all listeners. */
  dispose(): void {
    this.panel?.dispose();
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }

  /** Wire up a panel: set HTML, register handlers, wait for ready handshake. */
  private initPanel(panel: vscode.WebviewPanel): void {
    // Clean up any previous disposables
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }

    this.panel = panel;
    panel.webview.html = this.getHtmlForWebview(panel.webview);

    // Listen for messages — intercept 'webview:ready' handshake, delegate the rest
    this.disposables.push(
      panel.webview.onDidReceiveMessage((msg) => {
        const data = msg as Record<string, unknown>;
        if (data.type === 'webview:ready') {
          this.onWebviewReady?.();
          return;
        }
        this.onWebviewMessage?.(msg);
      }),
    );

    this.disposables.push(
      panel.onDidDispose(() => {
        this.panel = undefined;
        while (this.disposables.length) {
          this.disposables.pop()?.dispose();
        }
      }),
    );
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const nonce = this.getNonce();
    const mediaUri = (file: string) =>
      webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', file));

    // NOTE: 'unsafe-inline' in style-src is required because mermaid
    // generates SVG with inline style attributes that cannot use nonces.
    const csp = [
      `default-src 'none'`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}'`,
      `img-src ${webview.cspSource} data:`,
      `font-src ${webview.cspSource}`,
    ].join('; ');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${mediaUri('webview.css')}" rel="stylesheet">
  <title>SmartB Diagrams</title>
</head>
<body>
  <div id="header">
    <div id="file-info">
      <span id="current-file">Connecting...</span>
      <span id="current-path"></span>
    </div>
    <button id="file-selector-btn" title="Select diagram file">&#9662;</button>
    <span id="connection-status" class="connection-status disconnected">Disconnected</span>
    <div id="file-list"></div>
  </div>
  <div id="diagram">
    <p class="status-message">Waiting for SmartB server connection...</p>
  </div>
  <script nonce="${nonce}" src="${mediaUri('mermaid.min.js')}"></script>
  <script nonce="${nonce}" src="${mediaUri('webview.js')}"></script>
</body>
</html>`;
  }

  private getNonce(): string {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let nonce = '';
    for (let i = 0; i < 32; i++) {
      nonce += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return nonce;
  }
}
