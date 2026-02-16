# Phase 14: Undo/Redo + Edit Actions - Research

**Researched:** 2026-02-15
**Domain:** Command pattern, clipboard operations, file tree CRUD, vanilla JS state management
**Confidence:** HIGH

## Summary

Phase 14 builds the command infrastructure that makes all diagram edit operations reversible and adds clipboard operations (copy/paste/duplicate via keyboard). The codebase already has a primitive undo stack in `diagram-editor.js` (lines 411-435) that stores raw content strings and pops them on Ctrl+Z. This needs to be replaced with a proper Command pattern implementation that supports both undo AND redo, tracks only user-initiated actions (not AI/filesystem changes arriving via WebSocket), and caps history at 100 entries.

The current `applyEdit()` function in `diagram-editor.js` is the single gateway for all user edits -- every edit flows through it (add node, remove node, edit text, duplicate, inline edit, etc.). This is the natural interception point for the command system. Copy/paste requires a clipboard abstraction that stores serialized node data and can paste with offset positions and new IDs. Finally, the file tree needs folder rename and folder delete operations, which require new server-side endpoints (`POST /rmdir` for recursive delete, and extending `/move` to work on directories).

**Primary recommendation:** Create a `command-history.js` module (~200 lines) implementing the Command pattern with undo/redo stacks, refactor `applyEdit()` in `diagram-editor.js` to push commands instead of raw content snapshots, create a `clipboard.js` module (~150 lines) for copy/paste/duplicate keyboard shortcuts, add folder CRUD operations to `file-tree.js` with corresponding server endpoints, and wire keyboard shortcuts (Ctrl+Z, Ctrl+Shift+Z, Ctrl+C, Ctrl+V, Ctrl+D) in `app-init.js`.

## Standard Stack

### Core

No new external libraries needed. Everything is built with vanilla JS on existing abstractions.

| Component | Purpose | Why Standard |
|-----------|---------|--------------|
| Command pattern (vanilla JS) | Reversible edit operations with undo/redo | Classic GoF pattern; well-suited for text-based editing where each command is a content snapshot |
| Content-snapshot commands | Store before/after .mmd content per edit | Simpler than fine-grained operation commands; `applyEdit()` already strips/re-injects annotations, making content snapshots reliable |
| Vanilla JS clipboard object | Internal copy/paste buffer for node data | Browser Clipboard API (navigator.clipboard) requires HTTPS and user gesture; internal buffer is more reliable for diagram data |
| Node.js `fs.rm()` | Recursive directory deletion | Standard Node.js API for `rm -rf` equivalent |
| Node.js `fs.rename()` | Directory rename | Already imported in routes.ts; works on directories the same as files |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Content snapshots | Fine-grained operation commands (AddNodeCommand, RemoveNodeCommand, etc.) | Fine-grained commands require inverse operations for every edit type and must handle edge cases (annotation stripping, style lines). Content snapshots are simpler and already proven via existing `undoStack` |
| Internal clipboard buffer | Browser Clipboard API (`navigator.clipboard.writeText()`) | Browser API requires HTTPS context or secure origin, needs user permission, and only handles text. Internal buffer gives full control over structured node data |
| Manual undo/redo stack | Library (immer patches, Y.js, Automerge) | These are designed for collaborative editing / CRDT. Our use case is single-user, single-file content edits -- a simple array-based stack is sufficient and adds zero dependencies |

**Installation:** None -- no new npm packages needed.

## Architecture Patterns

### Recommended Module Structure

```
static/
  command-history.js   # Command pattern: undo/redo stacks, execute/undo/redo API
  clipboard.js         # Copy/paste/duplicate: internal buffer, paste with offset + new IDs
  [modified] diagram-editor.js  # Refactored applyEdit() to push commands to history
  [modified] file-tree.js       # Added folder rename/delete with context menu
  [modified] app-init.js        # Keyboard shortcuts: Ctrl+Z, Ctrl+Shift+Z, Ctrl+C/V/D
  [modified] live.html          # Script tags for 2 new modules

src/server/
  [modified] routes.ts          # POST /rmdir endpoint for folder deletion
```

