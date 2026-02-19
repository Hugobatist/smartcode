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
    var currentFile = '';
    var lastContent = '';
    var treeData = [];
    var initialLoadDone = false;
    var collapsedFolders = new Set(JSON.parse(localStorage.getItem('smartb-collapsed') || '[]'));

    // Centralized setter -- keeps window.currentFile in sync
    function setFile(path) {
        currentFile = path;
        window.currentFile = path;
    }

    // Initial sync
    window.currentFile = currentFile;

    /** Collect all file paths from nested tree data */
    function collectFilePaths(nodes) {
        var paths = [];
        for (var i = 0; i < nodes.length; i++) {
            if (nodes[i].type === 'file') paths.push(nodes[i].path);
            else if (nodes[i].children) paths = paths.concat(collectFilePaths(nodes[i].children));
        }
        return paths;
    }

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

    // ── URL helper ──
    function bUrl(path) { return (window.SmartBBaseUrl || '') + path; }

    // ── Tree rendering ──
    function refreshFileList() {
        fetch(bUrl('/tree.json?t=' + Date.now()))
            .then(function(resp) {
                if (resp.ok) return resp.json();
                return null;
            })
            .then(function(data) {
                if (data) treeData = data;
                renderTree();
                // On first load, auto-select first available file if current doesn't exist
                if (!initialLoadDone && data) {
                    initialLoadDone = true;
                    var allFiles = collectFilePaths(data);
                    if (allFiles.length > 0 && (!currentFile || allFiles.indexOf(currentFile) === -1)) {
                        loadFile(allFiles[0]);
                    } else if (currentFile && allFiles.indexOf(currentFile) !== -1) {
                        syncFile();
                    }
                }
            })
            .catch(function() {
                renderTree();
            });
    }

    function renderTree() {
        // Skip rendering if MCP Sessions view is active
        if (window.SmartBMcpSessions && SmartBMcpSessions.getViewMode() === 'sessions') return;
        var container = document.getElementById('fileTree');
        // Safe: all dynamic values pass through escapeHtml() — see renderNodes()
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
                        '<span class="tree-chevron ' + (isOpen ? 'open' : '') + '">' + SmartBIcons.chevronRight + '</span>' +
                        '<span class="tree-folder-icon">' + (isOpen ? SmartBIcons.folderOpen : SmartBIcons.folder) + '</span>' +
                        '<span class="tree-folder-name">' + escapeHtml(prettyFolder(n.name)) + '</span>' +
                        '<span class="tree-folder-count">' + count + '</span>' +
                        '<span class="tree-folder-actions">' +
                            '<button class="rename-btn" data-action="rename-folder" data-folder="' + escapeHtml(n.name) + '" title="Rename Folder">' + SmartBIcons.edit + '</button>' +
                            '<button class="delete-btn" data-action="delete-folder" data-folder="' + escapeHtml(n.name) + '" title="Delete Folder">' + SmartBIcons.trash + '</button>' +
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
                    '<span class="tree-file-icon">' + SmartBIcons.file + '</span>' +
                    '<span class="tree-file-name" title="' + escapeHtml(filePath) + '">' + escapeHtml(prettyName(n.name)) + '</span>' +
                    '<span class="tree-file-actions">' +
                        '<button class="rename-btn" data-action="rename-file" data-path="' + escapeHtml(filePath) + '" title="Rename">' + SmartBIcons.edit + '</button>' +
                        '<button class="delete-btn" data-action="delete-file" data-path="' + escapeHtml(filePath) + '" title="Delete">' + SmartBIcons.trash + '</button>' +
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
        setFile(path);
        document.getElementById('currentFileName').textContent = prettyName(path);
        lastContent = '';
        SmartBRenderer.setInitialRender(true);
        syncFile();
        renderTree();

        // Reset ghost path user-hide tracking on file switch
        if (window.SmartBGhostPaths) SmartBGhostPaths.resetUserHide();

        // Flush and reset interaction tracker for new file
        if (window.SmartBInteractionTracker) SmartBInteractionTracker.resetForFile();

        // Fetch overlay data for the new file (ghost paths, heatmap, sessions)
        var encoded = encodeURIComponent(path);
        if (window.SmartBGhostPaths) {
            fetch(bUrl('/api/ghost-paths/' + encoded))
                .then(function(r) { return r.ok ? r.json() : null; })
                .then(function(d) { if (d) SmartBGhostPaths.updateGhostPaths(path, d.ghostPaths || []); })
                .catch(function() {});
        }
        if (window.SmartBHeatmap) {
            fetch(bUrl('/api/heatmap/' + encoded))
                .then(function(r) { return r.ok ? r.json() : null; })
                .then(function(d) { if (d) SmartBHeatmap.updateVisitCounts(d); })
                .catch(function() {});
        }
        if (window.SmartBSessionPlayer) {
            SmartBSessionPlayer.fetchSessionList(path);
        }
    }

    // ── File sync via fetch ──
    function syncFile() {
        var editor = document.getElementById('editor');
        fetch(bUrl('/' + currentFile + '?t=' + Date.now()))
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
                        SmartBAnnotations.getState().ghosts = incoming.ghosts || [];
                        if (window.SmartBGhostPaths) SmartBGhostPaths.updateGhostPaths(currentFile, incoming.ghosts || []);
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
        SmartBModal.prompt({
            title: 'New Diagram',
            placeholder: 'diagram-name (use folder/name for subfolders)',
            onConfirm: function(name) {
                var fname = name.replace(/[^a-z0-9-_/]/gi, '-').toLowerCase().replace(/^\/|\/$/g, '') + '.mmd';
                var editor = document.getElementById('editor');
                editor.value = 'flowchart LR\n    A["Start"] --> B["End"]';
                setFile(fname);
                lastContent = editor.value;
                saveCurrentFile();
                render(editor.value);
                document.getElementById('currentFileName').textContent = prettyName(fname);
            },
        });
    }

    function createNewFolder() {
        SmartBModal.prompt({
            title: 'New Folder',
            placeholder: 'folder-name',
            onConfirm: function(name) {
                var safe = name.replace(/[^a-z0-9-_/]/gi, '-').toLowerCase();
                fetch(bUrl('/mkdir'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ folder: safe }),
                }).then(function() {
                    if (window.toast) toast('Folder created: ' + safe);
                    refreshFileList();
                });
            },
        });
    }

    function saveCurrentFile() {
        var editor = document.getElementById('editor');
        var content = editor.value;
        if (!content.trim()) { if (window.toast) toast('Nothing to save'); return; }
        fetch(bUrl('/save'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: currentFile, content: content }),
        }).then(function(resp) {
            if (resp.ok) {
                if (window.toast) toast('Saved: ' + currentFile);
                lastContent = content;
                refreshFileList();
                if (window.SmartBEventBus) {
                    SmartBEventBus.emit('file:saved', { path: currentFile });
                }
            } else {
                if (window.toast) toast('Error saving');
            }
        }).catch(function() {
            if (window.toast) toast('Error: server offline?');
        });
    }

    function deleteFile(fpath) {
        SmartBModal.confirm({
            title: 'Delete Diagram',
            message: 'Delete ' + prettyName(fpath) + '?',
            danger: true,
            onConfirm: function() {
                fetch(bUrl('/delete'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filename: fpath }),
                }).then(function() {
                    if (window.toast) toast('Deleted');
                    if (currentFile === fpath) {
                        setFile('');
                        document.getElementById('currentFileName').textContent = '';
                        var editor = document.getElementById('editor');
                        editor.value = '';
                        lastContent = '';
                    }
                    refreshFileList();
                }).catch(function() {
                    if (window.toast) toast('Error deleting file');
                });
            },
        });
    }

    function renameFile(oldPath) {
        var parts = oldPath.split('/');
        var base = parts.pop().replace('.mmd', '');
        var folder = parts.join('/');
        SmartBModal.prompt({
            title: 'Rename Diagram',
            placeholder: 'New name',
            defaultValue: base,
            onConfirm: function(newBase) {
                if (newBase === base) return;
                var safeName = newBase.replace(/[^a-z0-9-_]/gi, '-').toLowerCase() + '.mmd';
                var newPath = folder ? folder + '/' + safeName : safeName;
                fetch(bUrl('/move'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ from: oldPath, to: newPath }),
                }).then(function() {
                    if (currentFile === oldPath) {
                        setFile(newPath);
                        document.getElementById('currentFileName').textContent = prettyName(newPath);
                    }
                    refreshFileList();
                    if (window.toast) toast('Renamed');
                });
            },
        });
    }

    function renameFolder(oldName) {
        var displayName = prettyFolder(oldName);
        SmartBModal.prompt({
            title: 'Rename Folder',
            placeholder: 'New folder name',
            defaultValue: displayName,
            onConfirm: function(newName) {
                if (newName === displayName) return;
                var safeName = newName.replace(/[^a-z0-9-_]/gi, '-').toLowerCase();
                fetch(bUrl('/move'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ from: oldName, to: safeName }),
                }).then(function() {
                    if (currentFile.startsWith(oldName + '/')) {
                        var newPath = currentFile.replace(oldName + '/', safeName + '/');
                        setFile(newPath);
                        document.getElementById('currentFileName').textContent = prettyName(newPath);
                    }
                    if (collapsedFolders.has(oldName)) {
                        collapsedFolders.delete(oldName);
                        collapsedFolders.add(safeName);
                        saveCollapsed();
                    }
                    refreshFileList();
                    if (window.toast) toast('Folder renamed');
                }).catch(function() {
                    if (window.toast) toast('Error renaming folder');
                });
            },
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
        var msg = 'Delete folder "' + prettyFolder(folderName) + '"';
        if (count > 0) msg += ' with ' + count + ' file' + (count > 1 ? 's' : '') + '.';
        else msg += ' (empty).';
        msg += '\nThis action cannot be undone.';
        SmartBModal.confirm({
            title: 'Delete Folder',
            message: msg,
            danger: true,
            onConfirm: function() {
                fetch(bUrl('/rmdir'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ folder: folderName }),
                }).then(function() {
                    if (currentFile.startsWith(folderName + '/')) {
                        setFile('');
                        document.getElementById('currentFileName').textContent = '';
                        document.getElementById('editor').value = '';
                        lastContent = '';
                    }
                    collapsedFolders.delete(folderName);
                    saveCollapsed();
                    refreshFileList();
                    if (window.toast) toast('Folder deleted');
                }).catch(function() {
                    if (window.toast) toast('Error deleting folder');
                });
            },
        });
    }

    // ── Public API ──
    window.SmartBFileTree = {
        refreshFileList: refreshFileList,
        loadFile: loadFile,
        syncFile: syncFile,
        getCurrentFile: function() { return currentFile; },
        setCurrentFile: function(p) { setFile(p); },
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
