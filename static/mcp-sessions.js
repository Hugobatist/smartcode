/**
 * SmartCode MCP Sessions -- sidebar view showing AI sessions and their diagrams.
 * Fetches data from GET /api/mcp-sessions and renders grouped by session.
 * Supports renaming (PATCH) and deleting (DELETE) sessions via /api/mcp-sessions/:id.
 *
 * Sessões VAZIAS (0 diagramas) ficam ocultas por padrão; um toggle discreto
 * "mostrar vazias (N)" revela/oculta. Exclusão usa um mini-confirm inline
 * (sem window.confirm/alert nativo).
 *
 * Dependencies: file-tree.js (SmartCodeFileTree), renderer.js (SmartCodeRenderer), modal.js (SmartCodeModal)
 *
 * Note: innerHTML usage is safe here -- all dynamic values pass through
 * SmartCodeRenderer.escapeHtml() before interpolation, preventing XSS.
 * This follows the same pattern established in file-tree.js.
 */
(function() {
    'use strict';

    var viewMode = 'files'; // 'files' | 'sessions'
    var sessionsData = [];
    var showEmpty = false;          // por padrão, esconde sessões sem diagramas
    var pendingDeleteId = null;      // sessão com mini-confirm de exclusão aberto

    function bUrl(path) { return (window.SmartCodeBaseUrl || '') + path; }

    function escapeHtml(str) {
        return SmartCodeRenderer.escapeHtml(str);
    }

    function prettyName(fname) {
        var base = fname.includes('/') ? fname.split('/').pop() : fname;
        return base.replace('.mmd', '').replace(/-/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
    }

    function timeAgo(ts) {
        var diff = Date.now() - ts;
        var secs = Math.floor(diff / 1000);
        if (secs < 60) return secs + 's ago';
        var mins = Math.floor(secs / 60);
        if (mins < 60) return mins + 'min ago';
        var hours = Math.floor(mins / 60);
        if (hours < 24) return hours + 'h ago';
        return Math.floor(hours / 24) + 'd ago';
    }

    function isEmptySession(session) {
        return !session.diagrams || session.diagrams.length === 0;
    }

    // ── Fetch sessions from API ──

    function fetchSessions() {
        return fetch(bUrl('/api/mcp-sessions'))
            .then(function(r) { return r.ok ? r.json() : { sessions: [] }; })
            .then(function(data) {
                sessionsData = data.sessions || [];
                if (viewMode === 'sessions') renderSessionsView();
                return sessionsData;
            })
            .catch(function() {
                sessionsData = [];
                if (viewMode === 'sessions') renderSessionsView();
                return [];
            });
    }

    // ── Rename session via API ──

    function renameSession(sessionId, newLabel) {
        return fetch(bUrl('/api/mcp-sessions/' + encodeURIComponent(sessionId)), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ label: newLabel }),
        })
            .then(function(r) { return r.json(); })
            .then(function() { return fetchSessions(); });
    }

    // ── Delete session via API ──

    function deleteSession(sessionId) {
        pendingDeleteId = null;
        return fetch(bUrl('/api/mcp-sessions/' + encodeURIComponent(sessionId)), {
            method: 'DELETE',
        })
            .then(function(r) {
                if (window.toast) toast(r.ok ? 'Sessão apagada' : 'Erro ao apagar sessão');
                return fetchSessions();
            })
            .catch(function() {
                if (window.toast) toast('Erro ao apagar sessão');
                return fetchSessions();
            });
    }

    // ── Render helpers ──
    // Safe: all dynamic values are escaped via escapeHtml before interpolation (same as file-tree.js)

    function renderSessionCard(session) {
        var shortId = session.sessionId.substring(0, 8);
        var ago = timeAgo(session.startedAt);
        var diagrams = session.diagrams || [];
        var sid = escapeHtml(session.sessionId);
        var html = '<div class="mcp-session-card">';

        if (pendingDeleteId === session.sessionId) {
            // Mini-confirm inline (substitui o header) -- sem dialog nativo
            html += '<div class="mcp-session-confirm">';
            html += '<span class="mcp-session-confirm-text">Apagar esta sessão?</span>';
            html += '<button class="mcp-session-confirm-btn danger" data-action="confirm-delete" data-session-id="' + sid + '">Apagar</button>';
            html += '<button class="mcp-session-confirm-btn" data-action="cancel-delete">Cancelar</button>';
            html += '</div>';
        } else {
            html += '<div class="mcp-session-header">';
            html += '<span class="mcp-session-dot active"></span>';
            html += '<span class="mcp-session-label">' + escapeHtml(session.label || 'Session ' + shortId) + '</span>';
            html += '<button class="mcp-session-rename-btn" data-action="rename-session" data-session-id="' + sid + '" data-current-label="' + escapeHtml(session.label || '') + '" title="Renomear sessão">';
            html += '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>';
            html += '</button>';
            html += '<button class="mcp-session-delete-btn" data-action="ask-delete" data-session-id="' + sid + '" title="Apagar sessão">';
            html += (window.SmartCodeIcons ? SmartCodeIcons.trash : '&times;');
            html += '</button>';
            html += '<span class="mcp-session-time">' + escapeHtml(ago) + '</span>';
            html += '</div>';
        }

        if (diagrams.length === 0) {
            html += '<div class="mcp-session-nofiles">Nenhum diagrama ainda</div>';
        } else {
            diagrams.forEach(function(d) {
                var isCurrentFile = d.filePath === (window.SmartCodeFileTree ? SmartCodeFileTree.getCurrentFile() : '');
                html += '<div class="mcp-session-file ' + (isCurrentFile ? 'active' : '') + '" data-action="load-session-file" data-path="' + escapeHtml(d.filePath) + '">';
                html += '<span class="mcp-session-file-icon">' + (window.SmartCodeIcons ? SmartCodeIcons.file : '') + '</span>';
                html += '<span class="mcp-session-file-name">' + escapeHtml(prettyName(d.filePath)) + '</span>';
                html += '</div>';
            });
        }
        html += '</div>';
        return html;
    }

    // ── Render sessions view ──

    function renderSessionsView() {
        var container = document.getElementById('fileTree');
        if (!container) return;

        // Sort by startedAt desc (most recent first), depois separa vazias
        var sorted = sessionsData.slice().sort(function(a, b) { return b.startedAt - a.startedAt; });
        var withDiagrams = sorted.filter(function(s) { return !isEmptySession(s); });
        var empties = sorted.filter(isEmptySession);

        // Estado totalmente vazio: nenhuma sessão (ou só vazias e toggle off)
        if (withDiagrams.length === 0 && (empties.length === 0 || !showEmpty)) {
            var html0 =
                '<div class="mcp-sessions-empty">' +
                    '<div class="mcp-sessions-empty-icon">' + (window.SmartCodeIcons ? SmartCodeIcons.eye : '') + '</div>' +
                    '<div>Nenhuma sessão de IA ativa</div>' +
                    '<div style="font-size:11px;margin-top:4px;color:var(--text-tertiary)">Inicie uma sessão MCP com o Claude para ver os diagramas agrupados aqui</div>' +
                '</div>';
            // Mesmo no estado vazio, oferece o toggle se houver sessões vazias ocultas
            html0 += renderEmptyToggle(empties.length);
            container.innerHTML = html0;
            return;
        }

        var html = '';
        withDiagrams.forEach(function(session) { html += renderSessionCard(session); });

        // Toggle discreto + sessões vazias (só quando revelado)
        html += renderEmptyToggle(empties.length);
        if (showEmpty) {
            empties.forEach(function(session) { html += renderSessionCard(session); });
        }

        // Safe: all dynamic values pass through escapeHtml() above
        container.innerHTML = html;
    }

    // Linha discreta de toggle. Retorna '' se não houver sessões vazias.
    function renderEmptyToggle(emptyCount) {
        if (!emptyCount) return '';
        var label = (showEmpty ? 'ocultar vazias (' : 'mostrar vazias (') + emptyCount + ')';
        return '<button class="mcp-session-empty-toggle" data-action="toggle-empty">' + escapeHtml(label) + '</button>';
    }

    // ── View mode switching ──

    function setViewMode(mode) {
        viewMode = mode;

        // Update tab styling
        var tabFiles = document.getElementById('tabFiles');
        var tabSessions = document.getElementById('tabSessions');
        if (tabFiles) tabFiles.classList.toggle('active', mode === 'files');
        if (tabSessions) tabSessions.classList.toggle('active', mode === 'sessions');

        if (mode === 'sessions') {
            fetchSessions();
        } else {
            SmartCodeFileTree.refreshFileList();
        }
    }

    function getViewMode() { return viewMode; }

    // ── Event delegation ──

    function handleClick(e) {
        // Toggle "mostrar/ocultar vazias"
        var toggleBtn = e.target.closest('[data-action="toggle-empty"]');
        if (toggleBtn) {
            e.stopPropagation();
            showEmpty = !showEmpty;
            renderSessionsView();
            return;
        }

        // Abrir mini-confirm de exclusão
        var askBtn = e.target.closest('[data-action="ask-delete"]');
        if (askBtn) {
            e.stopPropagation();
            pendingDeleteId = askBtn.getAttribute('data-session-id');
            renderSessionsView();
            return;
        }

        // Cancelar mini-confirm
        var cancelBtn = e.target.closest('[data-action="cancel-delete"]');
        if (cancelBtn) {
            e.stopPropagation();
            pendingDeleteId = null;
            renderSessionsView();
            return;
        }

        // Confirmar exclusão
        var confirmBtn = e.target.closest('[data-action="confirm-delete"]');
        if (confirmBtn) {
            e.stopPropagation();
            deleteSession(confirmBtn.getAttribute('data-session-id'));
            return;
        }

        // Rename session
        var renameBtn = e.target.closest('[data-action="rename-session"]');
        if (renameBtn) {
            e.stopPropagation();
            var sessionId = renameBtn.getAttribute('data-session-id');
            var currentLabel = renameBtn.getAttribute('data-current-label');
            if (window.SmartCodeModal) {
                SmartCodeModal.prompt({
                    title: 'Renomear Sessão',
                    placeholder: 'Nome da sessão',
                    defaultValue: currentLabel || '',
                    onConfirm: function(val) {
                        renameSession(sessionId, val);
                    },
                });
            }
            return;
        }

        // Load session file
        var target = e.target.closest('[data-action="load-session-file"]');
        if (!target) return;
        var path = target.getAttribute('data-path');
        if (path && window.SmartCodeFileTree) {
            SmartCodeFileTree.loadFile(path);
            // Re-render to update active state
            if (viewMode === 'sessions') {
                setTimeout(renderSessionsView, 50);
            }
        }
    }

    // ── Init ──

    function init() {
        var container = document.getElementById('fileTree');
        if (container) {
            container.addEventListener('click', handleClick);
        }
    }

    function refresh() {
        if (viewMode === 'sessions') {
            fetchSessions();
        }
    }

    // ── Public API ──
    window.SmartCodeMcpSessions = {
        init: init,
        refresh: refresh,
        fetchSessions: fetchSessions,
        setViewMode: setViewMode,
        getViewMode: getViewMode,
        renderSessionsView: renderSessionsView,
    };
})();
