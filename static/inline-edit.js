/**
 * SmartB Inline Edit -- double-click contenteditable overlay for label editing.
 * Opens an HTML overlay positioned over the SVG text element for in-place editing.
 *
 * Dependencies:
 *   - interaction-state.js (SmartBInteraction)
 *   - diagram-dom.js (DiagramDOM)
 *   - diagram-editor.js (MmdEditor)
 *   - event-bus.js (SmartBEventBus)
 *
 * Usage:
 *   SmartBInlineEdit.init();
 *   SmartBInlineEdit.open('nodeId');
 *   SmartBInlineEdit.confirm();
 *   SmartBInlineEdit.cancel();
 *   SmartBInlineEdit.isActive();
 */
(function() {
    'use strict';

    var activeOverlay = null;
    var activeNodeId = null;
    var originalLabel = null;
    var hiddenTextEl = null;
    var isCommitting = false; // guard against blur firing after confirm

    // ── Open Inline Edit ──

    function open(nodeId) {
        // Close any existing edit first
        if (activeOverlay) confirm();

        // Find the node's text element
        var nodeEl = DiagramDOM.findNodeElement(nodeId);
        if (!nodeEl) return;

        var textEl = nodeEl.querySelector('text');
        // Mermaid uses .nodeLabel span instead of <text>
        var mermaidLabel = nodeEl.querySelector('.nodeLabel');
        var targetEl = textEl || mermaidLabel;
        if (!targetEl) return;

        // Get current label
        var currentLabel = '';
        if (window.MmdEditor) {
            var editor = document.getElementById('editor');
            if (editor) currentLabel = MmdEditor.getNodeText(editor.value, nodeId);
        }
        if (!currentLabel) {
            currentLabel = DiagramDOM.getNodeLabel(nodeId) || nodeId;
        }

        // Get positions
        var textRect = targetEl.getBoundingClientRect();
        var container = document.getElementById('preview-container');
        if (!container) return;
        var containerRect = container.getBoundingClientRect();

        // Create the overlay
        var overlay = document.createElement('div');
        overlay.className = 'inline-edit-overlay';
        overlay.contentEditable = 'true';
        overlay.spellcheck = false;
        overlay.textContent = currentLabel;

        // Position relative to preview-container
        overlay.style.position = 'absolute';
        overlay.style.left = (textRect.left - containerRect.left) + 'px';
        overlay.style.top = (textRect.top - containerRect.top) + 'px';
        overlay.style.minWidth = Math.max(textRect.width, 60) + 'px';
        overlay.style.minHeight = textRect.height + 'px';

        // Style to match SVG text appearance
        var computed = window.getComputedStyle(targetEl);
        overlay.style.fontFamily = computed.fontFamily || "'Inter', sans-serif";
        overlay.style.fontSize = computed.fontSize || '14px';
        overlay.style.fontWeight = computed.fontWeight || '400';
        overlay.style.color = '#e4e4e7';
        overlay.style.background = 'var(--surface-2)';
        overlay.style.border = '2px solid #3b82f6';
        overlay.style.borderRadius = '4px';
        overlay.style.padding = '2px 6px';
        overlay.style.outline = 'none';
        overlay.style.zIndex = '10001';
        overlay.style.whiteSpace = 'nowrap';
        overlay.style.lineHeight = textRect.height + 'px';
        overlay.style.boxSizing = 'border-box';

        container.appendChild(overlay);

        // Focus and select all text
        overlay.focus();
        var range = document.createRange();
        range.selectNodeContents(overlay);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);

        // Store references
        activeOverlay = overlay;
        activeNodeId = nodeId;
        originalLabel = currentLabel;

        // Hide original SVG text element
        hiddenTextEl = targetEl;
        targetEl.style.visibility = 'hidden';

        // Attach event handlers
        overlay.addEventListener('keydown', handleOverlayKeydown);
        overlay.addEventListener('blur', handleOverlayBlur);

        // Emit event
        if (window.SmartBEventBus) {
            SmartBEventBus.emit('edit:started', { nodeId: nodeId });
        }
    }

    // ── Confirm Edit ──

    function confirm() {
        if (!activeOverlay) return;
        isCommitting = true;

        var newText = activeOverlay.textContent.trim();
        var nodeId = activeNodeId;
        var oldLabel = originalLabel;

        // Restore SVG text visibility before close
        if (hiddenTextEl) {
            hiddenTextEl.style.visibility = '';
        }

        // Save if changed and not empty
        if (newText && newText !== originalLabel && window.MmdEditor && MmdEditor.applyEdit) {
            MmdEditor.applyEdit(function(c) {
                return MmdEditor.editNodeText(c, nodeId, newText);
            });
        }

        // Close the overlay
        closeOverlay();
        isCommitting = false;

        // Transition FSM
        if (window.SmartBInteraction) {
            SmartBInteraction.transition('confirm');
        }

        // Emit event
        if (window.SmartBEventBus) {
            SmartBEventBus.emit('edit:completed', {
                nodeId: nodeId,
                oldLabel: oldLabel,
                newLabel: newText,
            });
        }
    }

    // ── Cancel Edit ──

    function cancel() {
        if (!activeOverlay) return;

        var nodeId = activeNodeId;

        // Restore SVG text visibility
        if (hiddenTextEl) {
            hiddenTextEl.style.visibility = '';
        }

        // Close the overlay
        closeOverlay();

        // Transition FSM
        if (window.SmartBInteraction) {
            SmartBInteraction.transition('cancel');
        }

        // Emit event
        if (window.SmartBEventBus) {
            SmartBEventBus.emit('edit:cancelled', { nodeId: nodeId });
        }
    }

    // ── Close Overlay ──

    function closeOverlay() {
        if (activeOverlay) {
            activeOverlay.removeEventListener('keydown', handleOverlayKeydown);
            activeOverlay.removeEventListener('blur', handleOverlayBlur);
            if (activeOverlay.parentNode) {
                activeOverlay.parentNode.removeChild(activeOverlay);
            }
        }
        activeOverlay = null;
        activeNodeId = null;
        originalLabel = null;
        hiddenTextEl = null;
    }

    // ── Event Handlers ──

    function handleOverlayKeydown(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            confirm();
        } else if (e.key === 'Escape') {
            cancel();
        }
    }

    function handleOverlayBlur(e) {
        // If focus moved to another interactive element (context menu, etc.), cancel
        // Use a timeout to let the relatedTarget resolve
        setTimeout(function() {
            if (!activeOverlay) return;
            // Guard: if confirm() already ran, don't cancel
            if (isCommitting) return;
            // Check if focus went to a valid target that should keep the edit open
            var active = document.activeElement;
            if (active && (active.closest('.context-menu') || active.closest('.flag-popover'))) return;
            // Default: cancel on blur to prevent accidental data loss
            cancel();
        }, 150);
    }

    // ── Double-click Handler (delegated on #preview-container) ──

    function handleDblClick(e) {
        // Check FSM blocking states
        if (window.SmartBInteraction && SmartBInteraction.isBlocking()) return;

        // Don't handle in special modes
        var fsmState = window.SmartBInteraction ? SmartBInteraction.getState() : 'idle';
        if (fsmState === 'flagging' || fsmState === 'add-node' || fsmState === 'add-edge') return;

        // Skip UI controls
        if (e.target.closest('.zoom-controls') ||
            e.target.closest('.flag-popover') ||
            e.target.closest('.editor-popover') ||
            e.target.closest('.context-menu') ||
            e.target.closest('.inline-edit-overlay')) return;

        // Detect what was double-clicked
        var nodeInfo = DiagramDOM.extractNodeId(e.target);
        if (!nodeInfo) return;

        // Only handle nodes and subgraphs (not edges)
        if (nodeInfo.type !== 'node' && nodeInfo.type !== 'subgraph') return;

        // Don't open inline edit on collapsed nodes (let collapse-ui handle them)
        if (nodeInfo.id.startsWith('__collapsed__')) return;

        // Transition FSM to editing
        if (window.SmartBInteraction) {
            SmartBInteraction.transition('dbl_click', nodeInfo);
        }

        open(nodeInfo.id);
    }

    // ── EventBus Subscription: auto-commit on re-render ──

    function handleDiagramRendered() {
        // If inline edit is active, commit before SVG replacement
        if (activeOverlay) {
            confirm();
        }
    }

    // ── Init ──

    function init() {
        var container = document.getElementById('preview-container');
        if (container) {
            container.addEventListener('dblclick', handleDblClick);
        }

        // Subscribe to diagram:rendered to auto-commit active edits
        if (window.SmartBEventBus) {
            SmartBEventBus.on('diagram:rendered', handleDiagramRendered);
        }
    }

    // ── Public API ──
    window.SmartBInlineEdit = {
        init: init,
        open: open,
        close: closeOverlay,
        confirm: confirm,
        cancel: cancel,
        isActive: function() { return !!activeOverlay; },
    };
})();
