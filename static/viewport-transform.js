/**
 * SmartB ViewportTransform -- screen/graph coordinate conversion and zoom.
 * Standalone class for managing a 2D viewport with pan and zoom.
 *
 * Dependencies: none
 * Dependents: canvas-renderer.js (Plan 02)
 *
 * Usage:
 *   var vt = new ViewportTransform();
 *   vt.zoomToFit(graphW, graphH, containerW, containerH);
 *   var graphPt = vt.screenToGraph(mouseX, mouseY);
 *   var screenPt = vt.graphToScreen(nodeX, nodeY);
 *   vt.applyToElement(svgGroup);
 */
(function() {
    'use strict';

    /**
     * ViewportTransform -- manages a 2D affine transform (translate + uniform scale).
     * @constructor
     */
    function ViewportTransform() {
        this.x = 0;
        this.y = 0;
        this.zoom = 1;
    }

    /**
     * Convert screen (pixel) coordinates to graph coordinates.
     * @param {number} screenX - Screen X position.
     * @param {number} screenY - Screen Y position.
     * @returns {{ x: number, y: number }}
     */
    ViewportTransform.prototype.screenToGraph = function(screenX, screenY) {
        return {
            x: (screenX - this.x) / this.zoom,
            y: (screenY - this.y) / this.zoom,
        };
    };

    /**
     * Convert graph coordinates to screen (pixel) coordinates.
     * @param {number} graphX - Graph X position.
     * @param {number} graphY - Graph Y position.
     * @returns {{ x: number, y: number }}
     */
    ViewportTransform.prototype.graphToScreen = function(graphX, graphY) {
        return {
            x: graphX * this.zoom + this.x,
            y: graphY * this.zoom + this.y,
        };
    };

    /**
     * Adjust the viewport to fit the entire graph within a container.
     * Applies padding and caps maximum zoom at 2.5x.
     * @param {number} graphW - Total graph width.
     * @param {number} graphH - Total graph height.
     * @param {number} containerW - Container width in pixels.
     * @param {number} containerH - Container height in pixels.
     */
    ViewportTransform.prototype.zoomToFit = function(graphW, graphH, containerW, containerH) {
        if (graphW <= 0 || graphH <= 0 || containerW <= 0 || containerH <= 0) {
            return;
        }

        var padFraction = 0.92;
        var scaleX = (containerW * padFraction) / graphW;
        var scaleY = (containerH * padFraction) / graphH;
        this.zoom = Math.min(scaleX, scaleY, 2.5);

        this.x = (containerW - graphW * this.zoom) / 2;
        this.y = (containerH - graphH * this.zoom) / 2;
    };

    /**
     * Apply the current transform to a DOM element via CSS transform.
     * @param {HTMLElement|SVGElement} el - The element to transform.
     */
    ViewportTransform.prototype.applyToElement = function(el) {
        el.style.transform = 'translate(' + this.x + 'px, ' + this.y + 'px) scale(' + this.zoom + ')';
    };

    /**
     * Set the transform values directly.
     * @param {number} x - Horizontal translation.
     * @param {number} y - Vertical translation.
     * @param {number} zoom - Zoom/scale factor.
     */
    ViewportTransform.prototype.setTransform = function(x, y, zoom) {
        this.x = x;
        this.y = y;
        this.zoom = zoom;
    };

    /**
     * Get the current transform values.
     * @returns {{ x: number, y: number, zoom: number }}
     */
    ViewportTransform.prototype.getTransform = function() {
        return { x: this.x, y: this.y, zoom: this.zoom };
    };

    // ── Public API ──
    window.ViewportTransform = ViewportTransform;

})();
