/**
 * Flag interaction UI for the SmartB Diagrams webview.
 * Provides click-to-flag functionality on Mermaid SVG nodes.
 *
 * When a user clicks a node in the rendered diagram, an inline input
 * appears for entering a flag message. Submitting sends an addFlag
 * message to the extension host, which POSTs to the SmartB server.
 */

/** VS Code API interface (subset used by flag UI). */
interface VsCodeApi {
  postMessage(msg: unknown): void;
}

let vsCodeApi: VsCodeApi | null = null;
let activeInput: HTMLInputElement | null = null;

/** Regex to extract node ID from Mermaid-generated element IDs. */
// Mermaid generates IDs like "flowchart-NodeId-0" or "flowchart-NodeId-12"
const NODE_ID_REGEX = /^flowchart-(.+)-\d+$/;

/**
 * Initialize the flag UI module with a reference to the VS Code API.
 * Must be called once before initFlagClickHandlers.
 */
export function initFlagUI(vscode: VsCodeApi): void {
  vsCodeApi = vscode;
}

/**
 * Attach click listeners to all .node elements in the current SVG.
 * Call this after each mermaid.render() to rebind handlers.
 */
export function initFlagClickHandlers(): void {
  const nodes = document.querySelectorAll<SVGGElement>('.node');

  for (const node of nodes) {
    // Avoid double-binding
    if (node.dataset.flagBound) continue;
    node.dataset.flagBound = 'true';
    node.style.cursor = 'pointer';

    node.addEventListener('click', (e: Event) => {
      e.stopPropagation();
      const nodeId = extractNodeId(node);
      if (nodeId) {
        showFlagInput(node, nodeId);
      }
    });
  }
}

/**
 * Remove the inline flag input if visible.
 */
export function hideFlagInput(): void {
  if (activeInput) {
    activeInput.remove();
    activeInput = null;
  }
}

/**
 * Extract the logical node ID from a Mermaid SVG element.
 * Mermaid generates IDs like "flowchart-NodeId-0".
 */
function extractNodeId(node: SVGGElement): string | null {
  const id = node.id;
  if (!id) return null;

  const match = NODE_ID_REGEX.exec(id);
  if (match) {
    return match[1]!;
  }

  // Fallback: use the id as-is if it doesn't match the pattern
  return id;
}

/**
 * Show an inline input element near the clicked node for flag text entry.
 */
function showFlagInput(node: SVGGElement, nodeId: string): void {
  // Remove any existing input
  hideFlagInput();

  const container = document.getElementById('diagram-container') || document.getElementById('diagram');
  if (!container) return;

  // Get node position relative to the diagram container
  const nodeRect = node.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'flag-input';
  input.placeholder = `Flag for ${nodeId}...`;
  input.style.position = 'absolute';
  input.style.left = `${nodeRect.left - containerRect.left}px`;
  input.style.top = `${nodeRect.bottom - containerRect.top + 4}px`;

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const message = input.value.trim();
      if (message && vsCodeApi) {
        vsCodeApi.postMessage({ type: 'addFlag', nodeId, message });
      }
      hideFlagInput();
    } else if (e.key === 'Escape') {
      hideFlagInput();
    }
  });

  // Close on click outside
  input.addEventListener('blur', () => {
    // Small delay to allow Enter to fire before blur
    setTimeout(() => hideFlagInput(), 150);
  });

  container.style.position = 'relative';
  container.appendChild(input);
  activeInput = input;
  input.focus();
}
