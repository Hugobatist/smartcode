/**
 * File list dropdown component for the SmartB webview.
 * Provides file navigation between multiple .mmd diagrams.
 */

// VS Code API reference, set during initialization
let vscode: { postMessage(msg: unknown): void };

// DOM element references
let fileListEl: HTMLElement | null;
let currentFileEl: HTMLElement | null;
let currentPathEl: HTMLElement | null;
let selectorBtn: HTMLElement | null;

// Current state
let files: string[] = [];
let activeFile = '';

/** Initialize the file list component with the VS Code API reference. */
export function initFileList(vsCodeApi: { postMessage(msg: unknown): void }): void {
  vscode = vsCodeApi;

  fileListEl = document.getElementById('file-list');
  currentFileEl = document.getElementById('current-file');
  currentPathEl = document.getElementById('current-path');
  selectorBtn = document.getElementById('file-selector-btn');

  if (selectorBtn) {
    selectorBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFileList();
    });
  }

  // Close dropdown on outside click
  document.addEventListener('click', () => {
    hideFileList();
  });

  // Close dropdown on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      hideFileList();
    }
  });
}

/** Update the file list with available files from the server. */
export function updateFileList(newFiles: string[]): void {
  files = newFiles.sort();
  renderFileList();
}

/** Set the active file and update the header display. */
export function setActiveFile(file: string): void {
  activeFile = file;

  // Update header display
  if (currentFileEl) {
    const basename = file.split('/').pop() || file;
    currentFileEl.textContent = basename;
  }

  if (currentPathEl) {
    const parts = file.split('/');
    if (parts.length > 1) {
      currentPathEl.textContent = parts.slice(0, -1).join('/') + '/';
      currentPathEl.classList.add('visible');
    } else {
      currentPathEl.textContent = '';
      currentPathEl.classList.remove('visible');
    }
  }

  // Update active state in dropdown
  if (fileListEl) {
    fileListEl.querySelectorAll('.file-item').forEach((item) => {
      const el = item as HTMLElement;
      if (el.dataset.file === file) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });
  }
}

/** Hide the file list dropdown. */
export function hideFileList(): void {
  fileListEl?.classList.remove('visible');
}

/** Toggle the file list dropdown visibility. */
function toggleFileList(): void {
  fileListEl?.classList.toggle('visible');
}

/** Render the file list dropdown items. */
function renderFileList(): void {
  if (!fileListEl) return;

  fileListEl.innerHTML = '';

  // Group files by folder
  const groups = new Map<string, string[]>();
  for (const file of files) {
    const parts = file.split('/');
    const folder = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
    if (!groups.has(folder)) {
      groups.set(folder, []);
    }
    groups.get(folder)!.push(file);
  }

  // Render each group
  for (const [folder, groupFiles] of groups) {
    if (folder && groups.size > 1) {
      const label = document.createElement('div');
      label.className = 'file-group-label';
      label.textContent = folder + '/';
      fileListEl.appendChild(label);
    }

    for (const file of groupFiles) {
      const item = document.createElement('div');
      item.className = 'file-item' + (file === activeFile ? ' active' : '');
      item.dataset.file = file;

      const icon = document.createElement('span');
      icon.className = 'file-item-icon';
      icon.textContent = '◇';

      const name = document.createElement('span');
      name.className = 'file-item-name';
      name.textContent = file.split('/').pop() || file;

      item.appendChild(icon);
      item.appendChild(name);

      item.addEventListener('click', (e) => {
        e.stopPropagation();
        selectFile(file);
      });

      fileListEl.appendChild(item);
    }
  }
}

/** Handle file selection from the dropdown. */
function selectFile(file: string): void {
  hideFileList();
  setActiveFile(file);
  vscode.postMessage({ type: 'selectFile', file });
}
