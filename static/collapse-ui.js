/**
 * SmartB Diagrams — Collapse UI
 * Browser-side collapse/expand interaction handlers.
 * Handles click events on collapsed nodes and subgraph headers.
 * Exposed as window.SmartBCollapseUI
 */
(function() {
  'use strict';

  const SmartBCollapseUI = {
    state: { collapsed: new Set() },
    autoCollapsed: [],
    breadcrumbs: [],
    focusedSubgraph: null,
    config: { maxVisibleNodes: 50 },
    onToggle: null,
    onFocusChange: null,

    // ─── Initialization ──────────────────────────────────────────────────────

    init(options = {}) {
      this.onToggle = options.onToggle || (() => {});
      this.attachClickHandlers();
    },

    initFocusMode(options = {}) {
      this.onFocusChange = options.onFocusChange || (() => {});
      this.attachFocusHandlers();
    },

    // ─── State Management ────────────────────────────────────────────────────

    setCollapsed(ids) {
      this.state.collapsed = new Set(ids);
    },

    getCollapsed() {
      return Array.from(this.state.collapsed);
    },

    setAutoCollapsed(ids) {
      this.autoCollapsed = ids || [];
      this.renderAutoCollapseNotice();
    },

    setConfig(config) {
      this.config = { ...this.config, ...config };
    },

    setBreadcrumbs(crumbs, focusedSubgraph) {
      this.breadcrumbs = crumbs || [];
      this.focusedSubgraph = focusedSubgraph;
      this.renderBreadcrumbs();
    },

    // ─── Click Handlers ──────────────────────────────────────────────────────

    attachClickHandlers() {
      const diagram = document.getElementById('preview');
      if (!diagram) return;

      diagram.addEventListener('click', (e) => {
        // Don't interfere with zoom controls
        if (e.target.closest('.zoom-controls')) return;
        if (e.target.closest('.flag-popover')) return;

        const target = e.target.closest('.node');
        if (target) {
          const nodeId = this.extractNodeId(target);
          if (nodeId && nodeId.startsWith('__collapsed__')) {
            e.preventDefault();
            e.stopPropagation();
            const subgraphId = nodeId.replace('__collapsed__', '');
            this.expand(subgraphId);
            return;
          }
        }

        // Click on cluster label to collapse
        const clusterLabel = e.target.closest('.cluster-label');
        if (clusterLabel) {
          const cluster = clusterLabel.closest('.cluster');
          if (cluster) {
            const clusterId = this.extractClusterId(cluster);
            if (clusterId) {
              e.preventDefault();
              e.stopPropagation();
              this.collapse(clusterId);
            }
          }
        }
      });
    },

    attachFocusHandlers() {
      const diagram = document.getElementById('preview');
      if (!diagram) return;

      // Double-click to enter focus mode
      diagram.addEventListener('dblclick', (e) => {
        const node = e.target.closest('.node');
        if (!node) return;

        const nodeId = this.extractNodeId(node);
        if (!nodeId) return;

        // Don't focus on collapsed summary nodes
        if (nodeId.startsWith('__collapsed__')) return;

        e.preventDefault();
        this.enterFocusMode(nodeId);
      });

      // Escape to exit focus mode
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.focusedSubgraph) {
          this.exitFocusMode();
        }
      });
    },

    extractNodeId(nodeElement) {
      const id = nodeElement.id || '';
      const match = id.match(/flowchart-(.+?)-\d+/);
      return match ? match[1] : null;
    },

    extractClusterId(clusterElement) {
      const id = clusterElement.id || '';
      // Clusters have id like "subGraph0" or contain the subgraph ID
      const match = id.match(/subGraph\d*-?(.+)?/);
      if (match && match[1]) return match[1];
      return id.replace(/^subGraph\d*/, '') || null;
    },

    // ─── Collapse/Expand Operations ──────────────────────────────────────────

    expand(subgraphId) {
      this.state.collapsed.delete(subgraphId);
      // Remove from auto-collapsed if present
      const idx = this.autoCollapsed.indexOf(subgraphId);
      if (idx !== -1) this.autoCollapsed.splice(idx, 1);
      this.renderAutoCollapseNotice();
      this.onToggle(this.getCollapsed());
    },

    collapse(subgraphId) {
      this.state.collapsed.add(subgraphId);
      this.onToggle(this.getCollapsed());
    },

    toggle(subgraphId) {
      if (this.state.collapsed.has(subgraphId)) {
        this.expand(subgraphId);
      } else {
        this.collapse(subgraphId);
      }
    },

    expandAll() {
      for (const id of this.autoCollapsed) {
        this.state.collapsed.delete(id);
      }
      this.autoCollapsed = [];
      this.renderAutoCollapseNotice();
      this.onToggle(this.getCollapsed());
    },

    // ─── Focus Mode ──────────────────────────────────────────────────────────

    enterFocusMode(nodeId) {
      if (this.onFocusChange) {
        this.onFocusChange({ action: 'focus', nodeId });
      }
    },

    exitFocusMode() {
      this.focusedSubgraph = null;
      this.breadcrumbs = [];
      this.renderBreadcrumbs();
      if (this.onFocusChange) {
        this.onFocusChange({ action: 'exit' });
      }
    },

    navigateTo(breadcrumbId) {
      if (this.onFocusChange) {
        this.onFocusChange({ action: 'navigate', breadcrumbId });
      }
    },

    // ─── UI Rendering ────────────────────────────────────────────────────────

    renderAutoCollapseNotice() {
      const existing = document.getElementById('auto-collapse-notice');
      if (existing) existing.remove();

      if (this.autoCollapsed.length === 0) return;

      const notice = document.createElement('div');
      notice.id = 'auto-collapse-notice';
      notice.className = 'auto-collapse-notice';
      notice.innerHTML = `
        <span class="notice-icon">📊</span>
        <span class="notice-text">
          ${this.autoCollapsed.length} subgraph${this.autoCollapsed.length > 1 ? 's' : ''} 
          auto-collapsed to fit ${this.config.maxVisibleNodes || 50} node limit
        </span>
        <button class="notice-expand-all" title="Expand all">
          Expand All
        </button>
        <button class="notice-dismiss" title="Dismiss">✕</button>
      `;

      notice.querySelector('.notice-expand-all').addEventListener('click', () => {
        this.expandAll();
      });
      notice.querySelector('.notice-dismiss').addEventListener('click', () => {
        notice.remove();
      });

      const container = document.getElementById('preview-container');
      if (container) container.insertBefore(notice, container.firstChild);
    },

    renderBreadcrumbs() {
      const existing = document.getElementById('breadcrumb-bar');
      if (existing) existing.remove();

      // Don't render if no breadcrumbs or only "Overview" without focus
      if (this.breadcrumbs.length <= 1 && !this.focusedSubgraph) return;

      const bar = document.createElement('div');
      bar.id = 'breadcrumb-bar';
      bar.className = 'breadcrumb-bar';

      for (let i = 0; i < this.breadcrumbs.length; i++) {
        const crumb = this.breadcrumbs[i];
        const isLast = i === this.breadcrumbs.length - 1;

        const item = document.createElement('span');
        item.className = 'breadcrumb-item' + (isLast ? ' current' : '');
        item.textContent = crumb.label;
        item.dataset.id = crumb.id;

        if (!isLast) {
          item.addEventListener('click', () => {
            this.navigateTo(crumb.id);
          });
        }

        bar.appendChild(item);

        if (!isLast) {
          const sep = document.createElement('span');
          sep.className = 'breadcrumb-separator';
          sep.textContent = ' › ';
          bar.appendChild(sep);
        }
      }

      // Add exit button if in focus mode
      if (this.focusedSubgraph) {
        const exitBtn = document.createElement('button');
        exitBtn.className = 'breadcrumb-exit';
        exitBtn.textContent = '✕ Exit Focus';
        exitBtn.title = 'Exit focus mode (Esc)';
        exitBtn.addEventListener('click', () => this.exitFocusMode());
        bar.appendChild(exitBtn);
      }

      const container = document.getElementById('preview-container');
      if (container) container.insertBefore(bar, container.firstChild);
    }
  };

  window.SmartBCollapseUI = SmartBCollapseUI;
})();
