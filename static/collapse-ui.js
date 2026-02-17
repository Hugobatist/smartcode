/**
 * SmartB Diagrams — Collapse UI
 * Browser-side collapse/expand interaction handlers.
 * Handles click events on collapsed nodes and subgraph headers.
 * Exposed as window.SmartBCollapseUI
 *
 * Dependencies: diagram-dom.js (DiagramDOM), event-bus.js (SmartBEventBus)
 */
(function() {
  'use strict';

  // Private state -- not exposed on the public object
  var _state = { collapsed: new Set() };

  var SmartBCollapseUI = {
    autoCollapsed: [],
    breadcrumbs: [],
    focusedSubgraph: null,
    config: { maxVisibleNodes: 50 },
    onToggle: null,
    onFocusChange: null,

    // ─── Initialization ──────────────────────────────────────────────────────

    init: function(options) {
      options = options || {};
      this.onToggle = options.onToggle || (function() {});
      this.attachClickHandlers();

      // Subscribe to event bus: re-apply overlays after diagram render
      if (window.SmartBEventBus) {
        var self = this;
        SmartBEventBus.on('diagram:rendered', function() {
          if (typeof self.applyOverlays === 'function') {
            self.applyOverlays();
          }
        });
      }
    },

    initFocusMode: function(options) {
      options = options || {};
      this.onFocusChange = options.onFocusChange || (function() {});
      this.attachFocusHandlers();
    },

    // ─── State Management ────────────────────────────────────────────────────

    setCollapsed: function(ids) {
      _state.collapsed = new Set(ids);
    },

    getCollapsed: function() {
      return Array.from(_state.collapsed);
    },

    setAutoCollapsed: function(ids) {
      this.autoCollapsed = ids || [];
      this.renderAutoCollapseNotice();
    },

    setConfig: function(config) {
      this.config = Object.assign({}, this.config, config);
    },

    setBreadcrumbs: function(crumbs, focusedSubgraph) {
      this.breadcrumbs = crumbs || [];
      this.focusedSubgraph = focusedSubgraph;
      this.renderBreadcrumbs();
    },

    // ─── Click Handlers ──────────────────────────────────────────────────────

    attachClickHandlers: function() {
      var diagram = document.getElementById('preview');
      if (!diagram) return;
      var self = this;

      diagram.addEventListener('click', function(e) {
        // Respect FSM states — don't interfere with editing or context menu
        if (window.SmartBInteraction) {
          var st = SmartBInteraction.getState();
          if (st === 'editing' || st === 'context-menu') return;
        }
        // Don't interfere with zoom controls
        if (e.target.closest('.zoom-controls')) return;
        if (e.target.closest('.flag-popover')) return;

        var target = e.target.closest('.node') || e.target.closest('.smartb-node');
        if (target) {
          var nodeId = self.extractNodeId(target);
          if (nodeId && nodeId.startsWith('__collapsed__')) {
            e.preventDefault();
            e.stopPropagation();
            var subgraphId = nodeId.replace('__collapsed__', '');
            self.expand(subgraphId);
            return;
          }
        }

        // Click on cluster label to collapse (Mermaid .cluster or custom .smartb-subgraph)
        var clusterLabel = e.target.closest('.cluster-label');
        if (clusterLabel) {
          var cluster = clusterLabel.closest('.cluster') || clusterLabel.closest('.smartb-subgraph');
          if (cluster) {
            var clusterId = self.extractClusterId(cluster);
            if (clusterId) {
              e.preventDefault();
              e.stopPropagation();
              self.collapse(clusterId);
            }
          }
        }
      });
    },

    attachFocusHandlers: function() {
      var diagram = document.getElementById('preview');
      if (!diagram) return;
      var self = this;

      // Double-click to enter focus mode
      diagram.addEventListener('dblclick', function(e) {
        // Respect FSM states — don't enter focus mode when editing or a node is selected
        if (window.SmartBInteraction) {
          var st = SmartBInteraction.getState();
          if (st === 'editing' || st === 'selected') return;
        }
        var node = e.target.closest('.node') || e.target.closest('.smartb-node');
        if (!node) return;

        var nodeId = self.extractNodeId(node);
        if (!nodeId) return;

        // Don't focus on collapsed summary nodes
        if (nodeId.startsWith('__collapsed__')) return;

        e.preventDefault();
        self.enterFocusMode(nodeId);
      });

      // Escape to exit focus mode
      document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && self.focusedSubgraph) {
          self.exitFocusMode();
        }
      });
    },

    // Use DiagramDOM.extractNodeId for node identification
    extractNodeId: function(nodeElement) {
      var info = DiagramDOM.extractNodeId(nodeElement);
      return info ? info.id : null;
    },

    // Use DiagramDOM for cluster/subgraph identification
    extractClusterId: function(clusterElement) {
      var info = DiagramDOM.extractNodeId(clusterElement);
      if (info && info.type === 'subgraph') return info.id;
      // Fallback: try the element's own ID for plain cluster IDs
      var id = clusterElement.id || '';
      if (id) return id.replace(/^subGraph\d*-?/, '') || null;
      return null;
    },

    // ─── Collapse/Expand Operations ──────────────────────────────────────────

    expand: function(subgraphId) {
      _state.collapsed.delete(subgraphId);
      // Remove from auto-collapsed if present
      var idx = this.autoCollapsed.indexOf(subgraphId);
      if (idx !== -1) this.autoCollapsed.splice(idx, 1);
      this.renderAutoCollapseNotice();
      this.onToggle(this.getCollapsed());
    },

    collapse: function(subgraphId) {
      _state.collapsed.add(subgraphId);
      this.onToggle(this.getCollapsed());
    },

    toggle: function(subgraphId) {
      if (_state.collapsed.has(subgraphId)) {
        this.expand(subgraphId);
      } else {
        this.collapse(subgraphId);
      }
    },

    expandAll: function() {
      for (var i = 0; i < this.autoCollapsed.length; i++) {
        _state.collapsed.delete(this.autoCollapsed[i]);
      }
      this.autoCollapsed = [];
      this.renderAutoCollapseNotice();
      this.onToggle(this.getCollapsed());
    },

    // ─── Focus Mode ──────────────────────────────────────────────────────────

    enterFocusMode: function(nodeId) {
      if (this.onFocusChange) {
        this.onFocusChange({ action: 'focus', nodeId: nodeId });
      }
    },

    exitFocusMode: function() {
      this.focusedSubgraph = null;
      this.breadcrumbs = [];
      this.renderBreadcrumbs();
      if (this.onFocusChange) {
        this.onFocusChange({ action: 'exit' });
      }
    },

    navigateTo: function(breadcrumbId) {
      if (this.onFocusChange) {
        this.onFocusChange({ action: 'navigate', breadcrumbId: breadcrumbId });
      }
    },

    // ─── UI Rendering ────────────────────────────────────────────────────────

    renderAutoCollapseNotice: function() {
      var existing = document.getElementById('auto-collapse-notice');
      if (existing) existing.remove();

      if (this.autoCollapsed.length === 0) return;

      var notice = document.createElement('div');
      notice.id = 'auto-collapse-notice';
      notice.className = 'auto-collapse-notice';

      var icon = document.createElement('span');
      icon.className = 'notice-icon';
      // Safe: SmartBIcons.chart is a static trusted SVG string
      icon.innerHTML = SmartBIcons.chart;
      notice.appendChild(icon);

      var text = document.createElement('span');
      text.className = 'notice-text';
      var count = this.autoCollapsed.length;
      var limit = this.config.maxVisibleNodes || 50;
      text.textContent = count + ' subgraph' + (count > 1 ? 's' : '') + ' auto-collapsed to fit ' + limit + ' node limit';
      notice.appendChild(text);

      var self = this;
      var expandBtn = document.createElement('button');
      expandBtn.className = 'notice-expand-all';
      expandBtn.title = 'Expand all';
      expandBtn.textContent = 'Expand All';
      expandBtn.addEventListener('click', function() {
        self.expandAll();
      });
      notice.appendChild(expandBtn);

      var dismissBtn = document.createElement('button');
      dismissBtn.className = 'notice-dismiss';
      dismissBtn.title = 'Dismiss';
      // Safe: SmartBIcons.close is a static trusted SVG string
      dismissBtn.innerHTML = SmartBIcons.close;
      dismissBtn.addEventListener('click', function() {
        notice.remove();
      });
      notice.appendChild(dismissBtn);

      var container = document.getElementById('preview-container');
      if (container) container.insertBefore(notice, container.firstChild);
    },

    renderBreadcrumbs: function() {
      var existing = document.getElementById('breadcrumb-bar');
      if (existing) existing.remove();

      // Don't render if no breadcrumbs or only "Overview" without focus
      if (this.breadcrumbs.length <= 1 && !this.focusedSubgraph) return;

      var bar = document.createElement('div');
      bar.id = 'breadcrumb-bar';
      bar.className = 'breadcrumb-bar';

      var self = this;
      for (var i = 0; i < this.breadcrumbs.length; i++) {
        var crumb = this.breadcrumbs[i];
        var isLast = i === this.breadcrumbs.length - 1;

        var item = document.createElement('span');
        item.className = 'breadcrumb-item' + (isLast ? ' current' : '');
        item.textContent = crumb.label;
        item.dataset.id = crumb.id;

        if (!isLast) {
          item.addEventListener('click', (function(c) {
            return function() { self.navigateTo(c.id); };
          })(crumb));
        }

        bar.appendChild(item);

        if (!isLast) {
          var sep = document.createElement('span');
          sep.className = 'breadcrumb-separator';
          sep.textContent = ' \u203A ';
          bar.appendChild(sep);
        }
      }

      // Add exit button if in focus mode
      if (this.focusedSubgraph) {
        var exitBtn = document.createElement('button');
        exitBtn.className = 'breadcrumb-exit';
        // Safe: SmartBIcons.close is a static trusted SVG string
        exitBtn.innerHTML = SmartBIcons.close + ' Exit Focus';
        exitBtn.title = 'Exit focus mode (Esc)';
        exitBtn.addEventListener('click', function() { self.exitFocusMode(); });
        bar.appendChild(exitBtn);
      }

      var container = document.getElementById('preview-container');
      if (container) container.insertBefore(bar, container.firstChild);
    }
  };

  window.SmartBCollapseUI = SmartBCollapseUI;
})();
