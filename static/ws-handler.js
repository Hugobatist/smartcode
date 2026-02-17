/**
 * SmartB WebSocket Handler -- Processes incoming WebSocket messages.
 * Extracted from app-init.js. Exposed as window.SmartBWsHandler.
 * Dependencies: file-tree.js, editor-panel.js, annotations.js,
 *               custom-renderer.js, breakpoints.js, ghost-paths.js,
 *               heatmap.js, session-player.js
 */
(function() {
    'use strict';

    /**
     * Handle incoming WebSocket messages.
     * @param {object} msg - Parsed WebSocket message
     * @param {object} ctx - Context object with:
     *   - getRendererType: function returning current renderer type
     *   - setRendererType: function(type) to update renderer type
     *   - selectRendererType: function(diagramType) to auto-select renderer
     *   - updateRendererIndicator: function to update UI indicator
     *   - renderWithType: async function(text) to render diagram
     */
    function handleMessage(msg, ctx) {
        switch (msg.type) {
            case 'graph:update':
                if (msg.file === SmartBFileTree.getCurrentFile()) {
                    ctx.setRendererType(ctx.selectRendererType(msg.graph.diagramType));
                    if (ctx.getRendererType() === 'custom') {
                        SmartBCustomRenderer.render(msg.graph).catch(function(e) {
                            console.warn('Custom renderer failed on graph:update, keeping current render:', e.message);
                        });
                    }
                    ctx.updateRendererIndicator();
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
                            SmartBAnnotations.getState().breakpoints = incoming.breakpoints;
                            SmartBAnnotations.getState().risks = incoming.risks;
                            if (window.SmartBBreakpoints) SmartBBreakpoints.updateBreakpoints(incoming.breakpoints);
                            if (window.SmartBHeatmap) SmartBHeatmap.updateRisks(incoming.risks);
                            SmartBAnnotations.renderPanel();
                            SmartBAnnotations.updateBadge();
                        }
                        SmartBFileTree.setLastContent(finalText);
                        document.getElementById('editor').value = finalText;
                        if (ctx.getRendererType() !== 'custom') {
                            ctx.renderWithType(finalText);
                        }
                    }
                }
                break;
            case 'breakpoint:hit':
                if (window.SmartBBreakpoints) SmartBBreakpoints.showNotification(msg.nodeId);
                break;
            case 'breakpoint:continue':
                if (window.SmartBBreakpoints) SmartBBreakpoints.hideNotification();
                break;
            case 'ghost:update':
                if (window.SmartBGhostPaths) SmartBGhostPaths.updateGhostPaths(msg.file, msg.ghostPaths);
                break;
            case 'heatmap:update':
                if (window.SmartBHeatmap) SmartBHeatmap.updateVisitCounts(msg.data);
                break;
            case 'session:event':
                if (window.SmartBSessionPlayer) SmartBSessionPlayer.handleSessionEvent(msg.sessionId, msg.event);
                break;
            case 'file:added':
            case 'file:removed':
            case 'tree:updated':
                SmartBFileTree.refreshFileList();
                break;
        }
    }

    function handleStatus(status) {
        var dot = document.getElementById('statusDot');
        var statusText = document.getElementById('statusText');
        switch (status) {
            case 'connected':
                dot.className = 'status-dot';
                statusText.textContent = 'Servidor Local';
                statusText.title = 'Conectado ao servidor SmartB via WebSocket.';
                break;
            case 'disconnected':
                dot.className = 'status-dot paused';
                statusText.textContent = 'Desconectado';
                statusText.title = 'Sem conexao com o servidor SmartB. Execute: smartb serve';
                break;
            case 'reconnecting':
                dot.className = 'status-dot paused';
                statusText.textContent = 'Reconectando...';
                statusText.title = 'Tentando reconectar ao servidor SmartB...';
                break;
        }
    }

    window.SmartBWsHandler = {
        handleMessage: handleMessage,
        handleStatus: handleStatus,
    };
})();
