/**
 * SmartB Diagrams — Visual Diagram Editor
 * Manipulates .mmd content: add/remove/edit nodes and edges.
 * Exposed as window.MmdEditor
 *
 * Dependencies: diagram-dom.js (DiagramDOM), event-bus.js (SmartBEventBus)
 */
(function () {
    'use strict';

    // ── .mmd Content Manipulation ──

    /** Find insertion point: before first `style` line, or before annotations, or at end */
    function findInsertionLine(lines) {
        for (var i = 0; i < lines.length; i++) {
            var t = lines[i].trim();
            if (t.startsWith('style ') || t.startsWith('%% ---')) return i;
        }
        return lines.length;
    }

    /** Add a node definition to .mmd content */
    function addNode(content, nodeId, label) {
        var lines = content.split('\n');
        var idx = findInsertionLine(lines);
        var newLine = '    ' + nodeId + '["' + label + '"]';
        lines.splice(idx, 0, '', newLine);
        return lines.join('\n');
    }

    /** Add an edge between two nodes */
    function addEdge(content, fromId, toId, label) {
        var lines = content.split('\n');
        var idx = findInsertionLine(lines);
        var edgeLine = label
            ? '    ' + fromId + ' -->|"' + label + '"| ' + toId
            : '    ' + fromId + ' --> ' + toId;
        lines.splice(idx, 0, edgeLine);
        return lines.join('\n');
    }

    /** Remove a node and all its edges/styles from .mmd content */
    function removeNode(content, nodeId) {
        var lines = content.split('\n');
        var escaped = nodeId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Match: node definitions, edges referencing it, style directives
        var nodeDefRe = new RegExp('^\\s*' + escaped + '[\\s\\[\\(\\{\\>"]');
        var edgeFromRe = new RegExp('\\b' + escaped + '\\s*(-->|---|-.->|==>)');
        var edgeToRe = new RegExp('(-->|---|-.->|==>)\\s*(\\|[^|]*\\|\\s*)?' + escaped + '\\b');
        var styleRe = new RegExp('^\\s*style\\s+' + escaped + '\\b');

        var result = lines.filter(function(line) {
            var t = line.trim();
            if (!t) return true;
            if (nodeDefRe.test(t)) return false;
            if (edgeFromRe.test(t)) return false;
            if (edgeToRe.test(t)) return false;
            if (styleRe.test(t)) return false;
            return true;
        });
        return result.join('\n');
    }

    /** Remove a specific edge line (from --> to) */
    function removeEdge(content, fromId, toId) {
        var lines = content.split('\n');
        var escFrom = fromId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        var escTo = toId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        var re = new RegExp('\\b' + escFrom + '\\s*(-->|---|-.->|==>)(\\s*\\|[^|]*\\|)?\\s*' + escTo + '\\b');
        var result = lines.filter(function(line) { return !re.test(line.trim()); });
        return result.join('\n');
    }

    /** Edit a node's label text */
    function editNodeText(content, nodeId, newText) {
        var lines = content.split('\n');
        var escaped = nodeId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Match patterns: ID["text"], ID[text], ID("text"), ID(text), ID{"text"}, etc
        var re = new RegExp('(' + escaped + '\\s*[\\[\\(\\{\\>]+\\"?)([^"\\]\\)\\}]*?)(\\"?[\\]\\)\\}]+)');
        for (var i = 0; i < lines.length; i++) {
            if (re.test(lines[i])) {
                lines[i] = lines[i].replace(re, '$1' + newText + '$3');
                break;
            }
        }
        return lines.join('\n');
    }

    /** Extract current label text for a node */
    function getNodeText(content, nodeId) {
        var escaped = nodeId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        var re = new RegExp(escaped + '\\s*[\\[\\(\\{\\>]+"?([^"\\]\\)\\}]*)"?[\\]\\)\\}]+');
        var m = content.match(re);
        return m ? m[1] : nodeId;
    }

    /** Parse edge info from an SVG edge ID like "L-A-B-0" */
    function parseEdgeId(edgeId) {
        // Edge IDs: L-SOURCE-TARGET-INDEX or L-SOURCE-TARGET
        var m = edgeId.match(/^L-(.+)-(\d+)$/);
        if (!m) return null;
        // The middle part is SOURCE-TARGET, need to split intelligently
        var middle = m[1];
        // Try known node IDs to split
        return { raw: middle };
    }

    /** Find edge source and target from SVG edge element */
    function findEdgeEndpoints(edgeId, content) {
        var lines = content.split('\n');
        var edgePatterns = [];
        for (var i = 0; i < lines.length; i++) {
            var m = lines[i].trim().match(/^(\S+)\s*(-->|---|-.->|==>)(\s*\|[^|]*\|)?\s*(\S+)/);
            if (m) {
                var from = m[1].replace(/[\["'\(\{].*$/, '');
                var to = m[4].replace(/[\["'\(\{].*$/, '');
                edgePatterns.push({ from: from, to: to, line: lines[i].trim() });
            }
        }
        return edgePatterns;
    }

    /** Get all node IDs from content */
    function getAllNodeIds(content) {
        var ids = new Set();
        var lines = content.split('\n');
        var reserved = ['subgraph', 'style', 'class', 'click', 'flowchart', 'graph', 'end'];
        for (var i = 0; i < lines.length; i++) {
            var t = lines[i].trim();
            // Node definitions: ID["text"] or ID[text] etc
            var defMatch = t.match(/^\s*([A-Za-z_]\w*)\s*[\[\(\{>]/);
            if (defMatch && reserved.indexOf(defMatch[1]) === -1) {
                ids.add(defMatch[1]);
            }
            // Nodes in edges
            var edgeMatch = t.match(/^\s*([A-Za-z_]\w*)\s*(-->|---|-.->|==>)/);
            if (edgeMatch) ids.add(edgeMatch[1]);
            var edgeTo = t.match(/(-->|---|-.->|==>)\s*(?:\|[^|]*\|\s*)?([A-Za-z_]\w*)/);
            if (edgeTo) ids.add(edgeTo[2]);
        }
        return Array.from(ids);
    }

    /** Generate a unique node ID */
    function generateNodeId(content) {
        var existing = getAllNodeIds(content);
        var i = 1;
        while (existing.indexOf('N' + i) !== -1) i++;
        return 'N' + i;
    }

    // ── Visual Editing State ──

    var editorState = {
        mode: null,         // null | 'addNode' | 'addEdge'
        edgeSource: null,   // node ID when in addEdge and source is selected
        pendingAction: null, // { type: 'connectFrom'|'connectTo', nodeId }
    };

    var editorHooks = {
        getEditor: function() { return document.getElementById('editor'); },
        getLastContent: function() { return window.lastContent || ''; },
        setLastContent: function(v) { window.lastContent = v; },
        saveFile: null,
        renderDiagram: null,
    };

    // ── Mode Management ──

    function setMode(mode) {
        editorState.mode = mode;
        editorState.edgeSource = null;
        document.body.classList.remove('mode-addNode', 'mode-addEdge');
        if (mode) document.body.classList.add('mode-' + mode);

        // Update button states
        var btnNode = document.getElementById('btnAddNode');
        var btnEdge = document.getElementById('btnAddEdge');
        if (btnNode) btnNode.classList.toggle('active', mode === 'addNode');
        if (btnEdge) btnEdge.classList.toggle('active', mode === 'addEdge');

        // Disable flag mode if entering edit mode
        if (mode && window.SmartBAnnotations) {
            var s = SmartBAnnotations.getState();
            if (s.flagMode) SmartBAnnotations.toggleFlagMode();
        }

        if (window.toast) {
            var msgs = {
                addNode: 'Modo Nodo — clique no espaco vazio do diagrama',
                addEdge: 'Modo Seta — clique no nodo de ORIGEM',
            };
            window.toast(msgs[mode] || 'Modo edicao desativado');
        }
    }

    function toggleAddNode() { setMode(editorState.mode === 'addNode' ? null : 'addNode'); }
    function toggleAddEdge() { setMode(editorState.mode === 'addEdge' ? null : 'addEdge'); }

    // ── Click Handlers (uses DiagramDOM.extractNodeId) ──

    function handleClick(e) {
        if (!editorState.mode) return;
        if (e.target.closest('.zoom-controls') || e.target.closest('.flag-popover') || e.target.closest('.editor-popover')) return;

        // Use DiagramDOM.extractNodeId instead of SmartBAnnotations.extractNodeId
        var nodeInfo = DiagramDOM.extractNodeId(e.target);

        if (editorState.mode === 'addNode') {
            if (nodeInfo) return; // Clicked an existing node, ignore
            e.preventDefault();
            e.stopPropagation();
            showAddNodePopover(e.clientX, e.clientY);
        }

        if (editorState.mode === 'addEdge') {
            if (!nodeInfo || nodeInfo.type === 'edge') return;
            e.preventDefault();
            e.stopPropagation();
            if (!editorState.edgeSource) {
                editorState.edgeSource = nodeInfo.id;
                DiagramDOM.highlightNode(nodeInfo.id, true);
                if (window.toast) window.toast('Origem: ' + nodeInfo.id + ' — agora clique no DESTINO');
            } else {
                var from = editorState.edgeSource;
                var to = nodeInfo.id;
                if (from === to) return;
                showAddEdgePopover(e.clientX, e.clientY, from, to);
            }
        }
    }

    // ── Popovers ──

    function closeEditorPopover() {
        var existing = document.querySelector('.editor-popover');
        if (existing) existing.remove();
    }

    function createPopover(x, y) {
        closeEditorPopover();
        var pop = document.createElement('div');
        pop.className = 'flag-popover editor-popover';
        pop.style.left = Math.min(x + 12, window.innerWidth - 360) + 'px';
        pop.style.top = Math.min(y - 20, window.innerHeight - 280) + 'px';
        document.body.appendChild(pop);

        setTimeout(function() {
            function outside(e) {
                if (pop.contains(e.target)) return;
                closeEditorPopover();
                document.removeEventListener('mousedown', outside);
            }
            document.addEventListener('mousedown', outside);
        }, 50);

        return pop;
    }

    function showAddNodePopover(clientX, clientY) {
        var editor = editorHooks.getEditor();
        var suggestedId = generateNodeId(editor.value);
        var pop = createPopover(clientX, clientY);

        // Build popover content using DOM methods
        var titleDiv = document.createElement('div');
        titleDiv.className = 'flag-popover-title';
        var titleSpan = document.createElement('span');
        titleSpan.textContent = 'Novo Nodo';
        titleDiv.appendChild(titleSpan);
        pop.appendChild(titleDiv);

        var idLabel = document.createElement('label');
        idLabel.style.cssText = 'font-size:11px;color:var(--text-dim);margin-bottom:2px;display:block';
        idLabel.textContent = 'ID (sem espacos)';
        pop.appendChild(idLabel);

        var idInput = document.createElement('input');
        idInput.className = 'ep-input';
        idInput.type = 'text';
        idInput.value = suggestedId;
        idInput.style.marginBottom = '8px';
        pop.appendChild(idInput);

        var labelLabel = document.createElement('label');
        labelLabel.style.cssText = 'font-size:11px;color:var(--text-dim);margin-bottom:2px;display:block';
        labelLabel.textContent = 'Texto';
        pop.appendChild(labelLabel);

        var labelInput = document.createElement('input');
        labelInput.className = 'ep-input ep-label';
        labelInput.type = 'text';
        labelInput.placeholder = 'Texto do nodo...';
        pop.appendChild(labelInput);

        var actionsDiv = document.createElement('div');
        actionsDiv.className = 'flag-popover-actions';
        actionsDiv.style.marginTop = '10px';

        var btnCancel = document.createElement('button');
        btnCancel.className = 'btn-flag secondary';
        btnCancel.textContent = 'Cancelar';
        btnCancel.addEventListener('click', closeEditorPopover);
        actionsDiv.appendChild(btnCancel);

        var btnCreate = document.createElement('button');
        btnCreate.className = 'btn-flag primary';
        btnCreate.style.background = 'var(--accent)';
        btnCreate.textContent = 'Criar Nodo';
        actionsDiv.appendChild(btnCreate);
        pop.appendChild(actionsDiv);

        labelInput.focus();

        function doCreate() {
            var id = idInput.value.trim().replace(/\s+/g, '_');
            var label = labelInput.value.trim();
            if (!id || !label) return;
            applyEdit(function(c) { return addNode(c, id, label); });
            closeEditorPopover();
        }

        labelInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') doCreate();
            if (e.key === 'Escape') closeEditorPopover();
        });
        btnCreate.addEventListener('click', doCreate);
    }

    function showAddEdgePopover(clientX, clientY, fromId, toId) {
        var pop = createPopover(clientX, clientY);

        // Build popover content using DOM methods
        var titleDiv = document.createElement('div');
        titleDiv.className = 'flag-popover-title';
        var titleSpan = document.createElement('span');
        titleSpan.textContent = 'Nova Conexao';
        titleDiv.appendChild(titleSpan);
        var edgeIdSpan = document.createElement('span');
        edgeIdSpan.className = 'node-id';
        edgeIdSpan.textContent = fromId + ' \u2192 ' + toId;
        titleDiv.appendChild(edgeIdSpan);
        pop.appendChild(titleDiv);

        var labelLabel = document.createElement('label');
        labelLabel.style.cssText = 'font-size:11px;color:var(--text-dim);margin-bottom:2px;display:block';
        labelLabel.textContent = 'Label (opcional)';
        pop.appendChild(labelLabel);

        var labelInput = document.createElement('input');
        labelInput.className = 'ep-input ep-label';
        labelInput.type = 'text';
        labelInput.placeholder = 'Texto da seta...';
        pop.appendChild(labelInput);

        var actionsDiv = document.createElement('div');
        actionsDiv.className = 'flag-popover-actions';
        actionsDiv.style.marginTop = '10px';

        var btnCancel = document.createElement('button');
        btnCancel.className = 'btn-flag secondary';
        btnCancel.textContent = 'Cancelar';
        btnCancel.addEventListener('click', function() {
            closeEditorPopover();
            DiagramDOM.highlightNode(fromId, false);
            editorState.edgeSource = null;
        });
        actionsDiv.appendChild(btnCancel);

        var btnCreate = document.createElement('button');
        btnCreate.className = 'btn-flag primary';
        btnCreate.style.background = 'var(--accent)';
        btnCreate.textContent = 'Criar Seta';
        actionsDiv.appendChild(btnCreate);
        pop.appendChild(actionsDiv);

        labelInput.focus();

        function doCreate() {
            var label = labelInput.value.trim();
            applyEdit(function(c) { return addEdge(c, fromId, toId, label || null); });
            closeEditorPopover();
            DiagramDOM.highlightNode(fromId, false);
            editorState.edgeSource = null;
        }

        labelInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') doCreate();
            if (e.key === 'Escape') {
                closeEditorPopover();
                DiagramDOM.highlightNode(fromId, false);
                editorState.edgeSource = null;
            }
        });
        btnCreate.addEventListener('click', doCreate);
    }

    // ── Correction Actions (called from flag popover) ──

    function doRemoveNode(nodeId) {
        applyEdit(function(c) { return removeNode(c, nodeId); });
        if (window.SmartBAnnotations) {
            SmartBAnnotations.getState().flags.delete(nodeId);
            SmartBAnnotations.renderPanel();
            SmartBAnnotations.updateBadge();
        }
    }

    function doRemoveEdge(fromId, toId) {
        applyEdit(function(c) { return removeEdge(c, fromId, toId); });
    }

    function doEditNodeText(nodeId) {
        var editor = editorHooks.getEditor();
        var currentText = getNodeText(editor.value, nodeId);
        var newText = prompt('Novo texto para ' + nodeId + ':', currentText);
        if (newText === null || newText === currentText) return;
        applyEdit(function(c) { return editNodeText(c, nodeId, newText); });
    }

    function startConnectFrom(nodeId) {
        if (window.SmartBAnnotations) SmartBAnnotations.closePopover();
        setMode('addEdge');
        editorState.edgeSource = nodeId;
        DiagramDOM.highlightNode(nodeId, true);
        if (window.toast) window.toast('Origem: ' + nodeId + ' — clique no DESTINO');
    }

    // ── Apply Edit & Re-render ──

    async function applyEdit(editFn) {
        var editor = editorHooks.getEditor();
        if (!editor) return;
        // Strip annotations, apply edit, re-inject annotations
        var annotations = window.SmartBAnnotations;
        var content = editor.value;
        var flags = new Map();
        if (annotations) {
            flags = annotations.getState().flags;
            content = annotations.stripAnnotations(content);
        }
        content = editFn(content);
        if (annotations) content = annotations.injectAnnotations(content, flags);
        editor.value = content;
        editorHooks.setLastContent(content);
        if (editorHooks.saveFile) await editorHooks.saveFile();
        if (editorHooks.renderDiagram) await editorHooks.renderDiagram(content);

        // Emit diagram:edited event via event bus
        if (window.SmartBEventBus) {
            SmartBEventBus.emit('diagram:edited', { source: 'diagram-editor' });
        }
    }

    // ── Init ──

    function init(options) {
        if (options) Object.assign(editorHooks, options);
        var container = document.getElementById('preview-container');
        if (container) container.addEventListener('click', handleClick);

        // Subscribe to event bus: re-init after diagram render if needed
        if (window.SmartBEventBus) {
            SmartBEventBus.on('diagram:rendered', function() {
                // Clear edge source highlight after re-render (SVG is replaced)
                editorState.edgeSource = null;
            });
        }
    }

    // ── Public API ──

    window.MmdEditor = {
        init: init, setMode: setMode,
        toggleAddNode: toggleAddNode, toggleAddEdge: toggleAddEdge,
        addNode: addNode, addEdge: addEdge, removeNode: removeNode,
        removeEdge: removeEdge, editNodeText: editNodeText, getNodeText: getNodeText,
        getAllNodeIds: getAllNodeIds, generateNodeId: generateNodeId,
        findEdgeEndpoints: findEdgeEndpoints,
        doRemoveNode: doRemoveNode, doRemoveEdge: doRemoveEdge,
        doEditNodeText: doEditNodeText, startConnectFrom: startConnectFrom,
        getState: function() { return editorState; },
        closeEditorPopover: closeEditorPopover,
    };
})();
