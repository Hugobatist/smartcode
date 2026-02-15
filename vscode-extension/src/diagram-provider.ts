import * as vscode from 'vscode';

/**
 * WebviewViewProvider for the SmartB Diagrams sidebar panel.
 * Renders a webview that displays Mermaid diagrams and connection status.
 * Communicates with the extension host via postMessage.
 */
export class DiagramViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'smartb.diagramView';

  private view?: vscode.WebviewView;

  /** Optional callback for messages received from the webview. */
  public onWebviewMessage?: (msg: unknown) => void;

  /** Optional callback invoked when the webview becomes visible (resolveWebviewView). */
  public onWebviewReady?: () => void;

  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, 'media'),
      ],
    };

    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((msg) => {
      this.onWebviewMessage?.(msg);
    });

    webviewView.onDidDispose(() => {
      this.view = undefined;
    });

    // Notify extension host that the webview is ready for initial state
    this.onWebviewReady?.();
  }

  /** Send a message to the webview. */
  postMessage(message: unknown): void {
    this.view?.webview.postMessage(message);
  }

  /** Send the current diagram state to the webview (e.g., on reconnect/reshow). */
  sendCurrentState(file: string, content: string): void {
    this.postMessage({
      type: 'diagram:update',
      file,
      content,
    });
  }

  /** Whether the webview is currently visible. */
  get isVisible(): boolean {
    return this.view !== undefined;
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const nonce = this.getNonce();

    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'webview.css'),
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'webview.js'),
    );
    const mermaidUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'mermaid.min.js'),
    );

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
  <link href="${styleUri}" rel="stylesheet">
  <title>SmartB Diagrams</title>
</head>
<body>
  <div id="header">
    <div id="file-info">
      <span id="current-file">Connecting...</span>
      <span id="current-path"></span>
    </div>
    <button id="file-selector-btn" title="Select diagram file">&#9662;</button>
  </div>
  <div id="file-list"></div>
  <span id="connection-status" class="connection-status disconnected">Disconnected</span>
  <div id="diagram">
    <p class="status-message">Waiting for SmartB server connection...</p>
  </div>
  <script nonce="${nonce}" src="${mermaidUri}"></script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
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
