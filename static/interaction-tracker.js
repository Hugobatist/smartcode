/**
 * SmartB Interaction Tracker -- batches node clicks and flushes to server.
 * Provides automatic frequency data for the heatmap without MCP session setup.
 *
 * Dependencies: file-tree.js (SmartBFileTree), event-bus.js (SmartBEventBus)
 *
 * Usage:
 *   SmartBInteractionTracker.init();
 *   SmartBInteractionTracker.trackClick('nodeId');
 *   SmartBInteractionTracker.flush();       // manual flush
 *   SmartBInteractionTracker.resetForFile(); // on file switch
 */
(function() {
    'use strict';

    var FLUSH_INTERVAL = 2000; // 2 seconds

    var pendingCounts = {};
    var flushTimer = null;

    /**
     * Track a click on a node. Increments the pending count.
     * @param {string} nodeId
     */
    function trackClick(nodeId) {
        if (!nodeId || typeof nodeId !== 'string') return;
        pendingCounts[nodeId] = (pendingCounts[nodeId] || 0) + 1;
    }

    /**
     * Flush pending counts to the server via POST.
     * Resets pendingCounts after sending.
     */
    function flush() {
        var keys = Object.keys(pendingCounts);
        if (keys.length === 0) return;

        var currentFile = window.SmartBFileTree ? SmartBFileTree.getCurrentFile() : '';
        if (!currentFile) {
            pendingCounts = {};
            return;
        }

        var counts = pendingCounts;
        pendingCounts = {};

        var baseUrl = window.SmartBBaseUrl || '';
        var url = baseUrl + '/api/heatmap/' + encodeURIComponent(currentFile) + '/increment';

        fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ counts: counts }),
        }).catch(function() {
            // Re-add counts on failure so they're retried on next flush
            for (var k in counts) {
                pendingCounts[k] = (pendingCounts[k] || 0) + counts[k];
            }
        });
    }

    /**
     * Reset for file switch: flush current counts, clear pending.
     */
    function resetForFile() {
        flush();
        pendingCounts = {};
    }

    /**
     * Start the periodic flush timer.
     */
    function startFlushing() {
        if (flushTimer) clearInterval(flushTimer);
        flushTimer = setInterval(flush, FLUSH_INTERVAL);
    }

    /**
     * Initialize the interaction tracker.
     * Starts the flush timer.
     */
    function init() {
        startFlushing();
    }

    // ── Public API ──
    window.SmartBInteractionTracker = {
        init: init,
        trackClick: trackClick,
        flush: flush,
        resetForFile: resetForFile,
    };
})();
