/**
 * SmartB Annotations -- Flag, Status, Breakpoint, Risk annotation system.
 * Dependencies: diagram-dom.js, event-bus.js, annotations-svg.js, annotations-panel.js.
 * Exposed as window.SmartBAnnotations
 */
(function () {
    'use strict';

    var ANNOTATION_START = '%% --- ANNOTATIONS (auto-managed by SmartB Diagrams) ---';
    var ANNOTATION_END = '%% --- END ANNOTATIONS ---';
    var FLAG_REGEX = /^%%\s*@flag\s+(\S+)\s+"([^"]*)"$/;
    var STATUS_REGEX = /^%%\s*@status\s+(\S+)\s+(\S+)$/;
    var BREAKPOINT_REGEX = /^%%\s*@breakpoint\s+(\S+)$/;
    var RISK_REGEX = /^%%\s*@risk\s+(\S+)\s+(high|medium|low)\s+"([^"]*)"$/;
    var GHOST_REGEX = /^%%\s*@ghost\s+(\S+)\s+(\S+)\s+"([^"]*)"$/;

    var state = {
        flagMode: false,
        flags: new Map(),      // nodeId -> { message, timestamp }
        statuses: new Map(),   // nodeId -> statusValue string
        breakpoints: new Set(), // nodeId set
        risks: new Map(),      // nodeId -> { level, reason }
        ghosts: [],            // [{ fromNodeId, toNodeId, label }]
        panelOpen: false, popover: null,
        popoverOutsideHandler: null, // stored ref to remove on close
    };

    var hooks = {
        getEditor: function() { return document.getElementById('editor'); },
        getCurrentFile: function() { return window.currentFile || ''; },
        getLastContent: function() { return window.lastContent || ''; },
        setLastContent: function(v) { window.lastContent = v; },
        saveFile: null,
        renderDiagram: null,
    };

    // ── Parsing & Serialization ──

    function parseAnnotations(content) {
        var flags = new Map(), statuses = new Map(), breakpoints = new Set(), risks = new Map();
        var ghosts = [];
        var lines = content.split('\n');
        var inBlock = false;
        for (var li = 0; li < lines.length; li++) {
            var trimmed = lines[li].trim();
            if (trimmed === ANNOTATION_START) { inBlock = true; continue; }
            if (trimmed === ANNOTATION_END) { inBlock = false; continue; }
            if (inBlock) {
                var fm = trimmed.match(FLAG_REGEX);
                if (fm) { flags.set(fm[1], { message: fm[2], timestamp: Date.now() }); continue; }
                var sm = trimmed.match(STATUS_REGEX);
                if (sm) { statuses.set(sm[1], sm[2]); continue; }
                var bm = trimmed.match(BREAKPOINT_REGEX);
                if (bm) { breakpoints.add(bm[1]); continue; }
                var rm = trimmed.match(RISK_REGEX);
                if (rm) { risks.set(rm[1], { level: rm[2], reason: rm[3] }); continue; }
                var gm = trimmed.match(GHOST_REGEX);
                if (gm) { ghosts.push({ fromNodeId: gm[1], toNodeId: gm[2], label: gm[3] }); continue; }
            }
        }
        return { flags, statuses, breakpoints, risks, ghosts };
    }

    function stripAnnotations(content) {
        var lines = content.split('\n'), result = [];
        var inBlock = false;
        for (var si = 0; si < lines.length; si++) {
            var t = lines[si].trim();
            if (t === ANNOTATION_START) { inBlock = true; continue; }
            if (t === ANNOTATION_END) { inBlock = false; continue; }
            if (!inBlock) result.push(lines[si]);
        }
        while (result.length > 0 && result[result.length - 1].trim() === '') result.pop();
        return result.join('\n');
    }

    function injectAnnotations(content, flags, statuses, ghosts) {
        var clean = stripAnnotations(content), statusMap = statuses || state.statuses;
        var ghostList = ghosts || state.ghosts || [];
        var hasAnnotations = flags.size > 0 || statusMap.size > 0 || state.breakpoints.size > 0 || state.risks.size > 0 || ghostList.length > 0;
        if (!hasAnnotations) return clean;
        var lines = ['', ANNOTATION_START];
        flags.forEach(function(val, nid) { lines.push('%% @flag ' + nid + ' "' + val.message.replace(/"/g, "''") + '"'); });
        statusMap.forEach(function(sv, nid) { lines.push('%% @status ' + nid + ' ' + sv); });
        state.breakpoints.forEach(function(nid) { lines.push('%% @breakpoint ' + nid); });
        state.risks.forEach(function(val, nid) { lines.push('%% @risk ' + nid + ' ' + val.level + ' "' + val.reason.replace(/"/g, "''") + '"'); });
        for (var gi = 0; gi < ghostList.length; gi++) {
            var g = ghostList[gi];
            lines.push('%% @ghost ' + g.fromNodeId + ' ' + g.toNodeId + ' "' + (g.label || '').replace(/"/g, "''") + '"');
        }
        lines.push(ANNOTATION_END);
        return clean + '\n' + lines.join('\n');
    }

    function getCleanContent(content) { return stripAnnotations(content); }

    // ── SVG Post-processing (delegates to SmartBAnnotationsSVG) ──

    function applyFlagsToSVG() {
        SmartBAnnotationsSVG.applyFlagsToSVG(state.flags);
    }

    // ── Panel rendering (delegates to SmartBAnnotationsPanel) ──

    function renderPanel() {
        SmartBAnnotationsPanel.renderPanel(state, hooks, removeFlag);
    }

    function updateBadge() {
        SmartBAnnotationsPanel.updateBadge(state.flags.size);
    }

    function togglePanel() {
        SmartBAnnotationsPanel.togglePanel(state);
    }

    // ── Popover ──

    function closePopover() {
        if (state.popoverOutsideHandler) {
            document.removeEventListener('mousedown', state.popoverOutsideHandler);
            state.popoverOutsideHandler = null;
        }
        if (state.popover) { state.popover.remove(); state.popover = null; }
    }

    function showPopover(nodeInfo, clientX, clientY) {
        closePopover();
        var existing = state.flags.get(nodeInfo.id);
        var isExisting = !!existing;
        var isNode = nodeInfo.type === 'node' || nodeInfo.type === 'subgraph';
        var pop = document.createElement('div');
        pop.className = 'flag-popover';
        pop.style.left = Math.min(clientX + 12, window.innerWidth - 380) + 'px';
        pop.style.top = Math.min(clientY - 20, window.innerHeight - 320) + 'px';

        var typeLabel = nodeInfo.type === 'edge' ? 'Edge' : nodeInfo.type === 'subgraph' ? 'Subgraph' : 'Node';
        var hasMmdEditor = !!window.MmdEditor;

        // Build popover content using DOM methods for safety
        var titleDiv = document.createElement('div');
        titleDiv.className = 'flag-popover-title';
        var titleSpan = document.createElement('span');
        titleSpan.textContent = isExisting ? 'Edit Flag' : 'Flag ' + typeLabel;
        titleDiv.appendChild(titleSpan);
        var idSpan = document.createElement('span');
        idSpan.className = 'node-id';
        idSpan.textContent = nodeInfo.id;
        titleDiv.appendChild(idSpan);
        pop.appendChild(titleDiv);

        var textarea = document.createElement('textarea');
        textarea.className = 'flag-note';
        textarea.placeholder = 'Describe the issue (optional)...';
        textarea.value = isExisting ? existing.message : '';
        pop.appendChild(textarea);

        if (hasMmdEditor) {
            var corrDiv = document.createElement('div');
            corrDiv.className = 'correction-actions';
            var corrLabel = document.createElement('span');
            corrLabel.style.cssText = 'font-size:10px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:1px';
            corrLabel.textContent = 'Actions';
            corrDiv.appendChild(corrLabel);
            var btnsDiv = document.createElement('div');
            btnsDiv.className = 'correction-btns';
            if (isNode) {
                var btnEditText = document.createElement('button');
                btnEditText.className = 'btn-correction';
                btnEditText.dataset.action = 'edit-text';
                btnEditText.title = 'Edit node text';
                btnEditText.textContent = 'Edit Text';
                btnsDiv.appendChild(btnEditText);
                var btnConnect = document.createElement('button');
                btnConnect.className = 'btn-correction';
                btnConnect.dataset.action = 'connect-from';
                btnConnect.title = 'Create new edge from this node';
                btnConnect.innerHTML = 'New Edge ' + SmartBIcons.arrowRight;
                btnsDiv.appendChild(btnConnect);
            }
            var btnDelete = document.createElement('button');
            btnDelete.className = 'btn-correction btn-correction-danger';
            btnDelete.dataset.action = 'delete';
            btnDelete.title = 'Remove ' + typeLabel.toLowerCase() + ' from diagram';
            btnDelete.textContent = 'Remove ' + typeLabel;
            btnsDiv.appendChild(btnDelete);
            corrDiv.appendChild(btnsDiv);
            pop.appendChild(corrDiv);
        }

        var actionsDiv = document.createElement('div');
        actionsDiv.className = 'flag-popover-actions';
        if (isExisting) {
            var btnRemove = document.createElement('button');
            btnRemove.className = 'btn-flag remove';
            btnRemove.dataset.action = 'remove-flag';
            btnRemove.textContent = 'Remove Flag';
            actionsDiv.appendChild(btnRemove);
        }
        var btnCancel = document.createElement('button');
        btnCancel.className = 'btn-flag secondary';
        btnCancel.dataset.action = 'cancel';
        btnCancel.textContent = 'Cancel';
        actionsDiv.appendChild(btnCancel);
        var btnFlag = document.createElement('button');
        btnFlag.className = 'btn-flag primary';
        btnFlag.dataset.action = 'flag';
        btnFlag.textContent = isExisting ? 'Update' : 'Flag';
        actionsDiv.appendChild(btnFlag);
        pop.appendChild(actionsDiv);

        document.body.appendChild(pop);
        state.popover = pop;
        textarea.focus();

        textarea.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doFlag(nodeInfo, textarea.value.trim()); }
            if (e.key === 'Escape') closePopover();
        });

        pop.addEventListener('click', function(e) {
            var btn = e.target.closest('[data-action]');
            if (!btn) return;
            var action = btn.dataset.action;
            if (action === 'cancel') closePopover();
            else if (action === 'flag') doFlag(nodeInfo, textarea.value.trim());
            else if (action === 'remove-flag') removeFlag(nodeInfo.id);
            else if (action === 'delete') { closePopover(); MmdEditor.doRemoveNode(nodeInfo.id); }
            else if (action === 'edit-text') { closePopover(); MmdEditor.doEditNodeText(nodeInfo.id); }
            else if (action === 'connect-from') { closePopover(); MmdEditor.startConnectFrom(nodeInfo.id); }
        });

        setTimeout(function() {
            function outsideClick(e) {
                if (pop.contains(e.target)) return;
                closePopover();
            }
            state.popoverOutsideHandler = outsideClick;
            document.addEventListener('mousedown', outsideClick);
        }, 50);
    }

    // ── Flag Operations ──

    function doFlag(nodeInfo, message) {
        state.flags.set(nodeInfo.id, { message: message, timestamp: Date.now() });
        closePopover();
        onFlagsChanged();
    }

    function removeFlag(nodeId) {
        state.flags.delete(nodeId);
        closePopover();
        onFlagsChanged();
    }

    async function onFlagsChanged() {
        var editor = hooks.getEditor();
        if (!editor) return;
        var newContent = injectAnnotations(editor.value, state.flags, state.statuses);
        editor.value = newContent;
        hooks.setLastContent(newContent);
        if (hooks.saveFile) await hooks.saveFile();
        applyFlagsToSVG();
        renderPanel();
        updateBadge();
        if (window.SmartBEventBus) {
            SmartBEventBus.emit('flags:changed', { flags: state.flags, statuses: state.statuses });
        }
    }

    // ── Merge (auto-sync preserves user flags) ──

    function mergeIncomingContent(incomingContent) {
        var incoming = parseAnnotations(incomingContent);
        var mergedFlags = new Map(incoming.flags);
        for (var entry of state.flags) mergedFlags.set(entry[0], entry[1]);
        state.flags = mergedFlags;
        var mergedStatuses = new Map(incoming.statuses);
        for (var sEntry of state.statuses) mergedStatuses.set(sEntry[0], sEntry[1]);
        state.statuses = mergedStatuses;
        state.breakpoints = new Set([...incoming.breakpoints, ...state.breakpoints]);
        if (window.SmartBBreakpoints) SmartBBreakpoints.updateBreakpoints(state.breakpoints);
        var mergedRisks = new Map(incoming.risks);
        for (var rEntry of state.risks) mergedRisks.set(rEntry[0], rEntry[1]);
        state.risks = mergedRisks;
        if (window.SmartBHeatmap) SmartBHeatmap.updateRisks(state.risks);
        // Ghosts from file take precedence (file is source of truth)
        state.ghosts = incoming.ghosts || [];
        if (window.SmartBGhostPaths) {
            var file = window.SmartBFileTree ? SmartBFileTree.getCurrentFile() : null;
            if (file) SmartBGhostPaths.updateGhostPaths(file, state.ghosts);
        }
        var cleanIncoming = stripAnnotations(incomingContent);
        return injectAnnotations(cleanIncoming, mergedFlags, mergedStatuses);
    }

    // ── Click Handler (flag mode) ──

    function handlePreviewClick(e) {
        if (!state.flagMode) return;
        if (e.target.closest('.zoom-controls') || e.target.closest('.flag-popover')) return;
        var nodeInfo = DiagramDOM.extractNodeId(e.target);
        if (!nodeInfo) return;
        e.preventDefault();
        e.stopPropagation();
        showPopover(nodeInfo, e.clientX, e.clientY);
    }

    // ── Flag Mode Toggle ──

    function toggleFlagMode() {
        state.flagMode = !state.flagMode;
        document.body.classList.toggle('flag-mode', state.flagMode);
        var btn = document.getElementById('btnFlags');
        if (btn) btn.classList.toggle('active', state.flagMode);
        if (!state.flagMode) closePopover();
        if (window.toast) window.toast(state.flagMode ? 'Flag Mode ON -- click on a node' : 'Flag Mode OFF');
    }

    // ── Init ──

    function init(options) {
        if (options) Object.assign(hooks, options);
        var editor = hooks.getEditor();
        if (editor && editor.value) {
            var parsed = parseAnnotations(editor.value);
            state.flags = parsed.flags;
            state.statuses = parsed.statuses;
            state.breakpoints = parsed.breakpoints;
            state.risks = parsed.risks;
            state.ghosts = parsed.ghosts || [];
            if (window.SmartBBreakpoints) SmartBBreakpoints.updateBreakpoints(parsed.breakpoints);
            if (window.SmartBHeatmap) SmartBHeatmap.updateRisks(parsed.risks);
        }
        var container = document.getElementById('preview-container');
        if (container) container.addEventListener('click', handlePreviewClick);
        renderPanel();
        updateBadge();

        if (window.SmartBEventBus) {
            SmartBEventBus.on('diagram:rendered', function() {
                applyFlagsToSVG();
            });
        }
    }

    // ── Status Operations ──

    function getStatusMap() { return state.statuses; }
    function setStatus(nodeId, statusValue) { state.statuses.set(nodeId, statusValue); onFlagsChanged(); }
    function removeStatus(nodeId) { state.statuses.delete(nodeId); onFlagsChanged(); }

    // ── Public API ──

    window.SmartBAnnotations = {
        init: init, getState: function() { return state; },
        parseAnnotations: parseAnnotations, stripAnnotations: stripAnnotations,
        injectAnnotations: injectAnnotations, getCleanContent: getCleanContent,
        applyFlagsToSVG: applyFlagsToSVG, mergeIncomingContent: mergeIncomingContent,
        toggleFlagMode: toggleFlagMode, togglePanel: togglePanel,
        renderPanel: renderPanel, updateBadge: updateBadge,
        extractNodeId: function(element) { return DiagramDOM.extractNodeId(element); },
        closePopover: closePopover, getRisks: function() { return state.risks; },
        getStatusMap: getStatusMap, setStatus: setStatus, removeStatus: removeStatus,
    };
})();
