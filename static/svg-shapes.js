/**
 * SmartB SVG Shapes -- SVG element factories for all 13 Mermaid node shapes.
 * Each shape function takes (w, h) and returns an SVG element centered at (0, 0).
 *
 * Dependencies: none (standalone)
 * Dependents: svg-renderer.js (calls SmartBSvgShapes.render)
 *
 * Usage:
 *   var el = SmartBSvgShapes.render('diamond', 120, 60);
 *   // Returns an SVG element ready for translate(x,y) positioning
 */
(function() {
    'use strict';

    var NS = 'http://www.w3.org/2000/svg';

    // ── Helper: create SVG element ──
    function el(tag) {
        return document.createElementNS(NS, tag);
    }

    // ── Helper: set multiple attributes ──
    function attrs(element, map) {
        for (var key in map) {
            if (map.hasOwnProperty(key)) {
                element.setAttribute(key, String(map[key]));
            }
        }
        return element;
    }

    // ── Helper: polygon from points array ──
    function polygon(points) {
        var poly = el('polygon');
        var str = '';
        for (var i = 0; i < points.length; i++) {
            if (i > 0) str += ' ';
            str += points[i][0] + ',' + points[i][1];
        }
        poly.setAttribute('points', str);
        return poly;
    }

    // ── Shape: rect ──
    function rect(w, h) {
        return attrs(el('rect'), {
            x: -w / 2, y: -h / 2, width: w, height: h, rx: 0
        });
    }

    // ── Shape: rounded ──
    function rounded(w, h) {
        return attrs(el('rect'), {
            x: -w / 2, y: -h / 2, width: w, height: h, rx: 8
        });
    }

    // ── Shape: stadium ──
    function stadium(w, h) {
        return attrs(el('rect'), {
            x: -w / 2, y: -h / 2, width: w, height: h, rx: h / 2
        });
    }

    // ── Shape: diamond ──
    function diamond(w, h) {
        return polygon([
            [0, -h / 2],
            [w / 2, 0],
            [0, h / 2],
            [-w / 2, 0]
        ]);
    }

    // ── Shape: circle ──
    function circle(w, h) {
        var r = Math.max(w, h) / 2;
        return attrs(el('circle'), { cx: 0, cy: 0, r: r });
    }

    // ── Shape: hexagon ──
    function hexagon(w, h) {
        var dx = h / 4;
        return polygon([
            [-w / 2 + dx, -h / 2],
            [w / 2 - dx, -h / 2],
            [w / 2, 0],
            [w / 2 - dx, h / 2],
            [-w / 2 + dx, h / 2],
            [-w / 2, 0]
        ]);
    }

    // ── Shape: subroutine ──
    function subroutine(w, h) {
        var g = el('g');
        var mainRect = attrs(el('rect'), {
            x: -w / 2, y: -h / 2, width: w, height: h, rx: 0
        });
        g.appendChild(mainRect);

        // Left inner vertical line
        var lineLeft = attrs(el('line'), {
            x1: -w / 2 + 8, y1: -h / 2,
            x2: -w / 2 + 8, y2: h / 2
        });
        g.appendChild(lineLeft);

        // Right inner vertical line
        var lineRight = attrs(el('line'), {
            x1: w / 2 - 8, y1: -h / 2,
            x2: w / 2 - 8, y2: h / 2
        });
        g.appendChild(lineRight);

        return g;
    }

    // ── Shape: cylinder ──
    function cylinder(w, h) {
        var rx = w / 2;
        var ry = 8; // ellipse vertical radius for cap
        var bodyTop = -h / 2 + ry;
        var bodyBottom = h / 2 - ry;

        // Path: top ellipse, right side, bottom ellipse, left side, close with top back-arc
        var d = 'M ' + (-rx) + ' ' + bodyTop
            + ' A ' + rx + ' ' + ry + ' 0 0 1 ' + rx + ' ' + bodyTop
            + ' L ' + rx + ' ' + bodyBottom
            + ' A ' + rx + ' ' + ry + ' 0 0 1 ' + (-rx) + ' ' + bodyBottom
            + ' L ' + (-rx) + ' ' + bodyTop
            + ' A ' + rx + ' ' + ry + ' 0 0 0 ' + rx + ' ' + bodyTop;

        return attrs(el('path'), { d: d });
    }

    // ── Shape: asymmetric (flag/pennant) ──
    function asymmetric(w, h) {
        var notch = h / 4;
        return polygon([
            [-w / 2, -h / 2],
            [w / 2, -h / 2],
            [w / 2 - notch, 0],
            [w / 2, h / 2],
            [-w / 2, h / 2]
        ]);
    }

    // ── Shape: parallelogram (slanting right) ──
    function parallelogram(w, h) {
        var skew = h * 0.3;
        return polygon([
            [-w / 2 + skew, -h / 2],
            [w / 2, -h / 2],
            [w / 2 - skew, h / 2],
            [-w / 2, h / 2]
        ]);
    }

    // ── Shape: parallelogram-alt (slanting left, mirror) ──
    function parallelogramAlt(w, h) {
        var skew = h * 0.3;
        return polygon([
            [-w / 2, -h / 2],
            [w / 2 - skew, -h / 2],
            [w / 2, h / 2],
            [-w / 2 + skew, h / 2]
        ]);
    }

    // ── Shape: trapezoid (wider at bottom) ──
    function trapezoid(w, h) {
        var dx = w * 0.15;
        return polygon([
            [-w / 2 + dx, -h / 2],
            [w / 2 - dx, -h / 2],
            [w / 2, h / 2],
            [-w / 2, h / 2]
        ]);
    }

    // ── Shape: trapezoid-alt (wider at top) ──
    function trapezoidAlt(w, h) {
        var dx = w * 0.15;
        return polygon([
            [-w / 2, -h / 2],
            [w / 2, -h / 2],
            [w / 2 - dx, h / 2],
            [-w / 2 + dx, h / 2]
        ]);
    }

    // ── Shape Registry ──
    var SHAPE_RENDERERS = {
        'rect': rect,
        'rounded': rounded,
        'stadium': stadium,
        'diamond': diamond,
        'circle': circle,
        'hexagon': hexagon,
        'subroutine': subroutine,
        'cylinder': cylinder,
        'asymmetric': asymmetric,
        'parallelogram': parallelogram,
        'parallelogram-alt': parallelogramAlt,
        'trapezoid': trapezoid,
        'trapezoid-alt': trapezoidAlt
    };

    // ── Render function ──
    function render(shape, w, h) {
        var fn = SHAPE_RENDERERS[shape] || SHAPE_RENDERERS['rect'];
        return fn(w, h);
    }

    // ── Public API ──
    window.SmartBSvgShapes = { render: render };
})();
