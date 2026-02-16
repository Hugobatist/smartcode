/**
 * SmartB App Init -- bootstrap, WebSocket setup, keyboard shortcuts,
 * toast notifications, help overlay, drag & drop, module initialization.
 * Extracted from live.html (Phase 9 Plan 03).
 *
 * Dependencies: All other modules must be loaded before this script.
 *   - event-bus.js, diagram-dom.js, renderer.js, pan-zoom.js, export.js
 *   - file-tree.js, editor-panel.js, ws-client.js
 *   - collapse-ui.js, annotations.js, diagram-editor.js, search.js
 *
 * This is the last script loaded -- it wires everything together.
 */
(function() {
    'use strict';

    // ── Renderer type from query params ──
    var params = new URLSearchParams(window.location.search);
    var paramRenderer = params.get('renderer'); // null if not set
    var effectiveRendererType = paramRenderer || 'mermaid'; // updated dynamically

    // ── Auto-select renderer based on diagram type ──
    function selectRendererType(diagramType) {
        // User override via ?renderer= always wins
        if (paramRenderer) return paramRenderer;
        // Auto-select: custom for flowchart/graph, mermaid for everything else
        if (diagramType === 'flowchart' || diagramType === 'graph') return 'custom';
        return 'mermaid';
    }

    // ── Dynamic renderer indicator in status bar ──
    function updateRendererIndicator() {
        var existing = document.querySelector('.renderer-indicator');
        if (existing) existing.remove();
        if (effectiveRendererType === 'custom') {
            var indicator = document.createElement('span');
            indicator.className = 'renderer-indicator';
            indicator.style.cssText = 'font-size:10px;color:#6366f1;margin-left:8px;font-weight:600;';
            indicator.textContent = 'CUSTOM';
            var statusEl = document.querySelector('.topbar .status');
            if (statusEl) statusEl.appendChild(indicator);
        }
    }

    // ── Detect diagram type from mermaid source ──
    function detectDiagramType(text) {
        if (!text) return null;
        var first = text.trim().split(/\s/)[0].toLowerCase();
        if (first === 'flowchart' || first === 'graph') return first;
        return first; // sequence, classDiagram, etc.
    }

    // ── Render with type (custom or mermaid) ──
    async function renderWithType(text) {
        // Auto-detect renderer from diagram source on every render
        var diagramType = detectDiagramType(text);
        if (diagramType) {
            effectiveRendererType = selectRendererType(diagramType);
            updateRendererIndicator();
        }

        if (effectiveRendererType === 'custom') {
            try {
                var currentFile = SmartBFileTree.getCurrentFile();
                // Render Mermaid first for immediate visual feedback
                await SmartBRenderer.render(text);
                // Then upgrade to custom renderer once server has processed the file.
                // The WebSocket graph:update will also re-render, but fetching here
                // avoids a visible flash on file navigation (non-edit scenarios).
                await SmartBCustomRenderer.fetchAndRender(currentFile);
            } catch (e) {
                // Custom failed — Mermaid already rendered above, so user sees content
                console.warn('Custom renderer failed, keeping Mermaid render:', e.message);
            }
        } else {
            await SmartBRenderer.render(text);
        }
    }

    // Override global render so file-tree and other modules use smart routing
    window.render = renderWithType;

    // ── Toast ──
    function toast(msg) {
        var el = document.getElementById('toast');
        el.textContent = msg;
        el.classList.add('show');
        setTimeout(function() { el.classList.remove('show'); }, 2000);
    }

    // ── Help ──
    function showHelp() {
        document.getElementById('helpOverlay').classList.toggle('show');
    }

    // ── Keyboard shortcuts ──
    document.addEventListener('keydown', function(e) {
        var editor = document.getElementById('editor');
        if (e.target === editor) return;
        if (e.target.closest('.flag-popover')) return;
        if (e.target.closest('.search-bar')) return;
        if (e.key === 'f' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); SmartBSearch.open(); return; }
        if (e.key === 'f' && !e.ctrlKey && !e.metaKey) { SmartBAnnotations.toggleFlagMode(); return; }
        if (e.key === 'n' && !e.ctrlKey && !e.metaKey) { MmdEditor.toggleAddNode(); return; }
        if (e.key === 'a' && !e.ctrlKey && !e.metaKey) { MmdEditor.toggleAddEdge(); return; }
        if (e.key === 'Escape') { SmartBAnnotations.closePopover(); MmdEditor.closeEditorPopover(); MmdEditor.setMode(null); SmartBSearch.close(); }
        if (e.key === '?' && !e.ctrlKey) showHelp();
        if (e.key === 'e' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            document.getElementById('toggleEditor').click();
        }
        if (e.key === 'b' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            document.getElementById('toggleSidebar').click();
        }
        if ((e.key === '=' || e.key === '+') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); zoomIn(); }
        if (e.key === '-' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); zoomOut(); }
        if (e.key === '0' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); zoomFit(); }
    });

    document.addEventListener('keydown', function(e) {
        if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            saveCurrentFile();
        }
    });

    // ── Init Hooks for annotations, editor, search, collapse ──
    var _initHooks = {
        getEditor: function() { return document.getElementById('editor'); },
        getCurrentFile: function() { return SmartBFileTree.getCurrentFile(); },
        getLastContent: function() { return SmartBFileTree.getLastContent(); },
        setLastContent: function(v) { SmartBFileTree.setLastContent(v); },
        saveFile: function() { SmartBFileTree.saveCurrentFile(); },
        renderDiagram: renderWithType,
        getPan: function() { return SmartBPanZoom.getPan(); },
        setPan: function(px, py) { SmartBPanZoom.setPan(px, py); },
    };

    SmartBAnnotations.init(_initHooks);
    MmdEditor.init(_initHooks);
    SmartBSearch.init(_initHooks);
    if (window.SmartBSelection) SmartBSelection.init();

    // ── Init Collapse UI ──
    if (window.SmartBCollapseUI) {
        SmartBCollapseUI.init({
            onToggle: async function(collapsedIds) {
                try {
                    var params = new URLSearchParams();
                    if (collapsedIds.length > 0) {
                        params.set('collapsed', JSON.stringify(collapsedIds));
                    }
                    var currentFile = SmartBFileTree.getCurrentFile();
                    var url = '/api/diagrams/' + encodeURIComponent(currentFile) + '?' + params.toString();
                    var resp = await fetch(url);
                    if (!resp.ok) return;
                    var data = await resp.json();
                    if (data.collapse) {
                        SmartBCollapseUI.setConfig(data.collapse.config);
                        SmartBCollapseUI.setAutoCollapsed(data.collapse.autoCollapsed || []);
                    }
                    if (data.mermaidContent) {
                        await renderWithType(data.mermaidContent);
                    }
                } catch (e) {}
            }
        });

        SmartBCollapseUI.initFocusMode({
            onFocusChange: async function(event) {
                try {
                    var currentFile = SmartBFileTree.getCurrentFile();
                    if (event.action === 'focus') {
                        var params = new URLSearchParams({ focus: event.nodeId });
                        var collapsed = SmartBCollapseUI.getCollapsed();
                        if (collapsed.length > 0) {
                            params.set('collapsed', JSON.stringify(collapsed));
                        }
                        var resp = await fetch('/api/diagrams/' + encodeURIComponent(currentFile) + '?' + params.toString());
                        if (!resp.ok) return;
                        var data = await resp.json();
                        if (data.collapse) {
                            SmartBCollapseUI.setBreadcrumbs(data.collapse.breadcrumbs, data.collapse.focusedSubgraph);
                            SmartBCollapseUI.setAutoCollapsed(data.collapse.autoCollapsed || []);
                            if (data.collapse.manualCollapsed) {
                                SmartBCollapseUI.setCollapsed(data.collapse.manualCollapsed);
                            }
                        }
                        if (data.mermaidContent) {
                            await renderWithType(data.mermaidContent);
                            document.getElementById('preview').classList.add('diagram-focus-mode');
                        }
                    } else if (event.action === 'navigate') {
                        var navParams = new URLSearchParams({ breadcrumb: event.breadcrumbId });
                        var navResp = await fetch('/api/diagrams/' + encodeURIComponent(currentFile) + '?' + navParams.toString());
                        if (!navResp.ok) return;
                        var navData = await navResp.json();
                        if (navData.collapse) {
                            SmartBCollapseUI.setBreadcrumbs(navData.collapse.breadcrumbs, navData.collapse.focusedSubgraph);
                            SmartBCollapseUI.setAutoCollapsed(navData.collapse.autoCollapsed || []);
                        }
                        if (navData.mermaidContent) {
                            await renderWithType(navData.mermaidContent);
                        }
                    } else if (event.action === 'exit') {
                        var exitResp = await fetch('/api/diagrams/' + encodeURIComponent(currentFile));
                        if (!exitResp.ok) return;
                        var exitData = await exitResp.json();
                        SmartBCollapseUI.setBreadcrumbs([], null);
                        SmartBCollapseUI.setAutoCollapsed(exitData.collapse ? exitData.collapse.autoCollapsed || [] : []);
                        if (exitData.mermaidContent) {
                            await renderWithType(exitData.mermaidContent);
                            document.getElementById('preview').classList.remove('diagram-focus-mode');
                        }
                    }
                } catch (e) {}
            }
        });
    }

    // ── Bootstrap: load initial file, connect WebSocket ──
    (async function() {
        // Show hint briefly
        var hint = document.getElementById('fitHint');
        hint.classList.add('show');
        setTimeout(function() { hint.classList.remove('show'); }, 4000);

        var currentFile = SmartBFileTree.getCurrentFile();
        var editor = document.getElementById('editor');

        try {
            var resp = await fetch(currentFile);
            if (resp.ok) {
                var text = await resp.text();
                editor.value = text;
                SmartBFileTree.setLastContent(text);
                await renderWithType(text);
            }
        } catch (e) {}

        if (!SmartBFileTree.getLastContent() && editor.value.trim()) {
            await renderWithType(editor.value);
        }

        // Fetch diagram metadata for auto-renderer selection and collapse
        if (currentFile) {
            try {
                var apiResp = await fetch('/api/diagrams/' + encodeURIComponent(currentFile));
                if (apiResp.ok) {
                    var data = await apiResp.json();

                    // Auto-detect renderer type on initial load
                    if (data.validation && data.validation.diagramType) {
                        effectiveRendererType = selectRendererType(data.validation.diagramType);
                        if (effectiveRendererType === 'custom') {
                            await SmartBCustomRenderer.fetchAndRender(currentFile);
                        }
                        updateRendererIndicator();
                    }

                    // Collapse metadata for initial auto-collapse
                    if (window.SmartBCollapseUI && data.collapse) {
                        SmartBCollapseUI.setConfig(data.collapse.config);
                        if (data.collapse.autoCollapsed && data.collapse.autoCollapsed.length > 0) {
                            SmartBCollapseUI.setAutoCollapsed(data.collapse.autoCollapsed);
                            if (data.mermaidContent) await renderWithType(data.mermaidContent);
                        }
                    }
                }
            } catch (e) { /* keep Mermaid as fallback */ }
        }

        // WebSocket real-time sync
        var wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        var wsUrl = wsProtocol + '//' + location.host + '/ws';

        createReconnectingWebSocket(wsUrl, function(msg) {
            switch (msg.type) {
                case 'graph:update':
                    if (msg.file === SmartBFileTree.getCurrentFile()) {
                        // Update effective renderer type based on diagram type from server
                        effectiveRendererType = selectRendererType(msg.graph.diagramType);
                        if (effectiveRendererType === 'custom') {
                            SmartBCustomRenderer.render(msg.graph);
                        }
                        // If using Mermaid, ignore graph:update (file:changed handles it)
                        updateRendererIndicator();
                    }
                    break;
                case 'file:changed':
                    if (!SmartBEditorPanel.isAutoSync()) return;
                    if (msg.file === SmartBFileTree.getCurrentFile()) {
                        var wsText = msg.content;
                        if (wsText !== SmartBFileTree.getLastContent()) {
                            var finalText = wsText;
                            if (window.SmartBAnnotations && SmartBAnnotations.getState().flags.size > 0) {
                                finalText = SmartBAnnotations.mergeIncomingContent(wsText);
                            } else if (window.SmartBAnnotations) {
                                var incoming = SmartBAnnotations.parseAnnotations(wsText);
                                SmartBAnnotations.getState().flags = incoming.flags;
                                SmartBAnnotations.getState().statuses = incoming.statuses;
                                SmartBAnnotations.renderPanel();
                                SmartBAnnotations.updateBadge();
                            }
                            SmartBFileTree.setLastContent(finalText);
                            document.getElementById('editor').value = finalText;
                            // Only render via file:changed if NOT using custom renderer
                            // (custom renderer gets data from graph:update instead)
                            if (effectiveRendererType !== 'custom') {
                                renderWithType(finalText);
                            }
                        }
                    }
                    break;
                case 'file:added':
                case 'file:removed':
                case 'tree:updated':
                    SmartBFileTree.refreshFileList();
                    break;
            }
        }, function(status) {
            var dot = document.getElementById('statusDot');
            var statusText = document.getElementById('statusText');
            switch (status) {
                case 'connected':
                    dot.className = 'status-dot';
                    statusText.textContent = 'Connected';
                    break;
                case 'disconnected':
                    dot.className = 'status-dot paused';
                    statusText.textContent = 'Disconnected';
                    break;
                case 'reconnecting':
                    dot.className = 'status-dot paused';
                    statusText.textContent = 'Reconnecting...';
                    break;
            }
        });

        // Show CUSTOM indicator in status bar (dynamic, based on effectiveRendererType)
        updateRendererIndicator();
    })();

    SmartBFileTree.refreshFileList();

    // Re-fit on window resize
    window.addEventListener('resize', function() { zoomFit(); });

    // ── Drag & Drop .mmd files ──
    document.addEventListener('dragover', function(e) { e.preventDefault(); });
    document.addEventListener('drop', async function(e) {
        e.preventDefault();
        var file = e.dataTransfer.files[0];
        if (!file || !file.name.endsWith('.mmd')) { toast('Apenas arquivos .mmd'); return; }
        var text = await file.text();
        var editor = document.getElementById('editor');
        editor.value = text;
        SmartBFileTree.setLastContent(text);
        SmartBFileTree.setCurrentFile(file.name);
        document.getElementById('currentFileName').textContent = file.name;
        SmartBFileTree.refreshFileList();
        renderWithType(text);
    });

    // ── Public API ──
    window.SmartBApp = {
        toast: toast,
        showHelp: showHelp,
        rendererType: effectiveRendererType, // backward compat
        getRendererType: function() { return effectiveRendererType; },
    };
    window.toast = toast;
    window.showHelp = showHelp;
})();
