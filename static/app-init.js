/**
 * SmartB App Init -- bootstrap, WebSocket setup, keyboard shortcuts,
 * toast notifications, help overlay, drag & drop, module initialization.
 * Extracted from live.html (Phase 9 Plan 03).
 *
 * Dependencies: All other modules must be loaded before this script.
 *   - event-bus.js, diagram-dom.js, renderer.js, pan-zoom.js, export.js
 *   - file-tree.js, editor-panel.js, ws-client.js
 *   - collapse-ui.js, annotations.js, diagram-editor.js, search.js
 *   - ws-handler.js
 *
 * This is the last script loaded -- it wires everything together.
 */
(function() {
    'use strict';

    // ── CSS Token Reader ──
    function getToken(name) {
        return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    }
    window.getToken = getToken;

    // ── Renderer type from query params ──
    var params = new URLSearchParams(window.location.search);
    var paramRenderer = params.get('renderer'); // null if not set
    var effectiveRendererType = paramRenderer || 'mermaid'; // updated dynamically

    // ── Auto-select renderer based on diagram type ──
    function selectRendererType(diagramType) {
        if (paramRenderer) return paramRenderer;
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
            indicator.style.cssText = 'font-size:10px;color:#3b82f6;margin-left:8px;font-weight:600;';
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
        return first;
    }

    // ── Render with type (custom or mermaid) ──
    async function renderWithType(text) {
        var diagramType = detectDiagramType(text);
        if (diagramType) {
            effectiveRendererType = selectRendererType(diagramType);
            updateRendererIndicator();
        }

        if (effectiveRendererType === 'custom') {
            try {
                var currentFile = SmartBFileTree.getCurrentFile();
                await SmartBCustomRenderer.fetchAndRender(currentFile);
            } catch (e) {
                console.warn('Custom renderer failed, falling back to Mermaid:', e.message);
                await SmartBRenderer.render(text);
            }
        } else {
            await SmartBRenderer.render(text);
        }
    }

    window.render = renderWithType;

    // ── Toast ──
    function toast(msg) {
        var el = document.getElementById('toast');
        if (!el) return;
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
        if (e.target.getAttribute && e.target.getAttribute('contenteditable') === 'true') return;
        if (e.target.closest('.flag-popover')) return;
        if (e.target.closest('.search-bar')) return;
        if (e.key === 'f' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); SmartBSearch.open(); return; }
        if (e.key === 'f' && !e.ctrlKey && !e.metaKey) {
            if (window.SmartBInteraction && SmartBInteraction.isBlocking()) return;
            SmartBAnnotations.toggleFlagMode();
            if (window.SmartBInteraction) SmartBInteraction.forceState(SmartBAnnotations.getState().flagMode ? 'flagging' : 'idle');
            return;
        }
        if (e.key === 'n' && !e.ctrlKey && !e.metaKey) {
            if (window.SmartBInteraction && SmartBInteraction.isBlocking()) return;
            MmdEditor.toggleAddNode();
            if (window.SmartBInteraction) SmartBInteraction.forceState(MmdEditor.getState().mode === 'addNode' ? 'add-node' : 'idle');
            return;
        }
        if (e.key === 'a' && !e.ctrlKey && !e.metaKey) {
            if (window.SmartBInteraction && SmartBInteraction.isBlocking()) return;
            MmdEditor.toggleAddEdge();
            if (window.SmartBInteraction) SmartBInteraction.forceState(MmdEditor.getState().mode === 'addEdge' ? 'add-edge' : 'idle');
            return;
        }
        if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey) && e.shiftKey) { e.preventDefault(); MmdEditor.redo(); return; }
        if (e.key === 'y' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); MmdEditor.redo(); return; }
        if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) { e.preventDefault(); MmdEditor.undo(); return; }
        if (e.key === 'Escape') {
            SmartBAnnotations.closePopover(); MmdEditor.closeEditorPopover(); MmdEditor.setMode(null); SmartBSearch.close();
            if (window.SmartBSelection) SmartBSelection.deselectAll();
            if (window.SmartBContextMenu) SmartBContextMenu.close();
            if (window.SmartBInlineEdit) SmartBInlineEdit.cancel();
            if (window.SmartBInteraction && SmartBInteraction.getState() !== 'idle') {
                SmartBInteraction.forceState('idle');
            }
        }
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
        if (e.key === 'c' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
            if (window.SmartBClipboard && SmartBClipboard.copy()) {
                e.preventDefault();
                if (window.toast) toast('Node copied');
            }
            return;
        }
        if (e.key === 'v' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
            if (window.SmartBClipboard && SmartBClipboard.hasContent()) {
                e.preventDefault();
                SmartBClipboard.paste();
                if (window.toast) toast('Node pasted');
            }
            return;
        }
        if (e.key === 'd' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            if (window.SmartBClipboard && SmartBClipboard.duplicate()) {
                if (window.toast) toast('Node duplicated');
            }
            return;
        }
        if (e.key === ' ' && window.SmartBSessionPlayer && SmartBSessionPlayer.isVisible()) {
            e.preventDefault();
            SmartBSessionPlayer.isPlaying() ? SmartBSessionPlayer.pause() : SmartBSessionPlayer.play();
            return;
        }
        if (e.key === 'ArrowLeft' && window.SmartBSessionPlayer && SmartBSessionPlayer.isVisible()) {
            e.preventDefault(); SmartBSessionPlayer.seekTo(SmartBSessionPlayer.getIndex() - 1); return;
        }
        if (e.key === 'ArrowRight' && window.SmartBSessionPlayer && SmartBSessionPlayer.isVisible()) {
            e.preventDefault(); SmartBSessionPlayer.seekTo(SmartBSessionPlayer.getIndex() + 1); return;
        }
        if (e.key === 'g' && !e.ctrlKey && !e.metaKey && !e.altKey) {
            if (window.SmartBGhostPaths) SmartBGhostPaths.toggle();
            return;
        }
        if (e.key === 'h' && !e.ctrlKey && !e.metaKey && !e.altKey) {
            if (window.SmartBHeatmap) SmartBHeatmap.toggle();
            return;
        }
        if (e.key === 'b' && !e.ctrlKey && !e.metaKey && !e.altKey) {
            if (window.SmartBBreakpoints && window.SmartBSelection) {
                var sel = SmartBSelection.getSelected();
                if (sel && sel.type === 'node') {
                    SmartBBreakpoints.toggleBreakpoint(sel.id);
                }
            }
        }
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

    // ── Set sidebar action button icons (safe: SmartBIcons are static SVG strings) ──
    var _nf = document.getElementById('btnNewFolder');
    if (_nf) _nf.innerHTML = SmartBIcons.folder;
    var _nd = document.getElementById('btnNewFile');
    if (_nd) _nd.innerHTML = SmartBIcons.file;
    var _sv = document.getElementById('btnSaveFile');
    if (_sv) _sv.innerHTML = SmartBIcons.save;

    // ── Inject toolbar icons from data-icon attributes ──
    // Safe: SmartBIcons contains only static SVG strings from icons.js (trusted source)
    document.querySelectorAll('.toolbar-icon[data-icon]').forEach(function(span) {
        var iconName = span.getAttribute('data-icon');
        if (iconName && SmartBIcons[iconName]) {
            span.innerHTML = SmartBIcons[iconName];
        }
    });

    SmartBAnnotations.init(_initHooks);
    MmdEditor.init(_initHooks);
    SmartBSearch.init(_initHooks);

    // ── Init Phase 13: Canvas Interaction Modules ──
    if (window.SmartBSelection) SmartBSelection.init();
    if (window.SmartBNodeDrag) SmartBNodeDrag.init();
    if (window.SmartBContextMenu) SmartBContextMenu.init();
    if (window.SmartBInlineEdit) SmartBInlineEdit.init();

    // ── Init Phase 15: Breakpoints & Ghost Paths ──
    if (window.SmartBBreakpoints) SmartBBreakpoints.init();
    if (window.SmartBGhostPaths) SmartBGhostPaths.init();

    // ── Init Phase 16: Heatmap & Session Player ──
    if (window.SmartBHeatmap) SmartBHeatmap.init();
    if (window.SmartBInteractionTracker) SmartBInteractionTracker.init();
    if (window.SmartBSessionPlayer) SmartBSessionPlayer.init();

    // ── Init MCP Sessions view ──
    if (window.SmartBMcpSessions) SmartBMcpSessions.init();

    // ── Init Collapse UI ──
    if (window.SmartBCollapseUI) {
        SmartBCollapseUI.init({
            onToggle: async function(collapsedIds) {
                try {
                    var toggleParams = new URLSearchParams();
                    if (collapsedIds.length > 0) {
                        toggleParams.set('collapsed', JSON.stringify(collapsedIds));
                    }
                    var currentFile = SmartBFileTree.getCurrentFile();
                    var url = baseUrl('/api/diagrams/' + encodeURIComponent(currentFile) + '?' + toggleParams.toString());
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
                } catch (e) { console.warn('[SmartB] Collapse toggle error:', e); }
            }
        });

        SmartBCollapseUI.initFocusMode({
            onFocusChange: async function(event) {
                try {
                    var currentFile = SmartBFileTree.getCurrentFile();
                    if (event.action === 'focus') {
                        var focusParams = new URLSearchParams({ focus: event.nodeId });
                        var collapsed = SmartBCollapseUI.getCollapsed();
                        if (collapsed.length > 0) {
                            focusParams.set('collapsed', JSON.stringify(collapsed));
                        }
                        var resp = await fetch(baseUrl('/api/diagrams/' + encodeURIComponent(currentFile) + '?' + focusParams.toString()));
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
                        var navResp = await fetch(baseUrl('/api/diagrams/' + encodeURIComponent(currentFile) + '?' + navParams.toString()));
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
                        var exitResp = await fetch(baseUrl('/api/diagrams/' + encodeURIComponent(currentFile)));
                        if (!exitResp.ok) return;
                        var exitData = await exitResp.json();
                        SmartBCollapseUI.setBreadcrumbs([], null);
                        SmartBCollapseUI.setAutoCollapsed(exitData.collapse ? exitData.collapse.autoCollapsed || [] : []);
                        if (exitData.mermaidContent) {
                            await renderWithType(exitData.mermaidContent);
                            document.getElementById('preview').classList.remove('diagram-focus-mode');
                        }
                    }
                } catch (e) { console.warn('[SmartB] Focus mode error:', e); }
            }
        });
    }

    // ── Helper: resolve URL with workspace base ──
    function baseUrl(path) {
        return (window.SmartBBaseUrl || '') + path;
    }
    window.SmartBUrl = baseUrl;

    // ── WebSocket context for ws-handler ──
    var wsCtx = {
        getRendererType: function() { return effectiveRendererType; },
        setRendererType: function(type) { effectiveRendererType = type; },
        selectRendererType: selectRendererType,
        updateRendererIndicator: updateRendererIndicator,
        renderWithType: renderWithType,
    };

    function buildWsUrl(baseUrlStr) {
        var wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        if (baseUrlStr) {
            var host = baseUrlStr.replace(/^https?:\/\//, '');
            return wsProtocol + '//' + host + '/ws';
        }
        return wsProtocol + '//' + location.host + '/ws';
    }

    // ── Active WS connection ──
    var activeWs = null;

    function reconnectWebSocket(newBaseUrl) {
        if (activeWs) activeWs.close();
        var wsUrl = buildWsUrl(newBaseUrl);
        activeWs = createReconnectingWebSocket(wsUrl,
            function(msg) { SmartBWsHandler.handleMessage(msg, wsCtx); },
            function(status) { SmartBWsHandler.handleStatus(status); }
        );
    }

    window.SmartBWsReconnect = reconnectWebSocket;

    // ── Bootstrap: load initial file, connect WebSocket ──
    (async function() {
        var hint = document.getElementById('fitHint');
        hint.classList.add('show');
        setTimeout(function() { hint.classList.remove('show'); }, 4000);

        var currentFile = SmartBFileTree.getCurrentFile();
        var editor = document.getElementById('editor');

        try {
            var resp = await fetch(baseUrl('/' + currentFile));
            if (resp.ok) {
                var text = await resp.text();
                editor.value = text;
                SmartBFileTree.setLastContent(text);
                await renderWithType(text);
            }
        } catch (e) { console.warn('[SmartB] Initial file load error:', e); }

        if (!SmartBFileTree.getLastContent() && editor.value.trim()) {
            await renderWithType(editor.value);
        }

        if (currentFile) {
            try {
                var apiResp = await fetch(baseUrl('/api/diagrams/' + encodeURIComponent(currentFile)));
                if (apiResp.ok) {
                    var data = await apiResp.json();
                    if (data.validation && data.validation.diagramType) {
                        effectiveRendererType = selectRendererType(data.validation.diagramType);
                        if (effectiveRendererType === 'custom') {
                            await SmartBCustomRenderer.fetchAndRender(currentFile);
                        }
                        updateRendererIndicator();
                    }
                    if (window.SmartBCollapseUI && data.collapse) {
                        SmartBCollapseUI.setConfig(data.collapse.config);
                        if (data.collapse.autoCollapsed && data.collapse.autoCollapsed.length > 0) {
                            SmartBCollapseUI.setAutoCollapsed(data.collapse.autoCollapsed);
                            if (data.mermaidContent) await renderWithType(data.mermaidContent);
                        }
                    }
                }
            } catch (e) { /* keep Mermaid as fallback */ }

            if (window.SmartBGhostPaths) {
                try {
                    var gpResp = await fetch(baseUrl('/api/ghost-paths/' + encodeURIComponent(currentFile)));
                    if (gpResp.ok) {
                        var gpData = await gpResp.json();
                        SmartBGhostPaths.updateGhostPaths(currentFile, gpData.ghostPaths || []);
                    }
                } catch (e) {}
            }

            if (window.SmartBHeatmap) {
                fetch(baseUrl('/api/heatmap/' + encodeURIComponent(currentFile)))
                    .then(function(r) { return r.ok ? r.json() : null; })
                    .then(function(data) { if (data) SmartBHeatmap.updateVisitCounts(data); })
                    .catch(function() {});
            }

            if (window.SmartBSessionPlayer) SmartBSessionPlayer.fetchSessionList(currentFile);
        }

        // WebSocket real-time sync
        var wsUrl = buildWsUrl(window.SmartBBaseUrl);
        activeWs = createReconnectingWebSocket(wsUrl,
            function(msg) { SmartBWsHandler.handleMessage(msg, wsCtx); },
            function(status) { SmartBWsHandler.handleStatus(status); }
        );

        updateRendererIndicator();
    })();

    SmartBFileTree.refreshFileList();

    var resizeTimer = null;
    window.addEventListener('resize', function() {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function() { zoomFit(); }, 150);
    });

    // ── Drag & Drop .mmd files ──
    document.addEventListener('dragover', function(e) { e.preventDefault(); });
    document.addEventListener('drop', async function(e) {
        e.preventDefault();
        var file = e.dataTransfer.files[0];
        if (!file || !file.name.endsWith('.mmd')) { toast('Only .mmd files'); return; }
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
        get rendererType() { return effectiveRendererType; },
        getRendererType: function() { return effectiveRendererType; },
    };
    window.toast = toast;
    window.showHelp = showHelp;
})();
