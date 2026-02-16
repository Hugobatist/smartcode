/**
 * SmartB File Tree -- file tree rendering, CRUD operations, file loading.
 * Extracted from live.html (Phase 9 Plan 03).
 *
 * Dependencies: renderer.js (SmartBRenderer), event-bus.js (SmartBEventBus)
 * Dependents: app-init.js, editor-panel.js, annotations.js
 *
 * Note: innerHTML usage is safe here -- all dynamic values pass through
 * SmartBRenderer.escapeHtml() before interpolation, preventing XSS.
 *
 * Usage:
 *   SmartBFileTree.refreshFileList();
 *   SmartBFileTree.loadFile(path);
 *   SmartBFileTree.syncFile();
 *   SmartBFileTree.getCurrentFile();
 *   SmartBFileTree.setCurrentFile(path);
 *   SmartBFileTree.getLastContent();
 *   SmartBFileTree.setLastContent(v);
 *   SmartBFileTree.saveCurrentFile();
 *   SmartBFileTree.createNewFile();
 *   SmartBFileTree.createNewFolder();
 *   SmartBFileTree.deleteFile(path);
 *   SmartBFileTree.renameFile(path);
 */
(function() {
    'use strict';

    // ── State ──
    var currentFile = 'diagram.mmd';
    var lastContent = '';
    var treeData = [];
    var collapsedFolders = new Set(JSON.parse(localStorage.getItem('smartb-collapsed') || '[]'));

    // Keep window.currentFile in sync for cross-module access
    window.currentFile = currentFile;

    function saveCollapsed() {
        localStorage.setItem('smartb-collapsed', JSON.stringify([...collapsedFolders]));
    }

    // ── Display helpers ──
    function prettyName(fname) {
        var base = fname.includes('/') ? fname.split('/').pop() : fname;
        return base.replace('.mmd', '').replace(/-/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
    }

    function prettyFolder(name) {
        return name.replace(/-/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
    }

    function countFiles(node) {
        if (node.type === 'file') return 1;
        return (node.children || []).reduce(function(s, c) { return s + countFiles(c); }, 0);
    }

    // ── Tree rendering ──
    function refreshFileList() {
        fetch('tree.json?t=' + Date.now())
            .then(function(resp) {
                if (resp.ok) return resp.json();
                return null;
            })
            .then(function(data) {
                if (data) treeData = data;
                renderTree();
            })
            .catch(function() {
                renderTree();
            });
    }

    function renderTree() {
        var container = document.getElementById('fileTree');
        // Safe: all dynamic values are escaped via escapeHtml before interpolation
        if (container) container.innerHTML = renderNodes(treeData, 0);
    }

    function renderNodes(nodes, depth) {
        return nodes.map(function(n) {
            if (n.type === 'folder') {
                var isOpen = !collapsedFolders.has(n.name);
                var count = countFiles(n);
                var pad = 8 + depth * 16;
                return '<div class="tree-folder">' +
                    '<div class="tree-folder-header" style="padding-left:' + pad + 'px" data-action="toggle-folder" data-folder="' + escapeHtml(n.name) + '">' +
                        '<span class="tree-chevron ' + (isOpen ? 'open' : '') + '">&#x25B6;</span>' +
                        '<span class="tree-folder-icon">' + (isOpen ? '&#x1F4C2;' : '&#x1F4C1;') + '</span>' +
                        '<span class="tree-folder-name">' + escapeHtml(prettyFolder(n.name)) + '</span>' +
                        '<span class="tree-folder-count">' + count + '</span>' +
                        '<span class="tree-folder-actions">' +
                            '<button class="rename-btn" data-action="rename-folder" data-folder="' + escapeHtml(n.name) + '" title="Renomear Pasta">&#x270E;</button>' +
                            '<button class="delete-btn" data-action="delete-folder" data-folder="' + escapeHtml(n.name) + '" title="Deletar Pasta">&#x2715;</button>' +
                        '</span>' +
                    '</div>' +
                    '<div class="tree-children ' + (isOpen ? '' : 'collapsed') + '">' +
                        renderNodes(n.children || [], depth + 1) +
                    '</div>' +
                '</div>';
            } else {
                var filePad = 8 + depth * 16;
                var filePath = n.path;
                var isActive = filePath === currentFile;
                return '<div class="tree-file ' + (isActive ? 'active' : '') + '" style="padding-left:' + filePad + 'px" data-action="load-file" data-path="' + escapeHtml(filePath) + '">' +
                    '<span class="tree-file-icon">&#x25C8;</span>' +
                    '<span class="tree-file-name" title="' + escapeHtml(filePath) + '">' + escapeHtml(prettyName(n.name)) + '</span>' +
                    '<span class="tree-file-actions">' +
                        '<button class="rename-btn" data-action="rename-file" data-path="' + escapeHtml(filePath) + '" title="Renomear">&#x270E;</button>' +
                        '<button class="delete-btn" data-action="delete-file" data-path="' + escapeHtml(filePath) + '" title="Deletar">&#x2715;</button>' +
                    '</span>' +
                '</div>';
            }
        }).join('');
    }

    // ── Event delegation for file tree ──
    document.getElementById('fileTree').addEventListener('click', function(e) {
        var target = e.target.closest('[data-action]');
        if (!target) return;
        var action = target.dataset.action;
        var actionPath = target.dataset.path;
        var folder = target.dataset.folder;
        switch (action) {
            case 'toggle-folder':
                toggleFolder(folder);
                break;
            case 'load-file':
                loadFile(actionPath);
                break;
            case 'rename-file':
                e.stopPropagation();
                renameFile(actionPath);
                break;
            case 'delete-file':
                e.stopPropagation();
                deleteFile(actionPath);
                break;
            case 'rename-folder':
                e.stopPropagation();
                renameFolder(folder);
                break;
            case 'delete-folder':
                e.stopPropagation();
                deleteFolder(folder);
                break;
        }
    });

    function toggleFolder(name) {
        if (collapsedFolders.has(name)) collapsedFolders.delete(name);
        else collapsedFolders.add(name);
        saveCollapsed();
        renderTree();
    }

    // ── File loading ──
    function loadFile(path) {
        // Clear undo/redo history when switching files
        if (window.SmartBCommandHistory) SmartBCommandHistory.clear();
        currentFile = path;
        window.currentFile = path;
        document.getElementById('currentFileName').textContent = prettyName(path);
        lastContent = '';
        SmartBRenderer.setInitialRender(true);
        syncFile();
        renderTree();
    }

    // ── File sync via fetch ──
    function syncFile() {
        var editor = document.getElementById('editor');
        fetch(currentFile + '?t=' + Date.now())
            .then(function(resp) {
                if (!resp.ok) throw new Error('not ok');
                return resp.text();
            })
            .then(function(text) {
                if (text !== lastContent) {
                    // Merge: preserve user flags when Claude edits arrive
                    if (window.SmartBAnnotations && SmartBAnnotations.getState().flags.size > 0) {
                        text = SmartBAnnotations.mergeIncomingContent(text);
                    } else if (window.SmartBAnnotations) {
                        var incoming = SmartBAnnotations.parseAnnotations(text);
                        SmartBAnnotations.getState().flags = incoming.flags;
                        SmartBAnnotations.getState().statuses = incoming.statuses;
                        SmartBAnnotations.renderPanel();
                        SmartBAnnotations.updateBadge();
                    }
                    lastContent = text;
                    editor.value = text;
                    render(text);
                    if (window.toast) toast('Atualizado');
                }
            })
            .catch(function() {});
    }

    // ── File CRUD ──
    function createNewFile() {
        var name = prompt('Nome do diagrama (sem extensao).\nUse pasta/nome para criar dentro de pasta:');
        if (!name) return;
        var fname = name.replace(/[^a-z0-9-_/]/gi, '-').toLowerCase().replace(/^\/|\/$/g, '') + '.mmd';
        var editor = document.getElementById('editor');
        editor.value = 'flowchart LR\n    A["Inicio"] --> B["Fim"]';
        currentFile = fname;
        window.currentFile = fname;
        lastContent = editor.value;
        saveCurrentFile();
        render(editor.value);
        document.getElementById('currentFileName').textContent = prettyName(fname);
    }

    function createNewFolder() {
        var name = prompt('Nome da pasta:');
        if (!name) return;
        var safe = name.replace(/[^a-z0-9-_/]/gi, '-').toLowerCase();
        fetch('/mkdir', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folder: safe }),
        }).then(function() {
            if (window.toast) toast('Pasta criada: ' + safe);
            refreshFileList();
        });
    }

    function saveCurrentFile() {
        var editor = document.getElementById('editor');
        var content = editor.value;
        if (!content.trim()) { if (window.toast) toast('Nada para salvar'); return; }
        fetch('/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: currentFile, content: content }),
        }).then(function(resp) {
            if (resp.ok) {
                if (window.toast) toast('Salvo: ' + currentFile);
                lastContent = content;
                refreshFileList();
                if (window.SmartBEventBus) {
                    SmartBEventBus.emit('file:saved', { path: currentFile });
                }
            } else {
                if (window.toast) toast('Erro ao salvar');
            }
        }).catch(function() {
            if (window.toast) toast('Erro: servidor offline?');
        });
    }

    function deleteFile(fpath) {
        if (!confirm('Deletar ' + prettyName(fpath) + '?')) return;
        fetch('/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: fpath }),
        }).then(function() {
            if (window.toast) toast('Deletado');
            if (currentFile === fpath) {
                currentFile = '';
                window.currentFile = '';
                document.getElementById('currentFileName').textContent = '';
                var editor = document.getElementById('editor');
                editor.value = '';
                lastContent = '';
            }
            refreshFileList();
        }).catch(function() {
            if (window.toast) toast('Erro ao deletar');
        });
    }

    function renameFile(oldPath) {
        var parts = oldPath.split('/');
        var base = parts.pop().replace('.mmd', '');
        var folder = parts.join('/');
        var newBase = prompt('Novo nome:', base);
        if (!newBase || newBase === base) return;
        var safeName = newBase.replace(/[^a-z0-9-_]/gi, '-').toLowerCase() + '.mmd';
        var newPath = folder ? folder + '/' + safeName : safeName;
        fetch('/move', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: oldPath, to: newPath }),
        }).then(function() {
            if (currentFile === oldPath) {
                currentFile = newPath;
                window.currentFile = newPath;
                document.getElementById('currentFileName').textContent = prettyName(newPath);
            }
            refreshFileList();
            if (window.toast) toast('Renomeado');
        });
    }

    function renameFolder(oldName) {
        var displayName = prettyFolder(oldName);
        var newName = prompt('Novo nome da pasta:', displayName);
        if (!newName || newName === displayName) return;
        var safeName = newName.replace(/[^a-z0-9-_]/gi, '-').toLowerCase();
        fetch('/move', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: oldName, to: safeName }),
        }).then(function() {
            // If current file is inside the renamed folder, update its path
            if (currentFile.startsWith(oldName + '/')) {
                var newPath = currentFile.replace(oldName + '/', safeName + '/');
                currentFile = newPath;
                window.currentFile = newPath;
                document.getElementById('currentFileName').textContent = prettyName(newPath);
            }
            // Update collapsed folders set
            if (collapsedFolders.has(oldName)) {
                collapsedFolders.delete(oldName);
                collapsedFolders.add(safeName);
                saveCollapsed();
            }
            refreshFileList();
            if (window.toast) toast('Pasta renomeada');
        }).catch(function() {
            if (window.toast) toast('Erro ao renomear pasta');
        });
    }

    function deleteFolder(folderName) {
        var count = 0;
        // Count files in folder from tree data
        function countInFolder(nodes) {
            for (var i = 0; i < nodes.length; i++) {
                if (nodes[i].type === 'folder' && nodes[i].name === folderName) {
                    count = countFiles(nodes[i]);
                    return;
                }
                if (nodes[i].children) countInFolder(nodes[i].children);
            }
        }
        countInFolder(treeData);
        var msg = 'Deletar pasta "' + prettyFolder(folderName) + '"';
        if (count > 0) msg += ' com ' + count + ' arquivo' + (count > 1 ? 's' : '') + '?';
        else msg += ' (vazia)?';
        msg += '\nEsta acao nao pode ser desfeita.';
        if (!confirm(msg)) return;
        fetch('/rmdir', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folder: folderName }),
        }).then(function() {
            // If current file was inside deleted folder, clear it
            if (currentFile.startsWith(folderName + '/')) {
                currentFile = '';
                window.currentFile = '';
                document.getElementById('currentFileName').textContent = '';
                document.getElementById('editor').value = '';
                lastContent = '';
            }
            collapsedFolders.delete(folderName);
            saveCollapsed();
            refreshFileList();
            if (window.toast) toast('Pasta deletada');
        }).catch(function() {
            if (window.toast) toast('Erro ao deletar pasta');
        });
    }

    // ── Public API ──
    window.SmartBFileTree = {
        refreshFileList: refreshFileList,
        loadFile: loadFile,
        syncFile: syncFile,
        getCurrentFile: function() { return currentFile; },
        setCurrentFile: function(p) { currentFile = p; window.currentFile = p; },
        getLastContent: function() { return lastContent; },
        setLastContent: function(v) { lastContent = v; },
        createNewFile: createNewFile,
        createNewFolder: createNewFolder,
        saveCurrentFile: saveCurrentFile,
        deleteFile: deleteFile,
        renameFile: renameFile,
        renameFolder: renameFolder,
        deleteFolder: deleteFolder,
        prettyName: prettyName,
    };

    // Backward compat
    window.refreshFileList = refreshFileList;
    window.saveCurrentFile = saveCurrentFile;
    window.createNewFile = createNewFile;
    window.createNewFolder = createNewFolder;
})();
