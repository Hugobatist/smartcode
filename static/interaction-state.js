/**
 * SmartB Interaction State Machine -- FSM for coordinating all UI interaction modes.
 * Prevents conflicting interactions by defining valid states and transitions.
 *
 * Dependencies: event-bus.js (SmartBEventBus)
 *
 * States:
 *   idle         - Default. Click selects, right-click opens menu, double-click edits, drag pans.
 *   selected     - A node/edge is selected. Click elsewhere deselects, Delete removes.
 *   editing      - Inline edit overlay is open. All other interactions blocked.
 *   context-menu - Context menu is open. Click outside or Escape closes.
 *   flagging     - Flag mode is active (existing SmartBAnnotations behavior).
 *   add-node     - Add node mode (existing MmdEditor behavior).
 *   add-edge     - Add edge mode (existing MmdEditor behavior).
 *   panning      - Active drag-pan in progress.
 *
 * Usage:
 *   SmartBInteraction.getState();           // 'idle'
 *   SmartBInteraction.transition('click_node', { id: 'A' }); // true if valid
 *   SmartBInteraction.getSelection();       // { id: 'A', type: 'node' }
 *   SmartBInteraction.isIdle();             // false
 *   SmartBInteraction.isBlocking();         // false
 */
(function() {
    'use strict';

    // ── Transition Table ──
    var TRANSITIONS = {
        idle:           { click_node: 'selected', click_edge: 'selected', right_click: 'context-menu', dbl_click: 'editing', flag_toggle: 'flagging', add_node_toggle: 'add-node', add_edge_toggle: 'add-edge', pan_start: 'panning' },
        selected:       { click_empty: 'idle', click_node: 'selected', click_edge: 'selected', right_click: 'context-menu', dbl_click: 'editing', escape: 'idle', delete_node: 'idle', flag_toggle: 'flagging', pan_start: 'panning', drag_start: 'dragging' },
        editing:        { confirm: 'idle', cancel: 'idle' },
        'context-menu': { action: 'idle', close: 'idle', edit_action: 'editing' },
        flagging:       { flag_toggle: 'idle', escape: 'idle' },
        'add-node':     { add_node_toggle: 'idle', escape: 'idle' },
        'add-edge':     { add_edge_toggle: 'idle', escape: 'idle' },
        panning:        { pan_end: 'idle', pan_end_selected: 'selected' },
        dragging:       { drag_end: 'selected', escape: 'idle' },
    };

    // ── Internal State ──
    var currentState = 'idle';
    var selectedId = null;
    var selectedType = null; // 'node' | 'edge' | 'subgraph'

    // ── Core Functions ──

    /**
     * Attempt a state transition.
     * @param {string} event - The event name (e.g. 'click_node', 'escape')
     * @param {*} [payload] - Optional data passed to event listeners
     * @returns {boolean} true if transition happened, false if invalid
     */
    function transition(event, payload) {
        var stateConfig = TRANSITIONS[currentState];
        if (!stateConfig || !stateConfig[event]) return false;

        var from = currentState;
        var to = stateConfig[event];
        currentState = to;

        // Emit transition event on the event bus
        if (window.SmartBEventBus) {
            SmartBEventBus.emit('interaction:transition', {
                from: from,
                to: to,
                event: event,
                payload: payload
            });
        }

        return true;
    }

    /**
     * Returns the current FSM state string.
     * @returns {string}
     */
    function getState() {
        return currentState;
    }

    /**
     * Returns the current selection info.
     * @returns {{ id: string|null, type: string|null }}
     */
    function getSelection() {
        return { id: selectedId, type: selectedType };
    }

    /**
     * Set the selected element (called by selection.js when selecting).
     * @param {string} id - The selected element ID
     * @param {string} type - 'node' | 'edge' | 'subgraph'
     */
    function select(id, type) {
        selectedId = id;
        selectedType = type;
    }

    /**
     * Clear the current selection.
     */
    function clearSelection() {
        selectedId = null;
        selectedType = null;
    }

    /**
     * Force-set the FSM state (for existing mode toggles in annotations/editor
     * that need to sync their state with the FSM).
     * @param {string} state - One of the 8 valid states
     */
    function forceState(state) {
        if (TRANSITIONS[state] !== undefined) {
            var from = currentState;
            currentState = state;
            if (window.SmartBEventBus) {
                SmartBEventBus.emit('interaction:transition', {
                    from: from,
                    to: state,
                    event: 'force',
                    payload: null
                });
            }
        }
    }

    /**
     * Shorthand: is the FSM in idle state?
     * @returns {boolean}
     */
    function isIdle() {
        return currentState === 'idle';
    }

    /**
     * Returns true if in a blocking state (editing or context-menu).
     * @returns {boolean}
     */
    function isBlocking() {
        return currentState === 'editing' || currentState === 'context-menu';
    }

    // ── Public API ──
    window.SmartBInteraction = {
        getState: getState,
        getSelection: getSelection,
        transition: transition,
        select: select,
        clearSelection: clearSelection,
        forceState: forceState,
        isIdle: isIdle,
        isBlocking: isBlocking,
    };
})();
