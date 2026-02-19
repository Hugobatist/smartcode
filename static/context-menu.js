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
        if (window.toast) toast('Flag Mode enabled -- click on a node to flag');
    }

    // ── Ghost Path Helper ──

    var ghostPathSource = null;

    function startGhostPathFlow(sourceNodeId) {
        ghostPathSource = sourceNodeId;
        if (window.toast) toast('Click destination node for ghost path');
        var container = document.getElementById('preview-container');
        if (container) container.addEventListener('click', ghostPathDestinationHandler, { once: true });
    }

    function ghostPathDestinationHandler(e) {
        var nodeInfo = DiagramDOM.extractNodeId(e.target);
        if (!nodeInfo || nodeInfo.type === 'edge' || !ghostPathSource) {
            ghostPathSource = null;
            if (window.toast) toast('Ghost path cancelled');
            return;
        }
        if (nodeInfo.id === ghostPathSource) {
            ghostPathSource = null;
            if (window.toast) toast('Cannot create ghost path to same node');
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        var from = ghostPathSource;
        var to = nodeInfo.id;
        ghostPathSource = null;
        SmartBModal.prompt({
            title: 'Ghost Path: ' + from + ' → ' + to,
            placeholder: 'Reason (optional)',
            allowEmpty: true,
            onConfirm: function(label) {
                if (window.SmartBGhostPaths) SmartBGhostPaths.createGhostPath(from, to, label || undefined);
            },
        });
    }

    // ── Risk Level Helper ──

    function bUrl(path) { return (window.SmartBBaseUrl || '') + path; }

    function setRisk(nodeId, level) {
        SmartBModal.prompt({
            title: 'Risk: ' + level.charAt(0).toUpperCase() + level.slice(1),
            placeholder: 'Reason for ' + level + ' risk...',
            onConfirm: function(reason) {
                var file = window.SmartBFileTree ? SmartBFileTree.getCurrentFile() : null;
                if (!file) return;
                fetch(bUrl('/api/annotations/' + encodeURIComponent(file) + '/risk'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ nodeId: nodeId, level: level, reason: reason }),
                }).then(function(r) {
                    if (r.ok && window.toast) toast('Risk set: ' + level);
                    else if (!r.ok && window.toast) toast('Error setting risk');
                }).catch(function() {
                    if (window.toast) toast('Error setting risk');
                });
            },
        });
    }

    function removeRisk(nodeId) {
        var file = window.SmartBFileTree ? SmartBFileTree.getCurrentFile() : null;
        if (!file) return;
        fetch(bUrl('/api/annotations/' + encodeURIComponent(file) + '/risk'), {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nodeId: nodeId }),
        }).then(function(r) {
            if (r.ok && window.toast) toast('Risk removed');
            else if (!r.ok && window.toast) toast('Error removing risk');
        }).catch(function() {
            if (window.toast) toast('Error removing risk');
        });
    }

    // ── Submenu Helper ──

    function createSubmenuItem(label, className, handler) {
        var item = document.createElement('div');
        item.className = 'context-menu-item context-menu-submenu' + (className ? ' ' + className : '');
        item.textContent = label;
        item.addEventListener('click', function(e) {
            e.stopPropagation();
            closeContextMenu();
            handler();
        });
        return item;
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
            menu.appendChild(createMenuItem('Edit Text', '', function() {
                if (window.SmartBInlineEdit) {
                    if (window.SmartBInteraction) SmartBInteraction.transition('edit_action');
                    SmartBInlineEdit.open(nodeInfo.id);
                } else if (window.MmdEditor) {
                    MmdEditor.doEditNodeText(nodeInfo.id);
                }
            }));

            menu.appendChild(createMenuItem('Delete', 'danger', function() {
                if (window.MmdEditor) MmdEditor.doRemoveNode(nodeInfo.id);
            }));

            menu.appendChild(createMenuItem('Duplicate', '', function() {
                doDuplicate(nodeInfo.id);
            }));

            menu.appendChild(createSeparator());

            menu.appendChild(createMenuItem('Flag', '', function() {
                doFlag();
            }));

            menu.appendChild(createMenuItem('Toggle Breakpoint', '', function() {
                if (window.SmartBBreakpoints) SmartBBreakpoints.toggleBreakpoint(nodeInfo.id);
            }));

            menu.appendChild(createMenuItem('New Edge', '', function() {
                if (window.MmdEditor) MmdEditor.startConnectFrom(nodeInfo.id);
            }));

            menu.appendChild(createSeparator());

            menu.appendChild(createMenuItem('Ghost Path to...', '', function() {
                startGhostPathFlow(nodeInfo.id);
            }));

            // Risk level submenu items
            menu.appendChild(createSubmenuItem('Risk: High', 'risk-high', function() {
                setRisk(nodeInfo.id, 'high');
            }));
            menu.appendChild(createSubmenuItem('Risk: Medium', 'risk-medium', function() {
                setRisk(nodeInfo.id, 'medium');
            }));
            menu.appendChild(createSubmenuItem('Risk: Low', 'risk-low', function() {
                setRisk(nodeInfo.id, 'low');
            }));
            menu.appendChild(createSubmenuItem('Remove Risk', '', function() {
                removeRisk(nodeInfo.id);
            }));

        } else if (nodeInfo.type === 'edge') {
            // Edge context menu: 2 items
            menu.appendChild(createMenuItem('Delete', 'danger', function() {
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

            menu.appendChild(createMenuItem('Flag', '', function() {
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
