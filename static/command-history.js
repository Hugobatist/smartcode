/**
 * SmartB Diagrams -- Command History (Undo/Redo)
 * Implements the Command pattern with capped undo/redo stacks.
 * Each command is { before: string, after: string, description: string }.
 * Dependencies: event-bus.js (SmartBEventBus, optional)
 */
(function () {
    'use strict';

    var undoStack = [];
    var redoStack = [];
    var MAX_HISTORY = 100;

    function emitChanged() {
        if (window.SmartBEventBus) {
            SmartBEventBus.emit('history:changed', {
                canUndo: undoStack.length > 0,
                canRedo: redoStack.length > 0,
                undoCount: undoStack.length,
                redoCount: redoStack.length,
            });
        }
    }

    /**
     * Push a new command to the undo stack. Clears redo stack (standard editor behavior).
     * @param {{ before: string, after: string, description: string }} command
     */
    function execute(command) {
        undoStack.push(command);
        if (undoStack.length > MAX_HISTORY) undoStack.shift();
        redoStack.length = 0;
        emitChanged();
    }

    /**
     * Pop the last command from the undo stack and push to redo stack.
     * @returns {string|null} The before-state content, or null if nothing to undo.
     */
    function undo() {
        if (undoStack.length === 0) return null;
        var cmd = undoStack.pop();
        redoStack.push(cmd);
        emitChanged();
        return cmd.before;
    }

    /**
     * Pop the last command from the redo stack and push to undo stack.
     * @returns {string|null} The after-state content, or null if nothing to redo.
     */
    function redo() {
        if (redoStack.length === 0) return null;
        var cmd = redoStack.pop();
        undoStack.push(cmd);
        emitChanged();
        return cmd.after;
    }

    /** @returns {boolean} Whether there are commands to undo */
    function canUndo() { return undoStack.length > 0; }

    /** @returns {boolean} Whether there are commands to redo */
    function canRedo() { return redoStack.length > 0; }

    /** Clear both stacks. Called on file switch. */
    function clear() {
        undoStack.length = 0;
        redoStack.length = 0;
        emitChanged();
    }

    /** @returns {number} Number of commands in the undo stack */
    function getUndoCount() { return undoStack.length; }

    /** @returns {number} Number of commands in the redo stack */
    function getRedoCount() { return redoStack.length; }

    window.SmartBCommandHistory = {
        execute: execute,
        undo: undo,
        redo: redo,
        canUndo: canUndo,
        canRedo: canRedo,
        clear: clear,
        getUndoCount: getUndoCount,
        getRedoCount: getRedoCount,
    };
})();