### Pattern 1: Content-Snapshot Command Pattern

**What:** Each user edit is wrapped as a command object with `{ before, after, description }` content snapshots. The `before` snapshot is the editor content BEFORE the edit; `after` is the content AFTER. Undo restores `before`; redo restores `after`.

**When to use:** Every call to `applyEdit()` in `diagram-editor.js`.

**Why content snapshots over operation-based commands:**
The existing `applyEdit()` function already handles a complex pipeline: strip annotations, apply edit function, re-inject annotations, save, re-render. Each edit function (addNode, removeNode, editNodeText, etc.) is a pure function `(content) => content`. Storing before/after content snapshots at the `applyEdit()` level captures the complete state change without needing to implement inverse operations for every edit type.

**Example:**
```javascript
// command-history.js
(function() {
    'use strict';

    var undoStack = [];
    var redoStack = [];
    var MAX_HISTORY = 100;

    function execute(command) {
        undoStack.push(command);
        if (undoStack.length > MAX_HISTORY) undoStack.shift();
        // Clear redo stack on new edit (standard behavior)
        redoStack.length = 0;
    }

    function undo() {
        if (undoStack.length === 0) return null;
        var cmd = undoStack.pop();
        redoStack.push(cmd);
        return cmd.before;
    }

    function redo() {
        if (redoStack.length === 0) return null;
        var cmd = redoStack.pop();
        undoStack.push(cmd);
        return cmd.after;
    }

    function canUndo() { return undoStack.length > 0; }
    function canRedo() { return redoStack.length > 0; }
    function clear() { undoStack.length = 0; redoStack.length = 0; }

    window.SmartBCommandHistory = {
        execute: execute,
        undo: undo,
        redo: redo,
        canUndo: canUndo,
        canRedo: canRedo,
        clear: clear,
        getUndoCount: function() { return undoStack.length; },
        getRedoCount: function() { return redoStack.length; },
    };
})();
```

### Pattern 2: Clipboard Buffer for Node Operations

**What:** An internal clipboard object that stores serialized node data (node ID, label, shape type, edges) when the user copies (Ctrl+C) and can generate new nodes with fresh IDs and offset positions when pasting (Ctrl+V).

**When to use:** Ctrl+C copies selected node data to buffer; Ctrl+V reads buffer and creates new nodes; Ctrl+D duplicates in-place (copy + immediate paste at same position).

**Key design:**
- Clipboard stores node metadata, not raw .mmd lines, to enable ID regeneration on paste
- Paste generates new IDs via `MmdEditor.generateNodeId()` and appends " (copy)" to labels
- Ctrl+D is shorthand for copy-then-paste-in-place (uses existing `MmdEditor.duplicateNode()`)
- Only works when a node is selected (check `SmartBSelection.getSelected()`)

**Example:**
```javascript
// clipboard.js
(function() {
    'use strict';

    var buffer = null; // { nodeId, label, shape }

    function copy() {
        var sel = SmartBSelection.getSelected();
        if (!sel || sel.type !== 'node') return false;
        var editor = document.getElementById('editor');
        if (!editor) return false;
        var label = MmdEditor.getNodeText(editor.value, sel.id);
        buffer = { nodeId: sel.id, label: label };
        return true;
    }

    function paste() {
        if (!buffer) return false;
        MmdEditor.applyEdit(function(c) {
            var newId = MmdEditor.generateNodeId(c);
            return MmdEditor.addNode(c, newId, buffer.label + ' (copy)');
        });
        return true;
    }

    function duplicate() {
        var sel = SmartBSelection.getSelected();
        if (!sel || sel.type !== 'node') return false;
        MmdEditor.applyEdit(function(c) {
            return MmdEditor.duplicateNode(c, sel.id);
        });
        return true;
    }

    function hasContent() { return buffer !== null; }

    window.SmartBClipboard = {
        copy: copy,
        paste: paste,
        duplicate: duplicate,
        hasContent: hasContent,
        clear: function() { buffer = null; },
    };
})();
```

