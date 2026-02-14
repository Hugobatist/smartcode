/**
 * SmartB Diagrams — Annotations / Flag System
 * Click-to-flag diagram nodes/edges/subgraphs.
 * Flags persisted as %% @flag comments in .mmd files.
 * Exposed as window.SmartBAnnotations
 */
(function () {
    'use strict';

    const ANNOTATION_START = '%% --- ANNOTATIONS (auto-managed by SmartB Diagrams) ---';
    const ANNOTATION_END = '%% --- END ANNOTATIONS ---';
    const FLAG_REGEX = /^%%\s*@flag\s+(\S+)\s+"([^"]*)"$/;

    const state = {
        flagMode: false,
        flags: new Map(),   // nodeId -> { message, timestamp }
        panelOpen: false,
        popover: null,
    };

    let hooks = {
        getEditor: () => document.getElementById('editor'),
        getCurrentFile: () => window.currentFile || '',
        getLastContent: () => window.lastContent || '',
        setLastContent: (v) => { window.lastContent = v; },
        saveFile: null,
        renderDiagram: null,
    };

    // ── Parsing & Serialization ──

    function parseAnnotations(content) {
        const flags = new Map();
        const lines = content.split('\n');
        let inBlock = false;
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed === ANNOTATION_START) { inBlock = true; continue; }
            if (trimmed === ANNOTATION_END) { inBlock = false; continue; }
            if (inBlock) {
                const m = trimmed.match(FLAG_REGEX);
                if (m) flags.set(m[1], { message: m[2], timestamp: Date.now() });
            }
        }
        return flags;
    }

    function stripAnnotations(content) {
        const lines = content.split('\n');
        const result = [];
        let inBlock = false;
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed === ANNOTATION_START) { inBlock = true; continue; }
            if (trimmed === ANNOTATION_END) { inBlock = false; continue; }
            if (!inBlock) result.push(line);
        }
        while (result.length > 0 && result[result.length - 1].trim() === '') result.pop();
        return result.join('\n');
    }

    function injectAnnotations(content, flags) {
        const clean = stripAnnotations(content);
        if (flags.size === 0) return clean;
        const lines = ['', ANNOTATION_START];
        for (const [nodeId, { message }] of flags) {
            lines.push(`%% @flag ${nodeId} "${message.replace(/"/g, "''")}"`);
        }
        lines.push(ANNOTATION_END);
        return clean + '\n' + lines.join('\n');
    }

    function getCleanContent(content) { return stripAnnotations(content); }

    // ── SVG Post-processing ──

    function extractNodeId(element) {
        let el = element;
        while (el && el !== document.body) {
            const id = el.getAttribute && el.getAttribute('id');
            if (id) {
                const nodeMatch = id.match(/^flowchart-(.+)-\d+$/);
                if (nodeMatch) return { type: 'node', id: nodeMatch[1] };
                const edgeMatch = id.match(/^L-(.+)$/);
                if (edgeMatch) return { type: 'edge', id: 'L-' + edgeMatch[1] };
                const subMatch = id.match(/^subGraph\d+-(.+)-\d+$/);
                if (subMatch) return { type: 'subgraph', id: subMatch[1] };
                if (el.classList && el.classList.contains('cluster')) return { type: 'subgraph', id: id };
            }
            const dataId = el.getAttribute && el.getAttribute('data-id');
            if (dataId) return { type: 'node', id: dataId };
            if (el.classList) {
                if (el.classList.contains('node') || el.classList.contains('cluster')) {
                    const nid = el.getAttribute('id');
                    if (nid) {
                        const nm = nid.match(/^flowchart-(.+)-\d+$/);
                        if (nm) return { type: 'node', id: nm[1] };
                        const sm = nid.match(/^subGraph\d+-(.+)-\d+$/);
                        if (sm) return { type: 'subgraph', id: sm[1] };
                        return { type: 'node', id: nid };
                    }
                }
                if (el.classList.contains('edgePath') || el.classList.contains('flowchart-link')) {
                    const eid = el.getAttribute('id');
                    if (eid) return { type: 'edge', id: eid };
                }
            }
            el = el.parentElement;
        }
        return null;
    }

    function applyFlagsToSVG() {
        const svg = document.querySelector('#preview svg');
        if (!svg) return;
        svg.querySelectorAll('.flag-badge').forEach(b => b.remove());
        svg.querySelectorAll('.flagged, .flagged-edge').forEach(el => {
            el.classList.remove('flagged', 'flagged-edge');
        });
        if (state.flags.size === 0) return;

        for (const el of svg.querySelectorAll('[id]')) {
            const id = el.getAttribute('id');
            if (!id) continue;
            const nodeMatch = id.match(/^flowchart-(.+)-\d+$/);
            if (nodeMatch && state.flags.has(nodeMatch[1])) {
                el.classList.add('flagged');
                addBadge(svg, el);
                continue;
            }
            const subMatch = id.match(/^subGraph\d+-(.+)-\d+$/);
            if (subMatch && state.flags.has(subMatch[1])) {
                el.classList.add('flagged');
                addBadge(svg, el);
                continue;
            }
            if (id.startsWith('L-') && state.flags.has(id)) {
                el.classList.add('flagged-edge');
            }
        }
    }

    function addBadge(svg, element) {
        const bbox = element.getBBox ? element.getBBox() : null;
        if (!bbox) return;
        const ns = 'http://www.w3.org/2000/svg';
        const g = document.createElementNS(ns, 'g');
        g.setAttribute('class', 'flag-badge');
        const cx = bbox.x + bbox.width - 2, cy = bbox.y + 2;

        const circle = document.createElementNS(ns, 'circle');
        Object.entries({ cx, cy, r: 10, fill: '#ef4444', stroke: '#fff', 'stroke-width': 2 })
            .forEach(([k, v]) => circle.setAttribute(k, v));

        const text = document.createElementNS(ns, 'text');
        Object.entries({
            x: cx, y: cy + 1, 'text-anchor': 'middle', 'dominant-baseline': 'central',
            fill: '#fff', 'font-size': 12, 'font-weight': 700, 'font-family': 'Inter, sans-serif'
        }).forEach(([k, v]) => text.setAttribute(k, v));
        text.textContent = '!';

        g.appendChild(circle);
        g.appendChild(text);
        svg.appendChild(g);
    }

    // ── Popover ──

    function closePopover() {
        if (state.popover) { state.popover.remove(); state.popover = null; }
    }

    function showPopover(nodeInfo, clientX, clientY) {
        closePopover();
        const existing = state.flags.get(nodeInfo.id);
        const isExisting = !!existing;
        const isNode = nodeInfo.type === 'node' || nodeInfo.type === 'subgraph';
        const pop = document.createElement('div');
        pop.className = 'flag-popover';
        pop.style.left = Math.min(clientX + 12, window.innerWidth - 380) + 'px';
        pop.style.top = Math.min(clientY - 20, window.innerHeight - 320) + 'px';

        const typeLabel = nodeInfo.type === 'edge' ? 'Conexao' : nodeInfo.type === 'subgraph' ? 'Subgrafo' : 'Nodo';
        const hasMmdEditor = !!window.MmdEditor;

        pop.innerHTML = `
            <div class="flag-popover-title">
                <span>${isExisting ? 'Editar Flag' : 'Sinalizar ' + typeLabel}</span>
                <span class="node-id">${nodeInfo.id}</span>
            </div>
            <textarea class="flag-note" placeholder="Descreva o problema (opcional)...">${isExisting ? existing.message : ''}</textarea>
            ${hasMmdEditor ? `<div class="correction-actions">
                <span style="font-size:10px;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:1px">Correcoes</span>
                <div class="correction-btns">
                    ${isNode ? `<button class="btn-correction" data-action="edit-text" title="Editar texto do nodo">Editar Texto</button>` : ''}
                    ${isNode ? `<button class="btn-correction" data-action="connect-from" title="Criar nova seta a partir deste nodo">Nova Seta →</button>` : ''}
                    <button class="btn-correction btn-correction-danger" data-action="delete" title="Remover ${typeLabel.toLowerCase()} do diagrama">Remover ${typeLabel}</button>
                </div>
            </div>` : ''}
            <div class="flag-popover-actions">
                ${isExisting ? '<button class="btn-flag remove" data-action="remove-flag">Remover Flag</button>' : ''}
                <button class="btn-flag secondary" data-action="cancel">Cancelar</button>
                <button class="btn-flag primary" data-action="flag">${isExisting ? 'Atualizar' : 'Sinalizar'}</button>
            </div>`;

        document.body.appendChild(pop);
        state.popover = pop;
        const textarea = pop.querySelector('.flag-note');
        textarea.focus();

        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doFlag(nodeInfo, textarea.value.trim()); }
            if (e.key === 'Escape') closePopover();
        });

        pop.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            const action = btn.dataset.action;
            if (action === 'cancel') closePopover();
            else if (action === 'flag') doFlag(nodeInfo, textarea.value.trim());
            else if (action === 'remove-flag') removeFlag(nodeInfo.id);
            else if (action === 'delete') { closePopover(); MmdEditor.doRemoveNode(nodeInfo.id); }
            else if (action === 'edit-text') { closePopover(); MmdEditor.doEditNodeText(nodeInfo.id); }
            else if (action === 'connect-from') { closePopover(); MmdEditor.startConnectFrom(nodeInfo.id); }
        });

        setTimeout(() => {
            function outsideClick(e) {
                if (pop.contains(e.target)) return;
                closePopover();
                document.removeEventListener('mousedown', outsideClick);
            }
            document.addEventListener('mousedown', outsideClick);
        }, 50);
    }

    // ── Flag Operations ──

    function doFlag(nodeInfo, message) {
        state.flags.set(nodeInfo.id, { message, timestamp: Date.now() });
        closePopover();
        onFlagsChanged();
    }

    function removeFlag(nodeId) {
        state.flags.delete(nodeId);
        closePopover();
        onFlagsChanged();
    }

    async function onFlagsChanged() {
        const editor = hooks.getEditor();
        if (!editor) return;
        const newContent = injectAnnotations(editor.value, state.flags);
        editor.value = newContent;
        hooks.setLastContent(newContent);
        if (hooks.saveFile) await hooks.saveFile();
        applyFlagsToSVG();
        renderPanel();
        updateBadge();
    }

    // ── Flags Panel ──

    function renderPanel() {
        const list = document.getElementById('flagPanelList');
        if (!list) return;
        const count = document.getElementById('flagPanelCount');
        if (count) {
            count.textContent = state.flags.size;
            count.dataset.count = state.flags.size;
            count.style.display = state.flags.size > 0 ? '' : 'none';
        }
        if (state.flags.size === 0) {
            list.innerHTML = '<div class="flag-panel-empty">Nenhuma flag ativa.<br>Ative o Flag Mode (<kbd>F</kbd>) e clique em um nodo para sinalizar.</div>';
            return;
        }
        let html = '';
        for (const [nodeId, { message }] of state.flags) {
            html += `<div class="flag-panel-item" data-node-id="${nodeId}">
                <div class="flag-panel-item-id">${nodeId}</div>
                ${message ? `<div class="flag-panel-item-msg">${escapeHtml(message)}</div>` : '<div class="flag-panel-item-msg" style="font-style:italic">(sem nota)</div>'}
            </div>`;
        }
        list.innerHTML = html;
        list.querySelectorAll('.flag-panel-item').forEach(item => {
            item.addEventListener('click', () => scrollToNode(item.dataset.nodeId));
        });
    }

    function scrollToNode(nodeId) {
        const svg = document.querySelector('#preview svg');
        if (!svg) return;
        for (const el of svg.querySelectorAll('[id]')) {
            const id = el.getAttribute('id');
            const nm = id && id.match(/^flowchart-(.+)-\d+$/);
            const sm = id && id.match(/^subGraph\d+-(.+)-\d+$/);
            if ((nm && nm[1] === nodeId) || (sm && sm[1] === nodeId) || id === nodeId) {
                el.style.transition = 'opacity 0.15s';
                el.style.opacity = '0.3';
                setTimeout(() => { el.style.opacity = '1'; }, 150);
                setTimeout(() => { el.style.opacity = '0.3'; }, 300);
                setTimeout(() => { el.style.opacity = '1'; el.style.transition = ''; }, 450);
                break;
            }
        }
    }

    function updateBadge() {
        const badge = document.getElementById('flagCountBadge');
        if (badge) {
            badge.textContent = state.flags.size || '';
            badge.dataset.count = state.flags.size;
        }
    }

    // ── Merge (auto-sync preserves user flags) ──

    function mergeIncomingContent(incomingContent) {
        const incomingFlags = parseAnnotations(incomingContent);
        const merged = new Map(incomingFlags);
        for (const [id, flag] of state.flags) merged.set(id, flag);
        state.flags = merged;
        const cleanIncoming = stripAnnotations(incomingContent);
        return injectAnnotations(cleanIncoming, merged);
    }

    // ── Click Handler (flag mode) ──

    function handlePreviewClick(e) {
        if (!state.flagMode) return;
        if (e.target.closest('.zoom-controls') || e.target.closest('.flag-popover')) return;
        const nodeInfo = extractNodeId(e.target);
        if (!nodeInfo) return;
        e.preventDefault();
        e.stopPropagation();
        showPopover(nodeInfo, e.clientX, e.clientY);
    }

    // ── Flag Mode Toggle ──

    function toggleFlagMode() {
        state.flagMode = !state.flagMode;
        document.body.classList.toggle('flag-mode', state.flagMode);
        const btn = document.getElementById('btnFlags');
        if (btn) btn.classList.toggle('active', state.flagMode);
        if (!state.flagMode) closePopover();
        if (window.toast) window.toast(state.flagMode ? 'Flag Mode ON — clique em um nodo' : 'Flag Mode OFF');
    }

    function togglePanel() {
        state.panelOpen = !state.panelOpen;
        const panel = document.getElementById('flagPanel');
        if (panel) panel.classList.toggle('hidden', !state.panelOpen);
        if (window.zoomFit) setTimeout(window.zoomFit, 100);
    }

    // ── Init ──

    function init(options) {
        if (options) Object.assign(hooks, options);
        const editor = hooks.getEditor();
        if (editor && editor.value) state.flags = parseAnnotations(editor.value);
        const container = document.getElementById('preview-container');
        if (container) container.addEventListener('click', handlePreviewClick);
        renderPanel();
        updateBadge();
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ── Public API ──

    window.SmartBAnnotations = {
        init, getState: () => state,
        parseAnnotations, stripAnnotations, injectAnnotations, getCleanContent,
        applyFlagsToSVG, mergeIncomingContent,
        toggleFlagMode, togglePanel, renderPanel, updateBadge,
        extractNodeId, closePopover,
    };
})();
