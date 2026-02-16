/**
 * Pan/Zoom module for the SmartB VS Code webview.
 * Provides scroll-wheel zoom, drag-to-pan, and zoom controls.
 */

let zoom = 1;
let panX = 0;
let panY = 0;
let isPanning = false;
let panStarted = false;
let panStartX = 0;
let panStartY = 0;
let panStartPanX = 0;
let panStartPanY = 0;

const PAN_THRESHOLD = 3;

let container: HTMLElement | null = null;
let diagram: HTMLElement | null = null;
let zoomLabel: HTMLElement | null = null;

function applyTransform(): void {
  if (!diagram) return;
  diagram.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
}

function updateLabel(): void {
  if (zoomLabel) {
    zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
  }
}

export function zoomFit(): void {
  if (!container || !diagram) return;
  const svg = diagram.querySelector('svg');
  if (!svg) return;

  const rect = container.getBoundingClientRect();
  const vb = svg.viewBox?.baseVal;
  const svgW = (vb && vb.width) || svg.getBoundingClientRect().width / zoom;
  const svgH = (vb && vb.height) || svg.getBoundingClientRect().height / zoom;

  if (svgW <= 0 || svgH <= 0) return;

  const padFraction = 0.92;
  const scaleX = (rect.width * padFraction) / svgW;
  const scaleY = (rect.height * padFraction) / svgH;
  zoom = Math.min(scaleX, scaleY, 2.5);

  const scaledW = svgW * zoom;
  const scaledH = svgH * zoom;
  panX = (rect.width - scaledW) / 2;
  panY = (rect.height - scaledH) / 2;

  applyTransform();
  updateLabel();
}

function zoomIn(): void {
  const rect = container?.getBoundingClientRect();
  const cx = rect ? rect.width / 2 : 0;
  const cy = rect ? rect.height / 2 : 0;
  const newZoom = Math.min(zoom * 1.15, 5);
  panX = cx - (cx - panX) * (newZoom / zoom);
  panY = cy - (cy - panY) * (newZoom / zoom);
  zoom = newZoom;
  applyTransform();
  updateLabel();
}

function zoomOut(): void {
  const rect = container?.getBoundingClientRect();
  const cx = rect ? rect.width / 2 : 0;
  const cy = rect ? rect.height / 2 : 0;
  const newZoom = Math.max(zoom * 0.85, 0.1);
  panX = cx - (cx - panX) * (newZoom / zoom);
  panY = cy - (cy - panY) * (newZoom / zoom);
  zoom = newZoom;
  applyTransform();
  updateLabel();
}

export function initPanZoom(): void {
  container = document.getElementById('diagram-container');
  diagram = document.getElementById('diagram');
  zoomLabel = document.getElementById('zoom-label');

  if (!container || !diagram) return;

  // Scroll-wheel zoom
  container.addEventListener('wheel', (e: WheelEvent) => {
    e.preventDefault();
    const clamped = Math.max(-60, Math.min(60, e.deltaY));
    const factor = 1 - clamped * 0.002;
    const newZoom = Math.min(Math.max(zoom * factor, 0.1), 5);

    const rect = container!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    panX = mx - (mx - panX) * (newZoom / zoom);
    panY = my - (my - panY) * (newZoom / zoom);
    zoom = newZoom;

    applyTransform();
    updateLabel();
  }, { passive: false });

  // Drag-to-pan
  container.addEventListener('mousedown', (e: MouseEvent) => {
    if (e.button !== 0) return;
    // Don't pan if clicking on a flag-input or zoom control
    if ((e.target as HTMLElement).closest('.flag-input') ||
        (e.target as HTMLElement).closest('#zoom-controls')) return;
    isPanning = true;
    panStarted = false;
    panStartX = e.clientX;
    panStartY = e.clientY;
    panStartPanX = panX;
    panStartPanY = panY;
  });

  document.addEventListener('mousemove', (e: MouseEvent) => {
    if (!isPanning) return;
    if (!panStarted) {
      const dx = Math.abs(e.clientX - panStartX);
      const dy = Math.abs(e.clientY - panStartY);
      if (dx <= PAN_THRESHOLD && dy <= PAN_THRESHOLD) return;
      panStarted = true;
      container!.classList.add('grabbing');
    }
    panX = panStartPanX + (e.clientX - panStartX);
    panY = panStartPanY + (e.clientY - panStartY);
    applyTransform();
  });

  document.addEventListener('mouseup', () => {
    if (isPanning && panStarted) {
      container?.classList.remove('grabbing');
    }
    isPanning = false;
    panStarted = false;
  });

  // Zoom control buttons
  const zoomInBtn = document.getElementById('zoom-in');
  const zoomOutBtn = document.getElementById('zoom-out');
  const zoomFitBtn = document.getElementById('zoom-fit');

  zoomInBtn?.addEventListener('click', zoomIn);
  zoomOutBtn?.addEventListener('click', zoomOut);
  zoomFitBtn?.addEventListener('click', zoomFit);
}