### Pattern 3: Refactored applyEdit() Integration

**What:** The existing `applyEdit()` in `diagram-editor.js` is modified to push commands to `SmartBCommandHistory` instead of the primitive `undoStack`. The existing `undo()` function is replaced to use `SmartBCommandHistory.undo()`, and a new `redo()` function is added.

**Critical design decision:** `applyEdit()` captures the FULL editor content (including annotations) as `before`, applies the edit, then captures the result as `after`. This means undo/redo restores the exact editor state without needing to handle annotation stripping/re-injection separately.

**Example refactoring:**
```javascript
// Inside diagram-editor.js -- replace existing undoStack logic

async function applyEdit(editFn) {
    var editor = editorHooks.getEditor();
    if (!editor) return;

    var beforeContent = editor.value;  // Capture BEFORE state

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

    // Push command to history AFTER edit
    if (window.SmartBCommandHistory) {
        SmartBCommandHistory.execute({
            before: beforeContent,
            after: content,
            description: 'edit',
        });
    }

    if (editorHooks.saveFile) await editorHooks.saveFile();
    if (editorHooks.renderDiagram) await editorHooks.renderDiagram(content);

    if (window.SmartBEventBus) {
        SmartBEventBus.emit('diagram:edited', { source: 'diagram-editor' });
    }
}

async function undo() {
    if (!window.SmartBCommandHistory || !SmartBCommandHistory.canUndo()) {
        if (window.toast) window.toast('Nada para desfazer');
        return;
    }
    var content = SmartBCommandHistory.undo();
    var editor = editorHooks.getEditor();
    if (!editor || !content) return;
    editor.value = content;
    editorHooks.setLastContent(content);
    if (editorHooks.saveFile) await editorHooks.saveFile();
    if (editorHooks.renderDiagram) await editorHooks.renderDiagram(content);
    if (window.toast) window.toast('Desfeito (' + SmartBCommandHistory.getUndoCount() + ' restantes)');
}

async function redo() {
    if (!window.SmartBCommandHistory || !SmartBCommandHistory.canRedo()) {
        if (window.toast) window.toast('Nada para refazer');
        return;
    }
    var content = SmartBCommandHistory.redo();
    var editor = editorHooks.getEditor();
    if (!editor || !content) return;
    editor.value = content;
    editorHooks.setLastContent(content);
    if (editorHooks.saveFile) await editorHooks.saveFile();
    if (editorHooks.renderDiagram) await editorHooks.renderDiagram(content);
    if (window.toast) window.toast('Refeito (' + SmartBCommandHistory.getRedoCount() + ' restantes)');
}
```

### Pattern 4: Folder CRUD in File Tree

**What:** Add rename and delete actions to folder entries in the file tree sidebar, mirroring the existing file rename/delete pattern.

**Current state:**
- Files already have rename and delete buttons in the tree (data-action="rename-file" and "delete-file")
- Folders only have toggle-folder (expand/collapse)
- Server has POST `/move` (works for both files and directories via `fs.rename()`)
- Server has POST `/delete` (uses `fs.unlink()` which only works on files, NOT directories)

**What's needed:**
1. **Server: POST /rmdir** -- New endpoint using `fs.rm(path, { recursive: true })` to delete directories
2. **file-tree.js: renderNodes()** -- Add rename and delete buttons to folder headers (similar to file buttons)
3. **file-tree.js: deleteFolder()** -- New function calling POST /rmdir with confirmation dialog
4. **file-tree.js: renameFolder()** -- New function calling POST /move on the folder path
5. **file-tree.js: Event delegation** -- Handle new data-actions "rename-folder" and "delete-folder"

**Example server endpoint:**
```typescript
// routes.ts -- POST /rmdir
import { rm } from 'node:fs/promises';

routes.push({
    method: 'POST',
    pattern: new RegExp('^/rmdir$'),
    handler: async (req, res) => {
        const body = await readJsonBody<{ folder: string }>(req);
        if (!body.folder) { sendJson(res, { error: 'Missing folder' }, 400); return; }
        const resolved = resolveProjectPath(projectDir, body.folder);
        await rm(resolved, { recursive: true });
        sendJson(res, { ok: true });
    },
});
```

