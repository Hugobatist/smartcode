/**
 * SmartB Diagrams -- Clipboard (Copy/Paste/Duplicate)
 * Internal clipboard buffer for node copy/paste/duplicate operations.
 * Uses internal JS buffer (NOT browser Clipboard API -- localhost is not HTTPS).
 *
 * Dependencies:
 *   - selection.js (SmartBSelection)
 *   - diagram-editor.js (MmdEditor)
 *
 * Usage:
 *   SmartBClipboard.copy();       // copies selected node to buffer
 *   SmartBClipboard.paste();      // pastes node from buffer with new ID
 *   SmartBClipboard.duplicate();  // duplicates selected node in place
 *   SmartBClipboard.hasContent(); // true if buffer has content
 *   SmartBClipboard.clear();      // clears the buffer
 */
(function () {
    'use strict';

    var buffer = null; // { nodeId: string, label: string } | null

    /**
     * Copy the currently selected node to the internal buffer.
     * @returns {boolean} true if a node was copied, false otherwise
     */
    function copy() {
        if (!window.SmartBSelection) return false;
        var sel = SmartBSelection.getSelected();
        if (!sel || sel.type !== 'node') return false;

        if (!window.MmdEditor) return false;
        var editor = document.getElementById('editor');
        if (!editor) return false;

        var label = MmdEditor.getNodeText(editor.value, sel.id);
        buffer = { nodeId: sel.id, label: label };
        return true;
    }

    /**
     * Paste the node from the buffer with a new ID and "(copy)" suffix.
     * @returns {boolean} true if paste was performed, false otherwise
     */
    function paste() {
        if (!buffer) return false;
        if (!window.MmdEditor) return false;

        var pasteLabel = buffer.label + ' (copy)';
        MmdEditor.applyEdit(function (c) {
            var newId = MmdEditor.generateNodeId(c);
            return MmdEditor.addNode(c, newId, pasteLabel);
        });
        return true;
    }

    /**
     * Duplicate the currently selected node in place (new ID, "(copy)" suffix).
     * @returns {boolean} true if duplication was performed, false otherwise
     */
    function duplicate() {
        if (!window.SmartBSelection) return false;
        var sel = SmartBSelection.getSelected();
        if (!sel || sel.type !== 'node') return false;

        if (!window.MmdEditor) return false;
        var nodeId = sel.id;
        MmdEditor.applyEdit(function (c) {
            return MmdEditor.duplicateNode(c, nodeId);
        });
        return true;
    }

    /**
     * @returns {boolean} Whether the clipboard buffer has content
     */
    function hasContent() {
        return buffer !== null;
    }

    /**
     * Clear the clipboard buffer.
     */
    function clear() {
        buffer = null;
    }

    window.SmartBClipboard = {
        copy: copy,
        paste: paste,
        duplicate: duplicate,
        hasContent: hasContent,
        clear: clear,
    };
})();
