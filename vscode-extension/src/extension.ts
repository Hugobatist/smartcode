import * as vscode from 'vscode';
import { DiagramPanelManager } from './diagram-provider.js';
import { getHttpBaseUrl, httpGet, httpPost } from './http-client.js';
import { StatusBarManager } from './status-bar.js';
import { SmartBWsClient } from './ws-client.js';

export function activate(context: vscode.ExtensionContext): void {
  // Track current file, file list, and cached contents from WebSocket messages
  let currentFile = '';
  let fileList: string[] = [];
  const fileContents = new Map<string, string>();

  // 1. Create the panel manager
  const provider = new DiagramPanelManager(context.extensionUri);
  context.subscriptions.push(provider);

  // Register command to show the diagram panel
  context.subscriptions.push(
    vscode.commands.registerCommand('smartb.showDiagram', () => {
      provider.show(vscode.ViewColumn.Beside);
    }),
  );

  // Register serializer for panel restore on reload
  context.subscriptions.push(
    vscode.window.registerWebviewPanelSerializer(DiagramPanelManager.viewType, {
      async deserializeWebviewPanel(panel: vscode.WebviewPanel, _state: unknown) {
        provider.restore(panel);
      },
    }),
  );

  // 2. Create and register the status bar indicator
  const statusBar = new StatusBarManager();
  context.subscriptions.push(statusBar);

  // 3. Read configuration
  const config = vscode.workspace.getConfiguration('smartb');
  let serverUrl = config.get<string>('serverUrl', 'ws://localhost:3333/ws');
  const autoConnect = config.get<boolean>('autoConnect', true);

  // 4. Handle messages from the webview
  provider.onWebviewMessage = (msg: unknown) => {
    handleWebviewMessage(msg);
  };

  // Callback to send initial state when webview becomes visible
  provider.onWebviewReady = () => {
    // Send file list if available
    if (fileList.length > 0) {
      provider.postMessage({ type: 'tree:updated', files: fileList });
    }
    // Send current diagram if available
    if (currentFile && fileContents.has(currentFile)) {
      provider.postMessage({
        type: 'diagram:update',
        file: currentFile,
        content: fileContents.get(currentFile),
      });
    }
  };

  // 5. Create WebSocket client with callbacks that relay to the webview
  const wsClient = new SmartBWsClient(serverUrl, {
    onMessage: (msg) => {
      const wsMsg = msg as Record<string, unknown>;

      // Track file contents for flag saving and initial state restore
      if (wsMsg.type === 'file:changed' && typeof wsMsg.file === 'string' && typeof wsMsg.content === 'string') {
        fileContents.set(wsMsg.file, wsMsg.content);
        currentFile = wsMsg.file;
        // Relay content update to webview
        provider.postMessage({ type: 'diagram:update', file: wsMsg.file, content: wsMsg.content });
      }

      // Handle file:added — fetch its content and relay to webview
      if (wsMsg.type === 'file:added' && typeof wsMsg.file === 'string') {
        const addedFile = wsMsg.file;
        // Add to file list if not already present
        if (!fileList.includes(addedFile)) {
          fileList = [...fileList, addedFile];
          provider.postMessage({ type: 'tree:updated', files: fileList });
        }
        // Fetch the new file's content
        fetchFileContent(addedFile);
      }

      // Handle file:removed — clean up state and notify webview
      if (wsMsg.type === 'file:removed' && typeof wsMsg.file === 'string') {
        const removedFile = wsMsg.file;
        fileContents.delete(removedFile);
        fileList = fileList.filter((f) => f !== removedFile);
        provider.postMessage({ type: 'tree:updated', files: fileList });

        // If the removed file was the current one, select another or show empty state
        if (currentFile === removedFile) {
          if (fileList.length > 0) {
            selectFile(fileList[0]!);
          } else {
            currentFile = '';
            provider.postMessage({
              type: 'diagram:update',
              file: '',
              content: '',
            });
          }
        }
      }

      // Handle tree:updated events
      if (wsMsg.type === 'tree:updated' && Array.isArray(wsMsg.files)) {
        fileList = wsMsg.files as string[];
        provider.postMessage({ type: 'tree:updated', files: fileList });
      }
    },
    onStatus: (status) => {
      statusBar.setStatus(status);
      provider.postMessage({ type: 'connection:status', status });

      // Fetch initial diagram data and file tree when connected
      if (status === 'connected') {
        provider.show(vscode.ViewColumn.Beside);
        fetchInitialData();
      }
    },
  });

  // 6. Auto-connect if configured
  if (autoConnect) {
    wsClient.connect();
  }

  // 7. Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('smartb.reconnect', () => {
      wsClient.reconnect();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('smartb.openBrowser', () => {
      const wsUrl = vscode.workspace.getConfiguration('smartb').get<string>('serverUrl', 'ws://localhost:3333/ws');
      const httpUrl = getHttpBaseUrl(wsUrl);
      vscode.env.openExternal(vscode.Uri.parse(httpUrl));
    }),
  );

  // 8. Listen for configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('smartb.serverUrl')) {
        serverUrl = vscode.workspace.getConfiguration('smartb').get<string>('serverUrl', 'ws://localhost:3333/ws');
        wsClient.updateUrl(serverUrl);
      }
    }),
  );

  // 9. Clean up WebSocket on deactivation
  context.subscriptions.push({
    dispose: () => wsClient.disconnect(),
  });

  /** Handle messages sent from the webview via postMessage. */
  function handleWebviewMessage(msg: unknown): void {
    const data = msg as Record<string, unknown>;

    if (data.type === 'addFlag') {
      const nodeId = data.nodeId as string;
      const message = data.message as string;
      if (!nodeId || !message) return;
      saveFlag(nodeId, message);
    }

    if (data.type === 'selectFile') {
      const file = data.file as string;
      if (!file) return;
      selectFile(file);
    }
  }

  /** Handle file selection from webview dropdown. */
  async function selectFile(file: string): Promise<void> {
    currentFile = file;

    // If we have cached content, send it immediately
    if (fileContents.has(file)) {
      provider.postMessage({
        type: 'diagram:update',
        file,
        content: fileContents.get(file),
      });
      return;
    }

    // Otherwise fetch from server
    try {
      const httpBaseUrl = getHttpBaseUrl(serverUrl);
      const contentResp = await httpGet(`${httpBaseUrl}/api/diagrams/${encodeURIComponent(file)}`);
      const parsed = JSON.parse(contentResp) as { mermaidContent: string };
      fileContents.set(file, parsed.mermaidContent);
      provider.postMessage({
        type: 'diagram:update',
        file,
        content: parsed.mermaidContent,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      vscode.window.showErrorMessage(`SmartB: Failed to load diagram "${file}" - ${errMsg}`);
      provider.postMessage({
        type: 'diagram:update',
        file,
        content: '',
      });
    }
  }

  /** Fetch a single file's content from the server and cache it. */
  async function fetchFileContent(file: string): Promise<void> {
    try {
      const httpBaseUrl = getHttpBaseUrl(serverUrl);
      const contentResp = await httpGet(`${httpBaseUrl}/api/diagrams/${encodeURIComponent(file)}`);
      const parsed = JSON.parse(contentResp) as { mermaidContent: string };
      fileContents.set(file, parsed.mermaidContent);
    } catch {
      // Silently skip — content will be fetched on selection
    }
  }

  /** Fetch file tree and initial diagram on WebSocket connection. */
  async function fetchInitialData(): Promise<void> {
    try {
      const httpBaseUrl = getHttpBaseUrl(serverUrl);

      // Fetch file list from REST API (returns { files: string[] })
      const diagResp = await httpGet(`${httpBaseUrl}/api/diagrams`);
      const diagData = JSON.parse(diagResp) as { files: string[] };
      fileList = diagData.files;
      provider.postMessage({ type: 'tree:updated', files: fileList });

      // Then fetch and display the first valid diagram
      if (fileList.length === 0) return;

      const maxAttempts = Math.min(fileList.length, 5);
      for (let i = 0; i < maxAttempts; i++) {
        const file = fileList[i]!;
        try {
          const contentResp = await httpGet(`${httpBaseUrl}/api/diagrams/${encodeURIComponent(file)}`);
          const parsed = JSON.parse(contentResp) as {
            mermaidContent: string;
            validation: { valid: boolean };
          };

          fileContents.set(file, parsed.mermaidContent);

          if (!parsed.validation.valid && i < maxAttempts - 1) continue;

          currentFile = file;
          provider.postMessage({
            type: 'diagram:update',
            file,
            content: parsed.mermaidContent,
          });
          return;
        } catch {
          continue;
        }
      }
    } catch {
      // Silent fail — data will load on next file change
    }
  }

  /** Save a flag annotation to the .mmd file via SmartB server /save endpoint. */
  async function saveFlag(nodeId: string, message: string): Promise<void> {
    if (!currentFile) {
      vscode.window.showErrorMessage('SmartB: No diagram file is currently active.');
      return;
    }

    const content = fileContents.get(currentFile);
    if (!content) {
      vscode.window.showErrorMessage('SmartB: No cached content for the current diagram.');
      return;
    }

    const flagLine = `%% @flag ${nodeId} "${message}"`;
    const updatedContent = content.trimEnd() + '\n' + flagLine + '\n';

    try {
      const httpBaseUrl = getHttpBaseUrl(serverUrl);
      await httpPost(`${httpBaseUrl}/save`, {
        filename: currentFile,
        content: updatedContent,
      });
      fileContents.set(currentFile, updatedContent);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      vscode.window.showErrorMessage(`SmartB: Failed to save flag - ${errMsg}`);
    }
  }
}

export function deactivate(): void {
  // Cleanup handled by disposables registered in activate()
}