### Anti-Patterns to Avoid

- **Don't store undo snapshots for WebSocket-triggered updates.** The undo stack MUST only capture edits initiated through `applyEdit()`. WebSocket `file:changed` events update the editor directly (via `syncFile()` in `file-tree.js` and the WebSocket handler in `app-init.js`) without going through `applyEdit()`, so they naturally bypass the command history. Do NOT add undo tracking to the WebSocket handler.
- **Don't try to use the browser Clipboard API for copy/paste.** `navigator.clipboard` requires HTTPS and user gesture. The diagram runs on `http://localhost:3333`. Use an internal JS buffer instead.
- **Don't clear the redo stack on undo.** Standard undo/redo behavior: redo stack clears only when a NEW edit is performed, NOT when undoing. Undone commands move from undo to redo stack.
- **Don't store diff patches instead of full content.** The .mmd files are small (typically under 10KB). Storing 100 full content snapshots costs ~1MB max. The simplicity of full snapshots vastly outweighs the marginal memory savings of diff patches.
- **Don't modify the existing `undoStack` variable in diagram-editor.js.** Remove it entirely and delegate all history management to the new `SmartBCommandHistory` module. Having two undo mechanisms is a guaranteed bug source.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Undo/redo stack management | Custom linked list or complex data structure | Simple array with push/pop | Arrays are fast enough for 100 entries; no need for linked list |
| Node ID generation for paste | Custom counter or UUID | `MmdEditor.generateNodeId(content)` | Already handles collision avoidance by scanning existing IDs |
| Annotation stripping for undo | Manual regex in undo handler | Content snapshots from `applyEdit()` | Snapshots already include/exclude annotations correctly because `applyEdit()` handles the stripping/re-injection pipeline |
| File save after undo/redo | Direct fetch POST | `editorHooks.saveFile()` | Already wired in `diagram-editor.js init()` |
| Folder deletion on server | `fs.unlink()` for each file | `fs.rm(path, { recursive: true })` | Handles nested directories, empty checks, etc. |

**Key insight:** The command history module is a thin wrapper around two arrays. The complexity is in the integration points (applyEdit refactoring, keyboard wiring, WebSocket exclusion), not the data structure itself.

## Common Pitfalls

### Pitfall 1: Undo Restores Stale Annotation State

**What goes wrong:** User edits node label (undo snapshot includes old annotations). Then user adds a flag. Then user hits Ctrl+Z -- the undo restores the pre-edit content which also removes the recently-added flag.
**Why it happens:** Content snapshots include the full file content with annotations.
**How to avoid:** This is actually the CORRECT behavior -- undo should restore the complete editor state from before the edit. Flags added after the edit are part of the current state and would need their own undo entry if we tracked them. The success criteria states "undo stack only tracks user actions, not AI/filesystem changes" -- flag operations go through `SmartBAnnotations` (which calls `saveCurrentFile()` directly), NOT through `applyEdit()`. So flag additions are NOT in the undo stack. The only concern is if `applyEdit()` re-injects current flags into the content -- we need to snapshot BEFORE annotation re-injection to capture the raw edit state. **Solution:** Capture `beforeContent = editor.value` at the TOP of `applyEdit()`, before any annotation manipulation.
**Warning signs:** Flags appear/disappear unexpectedly when undoing.

### Pitfall 2: Redo Stack Not Cleared on New Edit

**What goes wrong:** User undoes twice, then makes a new edit. The redo stack still contains the two undone commands. If user tries to redo, they get unexpected state that doesn't account for the new edit.
**Why it happens:** Forgot to clear redo stack on new command execution.
**How to avoid:** In `SmartBCommandHistory.execute()`, always set `redoStack.length = 0`. This is standard undo/redo behavior in every text editor.
**Warning signs:** Redo produces content that conflicts with the most recent edit.

