/**
 * SmartB Diagrams — Visual Diagram Editor
 * Manipulates .mmd content: add/remove/edit nodes and edges.
 * Exposed as window.MmdEditor
 */
(function () {
    'use strict';

    // ── .mmd Content Manipulation ──

    /** Find insertion point: before first `style` line, or before annotations, or at end */
    function findInsertionLine(lines) {
        for (let i = 0; i < lines.length; i++) {
            const t = lines[i].trim();
            if (t.startsWith('style ') || t.startsWith('%% ---')) return i;
        }
        return lines.length;
    }

    /** Add a node definition to .mmd content */
    function addNode(content, nodeId, label) {
        const lines = content.split('\n');
        const idx = findInsertionLine(lines);
        const newLine = `    ${nodeId}["${label}"]`;
        lines.splice(idx, 0, '', newLine);
        return lines.join('\n');
    }

    /** Add an edge between two nodes */
    function addEdge(content, fromId, toId, label) {
        const lines = content.split('\n');
        const idx = findInsertionLine(lines);
        const edgeLine = label
            ? `    ${fromId} -->|"${label}"| ${toId}`
            : `    ${fromId} --> ${toId}`;
        lines.splice(idx, 0, edgeLine);
        return lines.join('\n');
    }

    /** Remove a node and all its edges/styles from .mmd content */
    function removeNode(content, nodeId) {
        const lines = content.split('\n');
        const escaped = nodeId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Match: node definitions, edges referencing it, style directives
        const nodeDefRe = new RegExp(`^\\s*${escaped}[\\s\\[\\(\\{\\>"]`);
        const edgeFromRe = new RegExp(`\\b${escaped}\\s*(-->|---|-.->|==>)`);
        const edgeToRe = new RegExp(`(-->|---|-.->|==>)\\s*(\\|[^|]*\\|\\s*)?${escaped}\\b`);
        const styleRe = new RegExp(`^\\s*style\\s+${escaped}\\b`);

        const result = lines.filter(line => {
            const t = line.trim();
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
        const lines = content.split('\n');
        const escFrom = fromId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const escTo = toId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`\\b${escFrom}\\s*(-->|---|-.->|==>)(\\s*\\|[^|]*\\|)?\\s*${escTo}\\b`);
        const result = lines.filter(line => !re.test(line.trim()));
        return result.join('\n');
    }

    /** Edit a node's label text */
    function editNodeText(content, nodeId, newText) {
        const lines = content.split('\n');
        const escaped = nodeId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Match patterns: ID["text"], ID[text], ID("text"), ID(text), ID{"text"}, etc
        const re = new RegExp(`(${escaped}\\s*[\\[\\(\\{\\>]+\\"?)([^"\\]\\)\\}]*?)(\\"?[\\]\\)\\}]+)`);
        for (let i = 0; i < lines.length; i++) {
            if (re.test(lines[i])) {
                lines[i] = lines[i].replace(re, `$1${newText}$3`);
                break;
            }
        }
        return lines.join('\n');
    }

    /** Extract current label text for a node */
    function getNodeText(content, nodeId) {
        const escaped = nodeId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`${escaped}\\s*[\\[\\(\\{\\>]+"?([^"\\]\\)\\}]*)"?[\\]\\)\\}]+`);
        const m = content.match(re);
        return m ? m[1] : nodeId;
    }

    /** Parse edge info from an SVG edge ID like "L-A-B-0" */
    function parseEdgeId(edgeId) {
        // Edge IDs: L-SOURCE-TARGET-INDEX or L-SOURCE-TARGET
        const m = edgeId.match(/^L-(.+)-(\d+)$/);
        if (!m) return null;
        // The middle part is SOURCE-TARGET, need to split intelligently
        const middle = m[1];
        // Try known node IDs to split
        return { raw: middle };
    }

    /** Find edge source and target from SVG edge element */
    function findEdgeEndpoints(edgeId, content) {
        const lines = content.split('\n');
        const edgePatterns = [];
        for (const line of lines) {
            const m = line.trim().match(/^(\S+)\s*(-->|---|-.->|==>)(\s*\|[^|]*\|)?\s*(\S+)/);
            if (m) {
                const from = m[1].replace(/[\["'\(\{].*$/, '');
                const to = m[4].replace(/[\["'\(\{].*$/, '');
                edgePatterns.push({ from, to, line: line.trim() });
            }
        }
        return edgePatterns;
    }

    /** Get all node IDs from content */
    function getAllNodeIds(content) {
        const ids = new Set();
        const lines = content.split('\n');
        for (const line of lines) {
            const t = line.trim();
            // Node definitions: ID["text"] or ID[text] etc
            const defMatch = t.match(/^\s*([A-Za-z_]\w*)\s*[\[\(\{>]/);
            if (defMatch && !['subgraph', 'style', 'class', 'click', 'flowchart', 'graph', 'end'].includes(defMatch[1])) {
                ids.add(defMatch[1]);
            }
            // Nodes in edges
            const edgeMatch = t.match(/^\s*([A-Za-z_]\w*)\s*(-->|---|-.->|==>)/);
            if (edgeMatch) ids.add(edgeMatch[1]);
            const edgeTo = t.match(/(-->|---|-.->|==>)\s*(?:\|[^|]*\|\s*)?([A-Za-z_]\w*)/);
            if (edgeTo) ids.add(edgeTo[2]);
        }
        return [...ids];
    }

    /** Generate a unique node ID */
    function generateNodeId(content) {
        const existing = getAllNodeIds(content);
        let i = 1;
        while (existing.includes('N' + i)) i++;
        return 'N' + i;
    }

    // ── Visual Editing State ──

    const editorState = {
        mode: null,         // null | 'addNode' | 'addEdge'
        edgeSource: null,   // node ID when in addEdge and source is selected
        pendingAction: null, // { type: 'connectFrom'|'connectTo', nodeId }
    };

    let editorHooks = {
        getEditor: () => document.getElementById('editor'),
        getLastContent: () => window.lastContent || '',
        setLastContent: (v) => { window.lastContent = v; },
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
        const btnNode = document.getElementById('btnAddNode');
        const btnEdge = document.getElementById('btnAddEdge');
        if (btnNode) btnNode.classList.toggle('active', mode === 'addNode');
        if (btnEdge) btnEdge.classList.toggle('active', mode === 'addEdge');

        // Disable flag mode if entering edit mode
        if (mode && window.SmartBAnnotations) {
            const s = SmartBAnnotations.getState();
            if (s.flagMode) SmartBAnnotations.toggleFlagMode();
        }

        if (window.toast) {
            const msgs = {
                addNode: 'Modo Nodo — clique no espaco vazio do diagrama',
                addEdge: 'Modo Seta — clique no nodo de ORIGEM',
                null: 'Modo edicao desativado',
            };
            window.toast(msgs[mode] || msgs[null]);
        }
    }

    function toggleAddNode() { setMode(editorState.mode === 'addNode' ? null : 'addNode'); }
    function toggleAddEdge() { setMode(editorState.mode === 'addEdge' ? null : 'addEdge'); }

    // ── Click Handlers ──

    function handleClick(e) {
        if (!editorState.mode) return;
        if (e.target.closest('.zoom-controls') || e.target.closest('.flag-popover') || e.target.closest('.editor-popover')) return;

        const nodeInfo = window.SmartBAnnotations ? SmartBAnnotations.extractNodeId(e.target) : null;

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
                highlightNode(nodeInfo.id, true);
                if (window.toast) window.toast('Origem: ' + nodeInfo.id + ' — agora clique no DESTINO');
            } else {
                const from = editorState.edgeSource;
                const to = nodeInfo.id;
                if (from === to) return;
                showAddEdgePopover(e.clientX, e.clientY, from, to);
            }
        }
    }

    function highlightNode(nodeId, on) {
        const svg = document.querySelector('#preview svg');
        if (!svg) return;
        for (const el of svg.querySelectorAll('[id]')) {
            const id = el.getAttribute('id');
            const nm = id && id.match(/^flowchart-(.+)-\d+$/);
            if (nm && nm[1] === nodeId) {
                el.style.outline = on ? '3px solid #6366f1' : '';
                el.style.outlineOffset = on ? '4px' : '';
                break;
            }
        }
    }

    // ── Popovers ──

    function closeEditorPopover() {
        const existing = document.querySelector('.editor-popover');
        if (existing) existing.remove();
    }

    function createPopover(x, y) {
        closeEditorPopover();
        const pop = document.createElement('div');
        pop.className = 'flag-popover editor-popover';
        pop.style.left = Math.min(x + 12, window.innerWidth - 360) + 'px';
        pop.style.top = Math.min(y - 20, window.innerHeight - 280) + 'px';
        document.body.appendChild(pop);

        setTimeout(() => {
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
        const editor = editorHooks.getEditor();
        const suggestedId = generateNodeId(editor.value);
        const pop = createPopover(clientX, clientY);
        pop.innerHTML = `
            <div class="flag-popover-title"><span>Novo Nodo</span></div>
            <label style="font-size:11px;color:var(--text-dim);margin-bottom:2px;display:block">ID (sem espacos)</label>
            <input class="ep-input" type="text" value="${suggestedId}" style="margin-bottom:8px">
            <label style="font-size:11px;color:var(--text-dim);margin-bottom:2px;display:block">Texto</label>
            <input class="ep-input ep-label" type="text" placeholder="Texto do nodo...">
            <div class="flag-popover-actions" style="margin-top:10px">
                <button class="btn-flag secondary" data-action="cancel">Cancelar</button>
                <button class="btn-flag primary" data-action="create" style="background:var(--accent)">Criar Nodo</button>
            </div>`;

        const idInput = pop.querySelector('.ep-input');
        const labelInput = pop.querySelector('.ep-label');
        labelInput.focus();

        function doCreate() {
            const id = idInput.value.trim().replace(/\s+/g, '_');
            const label = labelInput.value.trim();
            if (!id || !label) return;
            applyEdit(c => addNode(c, id, label));
            closeEditorPopover();
        }

        labelInput.addEventListener('keydown', e => { if (e.key === 'Enter') doCreate(); if (e.key === 'Escape') closeEditorPopover(); });
        pop.querySelector('[data-action="create"]').addEventListener('click', doCreate);
        pop.querySelector('[data-action="cancel"]').addEventListener('click', closeEditorPopover);
    }

    function showAddEdgePopover(clientX, clientY, fromId, toId) {
        const pop = createPopover(clientX, clientY);
        pop.innerHTML = `
            <div class="flag-popover-title">
                <span>Nova Conexao</span>
                <span class="node-id">${fromId} → ${toId}</span>
            </div>
            <label style="font-size:11px;color:var(--text-dim);margin-bottom:2px;display:block">Label (opcional)</label>
            <input class="ep-input ep-label" type="text" placeholder="Texto da seta...">
            <div class="flag-popover-actions" style="margin-top:10px">
                <button class="btn-flag secondary" data-action="cancel">Cancelar</button>
                <button class="btn-flag primary" data-action="create" style="background:var(--accent)">Criar Seta</button>
            </div>`;

        const labelInput = pop.querySelector('.ep-label');
        labelInput.focus();

        function doCreate() {
            const label = labelInput.value.trim();
            applyEdit(c => addEdge(c, fromId, toId, label || null));
            closeEditorPopover();
            highlightNode(fromId, false);
            editorState.edgeSource = null;
        }

        labelInput.addEventListener('keydown', e => { if (e.key === 'Enter') doCreate(); if (e.key === 'Escape') { closeEditorPopover(); highlightNode(fromId, false); editorState.edgeSource = null; } });
        pop.querySelector('[data-action="create"]').addEventListener('click', doCreate);
        pop.querySelector('[data-action="cancel"]').addEventListener('click', () => { closeEditorPopover(); highlightNode(fromId, false); editorState.edgeSource = null; });
    }

    // ── Correction Actions (called from flag popover) ──

    function doRemoveNode(nodeId) {
        applyEdit(c => removeNode(c, nodeId));
        if (window.SmartBAnnotations) {
            SmartBAnnotations.getState().flags.delete(nodeId);
            SmartBAnnotations.renderPanel();
            SmartBAnnotations.updateBadge();
        }
    }

    function doRemoveEdge(fromId, toId) {
        applyEdit(c => removeEdge(c, fromId, toId));
    }

    function doEditNodeText(nodeId) {
        const editor = editorHooks.getEditor();
        const currentText = getNodeText(editor.value, nodeId);
        const newText = prompt('Novo texto para ' + nodeId + ':', currentText);
        if (newText === null || newText === currentText) return;
        applyEdit(c => editNodeText(c, nodeId, newText));
    }

    function startConnectFrom(nodeId) {
        if (window.SmartBAnnotations) SmartBAnnotations.closePopover();
        setMode('addEdge');
        editorState.edgeSource = nodeId;
        highlightNode(nodeId, true);
        if (window.toast) window.toast('Origem: ' + nodeId + ' — clique no DESTINO');
    }

    // ── Apply Edit & Re-render ──

    async function applyEdit(editFn) {
        const editor = editorHooks.getEditor();
        if (!editor) return;
        // Strip annotations, apply edit, re-inject annotations
        const annotations = window.SmartBAnnotations;
        let content = editor.value;
        let flags = new Map();
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
    }

    // ── Init ──

    function init(options) {
        if (options) Object.assign(editorHooks, options);
        const container = document.getElementById('preview-container');
        if (container) container.addEventListener('click', handleClick);
    }

    // ── Public API ──

    window.MmdEditor = {
        init, setMode, toggleAddNode, toggleAddEdge,
        addNode, addEdge, removeNode, removeEdge, editNodeText, getNodeText,
        getAllNodeIds, generateNodeId, findEdgeEndpoints,
        doRemoveNode, doRemoveEdge, doEditNodeText, startConnectFrom,
        getState: () => editorState,
        closeEditorPopover,
    };
})();
