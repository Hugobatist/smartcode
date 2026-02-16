/**
 * SmartB Context Menu -- right-click context menu for diagram nodes and edges.
 * Shows action items: Edit, Delete, Duplicate, Flag, Connect (nodes) or Delete, Flag (edges).
 *
 * Dependencies:
 *   - interaction-state.js (SmartBInteraction)
 *   - diagram-dom.js (DiagramDOM)
 *   - diagram-editor.js (MmdEditor)
 *   - annotations.js (SmartBAnnotations)
 *   - selection.js (SmartBSelection)
 *
 * Usage:
 *   SmartBContextMenu.init();
 *   SmartBContextMenu.show(x, y, nodeInfo);
 *   SmartBContextMenu.close();
 */
(function() {
    'use strict';

    var menuEl = null;
    var outsideHandler = null;

    // ── Style Injection ──
    var styleEl = document.createElement('style');
    styleEl.textContent = [
        '.context-menu {',
        '  position: fixed; z-index: 10000; background: var(--panel-bg, #1e1e2e);',
        '  border: 1px solid var(--border, #313244); border-radius: 8px;',
        '  box-shadow: 0 8px 24px rgba(0,0,0,0.4); padding: 4px 0;',
        '  min-width: 180px; font-family: "Inter", sans-serif; font-size: 13px;',
        '}',
        '.context-menu-item {',
        '  padding: 8px 16px; cursor: pointer; color: var(--text, #cdd6f4);',
        '  display: flex; align-items: center; gap: 8px; transition: background 0.1s;',
        '}',
        '.context-menu-item:hover { background: var(--hover-bg, #313244); }',
        '.context-menu-item.danger { color: #ef4444; }',
        '.context-menu-item.danger:hover { background: rgba(239,68,68,0.15); }',
        '.context-menu-separator { height: 1px; background: var(--border, #313244); margin: 4px 0; }',
    ].join('\n');
    document.head.appendChild(styleEl);

    // ── Helpers ──

    function createMenuItem(label, className, handler) {
        var item = document.createElement('div');
        item.className = 'context-menu-item' + (className ? ' ' + className : '');
        item.textContent = label;
        item.addEventListener('click', function(e) {
            e.stopPropagation();
            closeContextMenu();
            handler();
        });
        return item;
    }

    function createSeparator() {
        var sep = document.createElement('div');
        sep.className = 'context-menu-separator';
        return sep;
    }

    // ── Duplicate Helper ──

    function doDuplicate(nodeId) {
        if (window.MmdEditor && MmdEditor.applyEdit && MmdEditor.duplicateNode) {
            MmdEditor.applyEdit(function(c) { return MmdEditor.duplicateNode(c, nodeId); });
        }
    }

    // ── Flag Helper ──

    function doFlag() {
        if (window.SmartBInteraction) {
            SmartBInteraction.forceState('flagging');
        }
        if (window.SmartBAnnotations) {
            var s = SmartBAnnotations.getState();
            if (!s.flagMode) SmartBAnnotations.toggleFlagMode();
        }
        if (window.toast) toast('Flag Mode ativado — clique no nodo para sinalizar');
    }

    // ── Show Context Menu ──

    function showContextMenu(x, y, nodeInfo) {
        closeContextMenu();

        var menu = document.createElement('div');
        menu.className = 'context-menu';

        // Clamp position to stay on-screen
        menu.style.left = Math.min(x, window.innerWidth - 200) + 'px';
        menu.style.top = Math.min(y, window.innerHeight - 250) + 'px';

        if (nodeInfo.type === 'node' || nodeInfo.type === 'subgraph') {
            // Node context menu: 5 items
            menu.appendChild(createMenuItem('Editar Texto', '', function() {
                if (window.SmartBInlineEdit) {
                    if (window.SmartBInteraction) SmartBInteraction.transition('edit_action');
                    SmartBInlineEdit.open(nodeInfo.id);
                } else if (window.MmdEditor) {
                    MmdEditor.doEditNodeText(nodeInfo.id);
                }
            }));

            menu.appendChild(createMenuItem('Deletar', 'danger', function() {
                if (window.MmdEditor) MmdEditor.doRemoveNode(nodeInfo.id);
            }));

            menu.appendChild(createMenuItem('Duplicar', '', function() {
                doDuplicate(nodeInfo.id);
            }));

            menu.appendChild(createSeparator());

            menu.appendChild(createMenuItem('Sinalizar', '', function() {
                doFlag();
            }));

            menu.appendChild(createMenuItem('Toggle Breakpoint', '', function() {
                if (window.SmartBBreakpoints) SmartBBreakpoints.toggleBreakpoint(nodeInfo.id);
            }));

            menu.appendChild(createMenuItem('Nova Seta', '', function() {
                if (window.MmdEditor) MmdEditor.startConnectFrom(nodeInfo.id);
            }));

        } else if (nodeInfo.type === 'edge') {
            // Edge context menu: 2 items
            menu.appendChild(createMenuItem('Deletar', 'danger', function() {
                if (window.MmdEditor) {
                    // Parse edge endpoints from content
                    var editor = document.getElementById('editor');
                    if (editor) {
                        var patterns = MmdEditor.findEdgeEndpoints(nodeInfo.id, editor.value);
                        if (patterns.length > 0) {
                            MmdEditor.doRemoveEdge(patterns[0].from, patterns[0].to);
                        }
                    }
                }
            }));

            menu.appendChild(createMenuItem('Sinalizar', '', function() {
                doFlag();
            }));
        }

        document.body.appendChild(menu);
        menuEl = menu;

        // Outside click handler (delay to avoid immediate close)
        setTimeout(function() {
            outsideHandler = function(e) {
                if (menu.contains(e.target)) return;
                closeContextMenu();
            };
            document.addEventListener('mousedown', outsideHandler);
        }, 50);
    }

    // ── Close Context Menu ──

    function closeContextMenu() {
        if (menuEl) {
            menuEl.remove();
            menuEl = null;
        }
        if (outsideHandler) {
            document.removeEventListener('mousedown', outsideHandler);
            outsideHandler = null;
        }
        // Transition FSM back to idle if in context-menu state
        if (window.SmartBInteraction && SmartBInteraction.getState() === 'context-menu') {
            SmartBInteraction.transition('close');
        }
    }

    // ── Right-click Handler ──

    function handleContextMenu(e) {
        // Check FSM blocking states
        if (window.SmartBInteraction && SmartBInteraction.isBlocking()) return;

        // Don't show custom menu if in special modes
        var fsmState = window.SmartBInteraction ? SmartBInteraction.getState() : 'idle';
        if (fsmState === 'flagging' || fsmState === 'add-node' || fsmState === 'add-edge') return;

        // Skip UI controls
        if (e.target.closest('.zoom-controls') ||
            e.target.closest('.flag-popover') ||
            e.target.closest('.editor-popover')) return;

        // Detect what was right-clicked
        var nodeInfo = DiagramDOM.extractNodeId(e.target);
        if (!nodeInfo) return; // Let browser default context menu show

        e.preventDefault();

        // Select the node/edge first
        if (window.SmartBSelection) {
            if (nodeInfo.type === 'node' || nodeInfo.type === 'subgraph') {
                SmartBSelection.selectNode(nodeInfo.id);
            } else if (nodeInfo.type === 'edge') {
                SmartBSelection.selectEdge(nodeInfo.id);
            }
        }

        // Transition FSM to context-menu state
        if (window.SmartBInteraction) {
            SmartBInteraction.transition('right_click', nodeInfo);
        }

        showContextMenu(e.clientX, e.clientY, nodeInfo);
    }

    // ── Escape Handler ──

    function handleEscapeKey(e) {
        if (e.key === 'Escape' && window.SmartBInteraction &&
            SmartBInteraction.getState() === 'context-menu') {
            closeContextMenu();
        }
    }

    // ── Init ──

    function init() {
        var container = document.getElementById('preview-container');
        if (container) {
            container.addEventListener('contextmenu', handleContextMenu);
        }
        document.addEventListener('keydown', handleEscapeKey);
    }

    // ── Public API ──
    window.SmartBContextMenu = {
        init: init,
        close: closeContextMenu,
        show: showContextMenu,
    };
})();