### Pitfall 3: Ctrl+C/V Conflict with Editor Textarea

**What goes wrong:** Ctrl+C copies the selected node AND the text selection in the editor panel. Or worse, Ctrl+V pastes both into the diagram and the textarea.
**Why it happens:** Keyboard events propagate to both the diagram shortcut handler and the textarea.
**How to avoid:** The existing keyboard handler in `app-init.js` (line 98) already returns early if `e.target === editor` (the textarea). The new Ctrl+C/V/D shortcuts MUST be inside this guarded block, so they only fire when focus is NOT on the editor textarea. Also check for `e.target.getAttribute('contenteditable')` to avoid conflicts with inline edit.
**Warning signs:** Copy/paste affects both diagram nodes and editor text simultaneously.

### Pitfall 4: Undo After WebSocket Update Restores Wrong State

**What goes wrong:** AI updates the .mmd file via MCP. WebSocket pushes the new content to the editor. User hits Ctrl+Z and gets the content from before the AI update, not from before their last edit.
**Why it happens:** If the WebSocket handler accidentally pushes to the undo stack.
**How to avoid:** WebSocket updates flow through `file-tree.js syncFile()` and the `file:changed` handler in `app-init.js` -- both update `editor.value` and `lastContent` directly, bypassing `applyEdit()`. Since the command history is only populated via `applyEdit()`, WebSocket updates naturally stay out of the undo stack. **However,** when undo restores content that is now different from what the AI wrote, the save will overwrite the AI's changes. This is correct behavior -- the user explicitly chose to undo their edit. But it could be surprising. Consider clearing the command history when a WebSocket update arrives (or at minimum, showing a toast warning).
**Warning signs:** Undo seems to "lose" AI-generated content.

### Pitfall 5: Folder Delete Without Confirmation

**What goes wrong:** User accidentally clicks delete on a folder containing 10 diagrams, losing all of them instantly.
**Why it happens:** No confirmation dialog before recursive delete.
**How to avoid:** Use `confirm()` dialog (same as existing file delete in `file-tree.js` line 237) with a message that includes the folder name and file count. Example: `"Deletar pasta 'workflow' com 10 arquivos? Esta acao nao pode ser desfeita."`
**Warning signs:** Files are lost without any warning.

### Pitfall 6: diagram-editor.js Exceeds 500 Lines

**What goes wrong:** Adding redo logic, modifying applyEdit, and removing the old undoStack pushes diagram-editor.js over 500 lines (currently at 485).
**Why it happens:** The file is already near the limit.
**How to avoid:** The new `command-history.js` module handles ALL undo/redo state management. In diagram-editor.js, the refactoring REMOVES the old `undoStack` array (lines 411-412), the old `MAX_UNDO` constant (line 412), and the old `undo()` function body (lines 414-427) -- approximately 17 lines removed. It ADDS the new undo/redo functions that delegate to SmartBCommandHistory (approximately 20 lines each = 40 lines) and modifies applyEdit (approximately 5 additional lines). Net change: approximately +28 lines, putting the file around 513 lines. **This is over 500.** The solution is to extract the popover functions (showAddNodePopover, showAddEdgePopover -- approximately 100 lines) into a separate `editor-popovers.js` module, bringing diagram-editor.js back under 400 lines.
**Warning signs:** Exceeding the 500-line limit during implementation.

## Code Examples

### Keyboard Shortcut Wiring in app-init.js

```javascript
// In the existing keyboard handler (line 96 of app-init.js)
// After the existing Ctrl+Z handler (line 120):

// Ctrl+Shift+Z or Ctrl+Y: Redo
if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey) && e.shiftKey) {
    e.preventDefault();
    MmdEditor.redo();
    return;
}
if (e.key === 'y' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    MmdEditor.redo();
    return;
}

// Ctrl+C: Copy selected node
if (e.key === 'c' && (e.ctrlKey || e.metaKey)) {
    if (window.SmartBClipboard && SmartBClipboard.copy()) {
        e.preventDefault();
        if (window.toast) toast('Copiado');
    }
    return;
}

// Ctrl+V: Paste node
if (e.key === 'v' && (e.ctrlKey || e.metaKey)) {
    if (window.SmartBClipboard && SmartBClipboard.hasContent()) {
        e.preventDefault();
        SmartBClipboard.paste();
        if (window.toast) toast('Colado');
    }
    return;
}

// Ctrl+D: Duplicate selected node
if (e.key === 'd' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    if (window.SmartBClipboard) SmartBClipboard.duplicate();
    return;
}
```

### Folder Context Menu in file-tree.js

```javascript
// In renderNodes(), modify the folder header to include action buttons:
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
    // ... children
```

### History Clear on File Switch

```javascript
// In file-tree.js loadFile():
function loadFile(path) {
    // Clear undo/redo history when switching files
    if (window.SmartBCommandHistory) SmartBCommandHistory.clear();
    currentFile = path;
    // ... rest of existing code
}
```

## Integration Points

### Modules That Need Modification

| Module | Change | Estimated Lines |
|--------|--------|-----------------|
| `diagram-editor.js` (485 lines) | Remove old undoStack, refactor applyEdit() to use SmartBCommandHistory, add redo(), extract popovers to separate file | Net -80 lines (after popover extraction) |
| `app-init.js` (398 lines) | Add Ctrl+Shift+Z, Ctrl+C/V/D shortcuts, init new modules | +30 lines |
| `file-tree.js` (303 lines) | Add folder rename/delete actions, buttons in tree, clear history on file switch | +60 lines |
| `live.html` (155 lines) | Add 2-3 new script tags (command-history.js, clipboard.js, editor-popovers.js) | +3 lines |
| `src/server/routes.ts` (379 lines) | Add POST /rmdir endpoint | +20 lines |

### New Modules

| Module | Purpose | Estimated Lines |
|--------|---------|-----------------|
| `command-history.js` | Undo/redo stack with execute/undo/redo API | ~80 lines |
| `clipboard.js` | Copy/paste/duplicate buffer for diagram nodes | ~100 lines |
| `editor-popovers.js` | Extracted popover functions from diagram-editor.js (addNode popover, addEdge popover) | ~120 lines |

### Script Load Order in live.html

New modules load AFTER `diagram-editor.js` (which they depend on) and BEFORE `app-init.js`:

```html
<!-- After existing Phase 13 modules, before viewport-transform.js -->
<script src="command-history.js"></script>
<script src="clipboard.js"></script>
<script src="editor-popovers.js"></script>
```

### EventBus Events (New)

| Event | Emitter | Consumer(s) | Payload |
|-------|---------|-------------|---------|
| `history:changed` | command-history.js | app-init.js (future: UI indicators) | `{ canUndo, canRedo, undoCount, redoCount }` |
| `clipboard:copy` | clipboard.js | (optional toast) | `{ nodeId, label }` |
| `clipboard:paste` | clipboard.js | (optional toast) | `{ newNodeId }` |

## Server-Side Changes

### POST /rmdir -- Delete Directory Recursively

**Endpoint:** `POST /rmdir`
**Body:** `{ folder: string }` -- relative path of the folder within the project
**Behavior:** Resolves path via `resolveProjectPath()`, then calls `fs.rm(resolved, { recursive: true })`
**Import needed:** Add `rm` to the `node:fs/promises` import in `routes.ts`
**Security:** Same `resolveProjectPath()` guard as existing endpoints (prevents path traversal)

### POST /move (Existing) -- Already Works for Directories

The existing `/move` endpoint uses `fs.rename()` which works for directories in Node.js. No modification needed. The `file-tree.js` `renameFolder()` function can call the same `/move` endpoint with `{ from: 'old-folder-name', to: 'new-folder-name' }`.

## State of the Art

| Old Approach (Current) | New Approach (Phase 14) | Impact |
|-------------------------|-------------------------|--------|
| Raw content array as undoStack (no redo) | Command pattern with undo + redo stacks | Users can redo accidentally undone edits |
| Only Ctrl+Z (undo), MAX_UNDO = 50 | Ctrl+Z undo + Ctrl+Shift+Z redo, MAX = 100 | Double the history, full redo support |
| Duplicate only via context menu | Ctrl+D keyboard shortcut + context menu | Faster workflow for power users |
| No copy/paste for nodes | Ctrl+C/V with internal clipboard buffer | Standard editor experience |
| No folder CRUD (only files) | Folder rename and delete in file tree | Complete file management |
| Popovers inline in diagram-editor.js | Extracted to editor-popovers.js | diagram-editor.js stays under 500 lines |

## Open Questions

1. **Should undo history persist across page reloads?**
   - What we know: The current undoStack is lost on reload. Most code editors preserve undo history per session.
   - What's unclear: Whether localStorage persistence is worth the complexity for a live-reloading diagram tool.
   - Recommendation: Do NOT persist. The diagrams are saved to .mmd files on every edit. Reload is a natural "commit point." This keeps the implementation simple.

2. **Should the undo/redo state be visible in the UI?**
   - What we know: Success criteria only require Ctrl+Z and Ctrl+Shift+Z to work. No mention of UI indicators.
   - What's unclear: Whether grayed-out undo/redo buttons would improve UX.
   - Recommendation: Defer UI indicators to a future phase. Just wire the keyboard shortcuts for now. The toast messages ("Desfeito", "Refeito") provide sufficient feedback.

3. **Should copy/paste work across files?**
   - What we know: The clipboard buffer is a JS object that persists as long as the page is loaded. Switching files does not clear it (unless we explicitly do so).
   - What's unclear: Whether pasting a node from file A into file B is useful or confusing.
   - Recommendation: Allow cross-file paste. The clipboard stores node data (label), not file-specific references. `generateNodeId()` ensures no ID conflicts. Clear clipboard on page reload (natural JS behavior).

4. **Should clearing command history on WebSocket update be mandatory?**
   - What we know: When AI writes to the .mmd file, the content changes outside of `applyEdit()`. If the user then undoes, they restore pre-AI content.
   - What's unclear: Whether this is acceptable UX or if it will cause confusion.
   - Recommendation: Do NOT clear history on WebSocket update. The user may want to undo their own edits even after AI changes. If the user undoes and the content differs from what the AI wrote, the save correctly overwrites. This matches how VS Code handles external file changes -- undo still works on the user's edit history.

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `static/diagram-editor.js` -- existing undoStack implementation (lines 411-435), applyEdit pipeline (lines 429-456), all edit functions
- Codebase analysis: `static/selection.js` -- getSelected() API for copy/paste integration
- Codebase analysis: `static/context-menu.js` -- existing duplicate action pattern
- Codebase analysis: `static/file-tree.js` -- existing file rename/delete, folder rendering, no folder CRUD
- Codebase analysis: `static/app-init.js` -- existing keyboard shortcuts (Ctrl+Z on line 120)
- Codebase analysis: `src/server/routes.ts` -- existing POST /move, POST /delete, POST /mkdir endpoints
- Codebase analysis: `static/inline-edit.js` -- uses MmdEditor.applyEdit() for edit confirmation
- Node.js docs: `fs.rm()` for recursive directory deletion -- [verified via training data, HIGH confidence for stable API]

### Secondary (MEDIUM confidence)
- Command pattern (GoF) -- well-established pattern for undoable operations, no external verification needed
- Undo/redo stack behavior: standard behavior in text editors (VS Code, Sublime, etc.) -- redo clears on new edit, undo/redo maintain separate stacks

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- No new libraries; all patterns use existing codebase abstractions
- Architecture: HIGH -- Command pattern is well-understood; content snapshots match existing applyEdit pipeline perfectly
- Pitfalls: HIGH -- All pitfalls identified from direct codebase analysis of existing edit flow, WebSocket update path, and file size constraints
- Server-side: HIGH -- fs.rm() and fs.rename() are stable Node.js APIs; route pattern matches existing endpoints

**Research date:** 2026-02-15
**Valid until:** 2026-03-15 (stable -- no external dependency changes expected)
