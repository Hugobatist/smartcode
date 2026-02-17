/**
 * SmartB Export -- SVG and PNG export of current diagram.
 * Extracted from live.html (Phase 9 Plan 02).
 *
 * Dependencies: mermaid (CDN), renderer.js (SmartBRenderer.MERMAID_CONFIG)
 * Dependents: none (triggered by UI buttons)
 *
 * Usage:
 *   SmartBExport.exportSVG();
 *   SmartBExport.exportPNG();
 */
(function() {
    'use strict';

    // ── Download helper ──
    function download(blob, name) {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        a.click();
        URL.revokeObjectURL(a.href);
        if (window.toast) toast('Exportado: ' + name);
    }

    // ── SVG Export ──
    function exportSVG() {
        var svg = document.querySelector('#preview svg');
        if (!svg) return window.toast && toast('Nada para exportar');
        var blob = new Blob([svg.outerHTML], { type: 'image/svg+xml' });
        var currentFile = (window.SmartBFileTree && SmartBFileTree.getCurrentFile()) || 'export';
        download(blob, currentFile.replace('.mmd', '.svg'));
    }

    // ── PNG Export ──
    // Uses SmartBRenderer.MERMAID_CONFIG to avoid triplicating the config object.
    // Re-initializes mermaid with htmlLabels:false to avoid foreignObject Canvas taint,
    // then restores original config after rendering.
    async function exportPNG() {
        var currentSvg = document.querySelector('#preview svg');
        if (!currentSvg) return window.toast && toast('Nada para exportar');

        // Custom SVG: direct PNG export without mermaid re-render
        if (window.DiagramDOM && DiagramDOM.getRendererType() === 'custom') {
            var currentFile = (window.SmartBFileTree && SmartBFileTree.getCurrentFile()) || 'export';
            var clone = currentSvg.cloneNode(true);
            var canvas = document.createElement('canvas');
            var ctx = canvas.getContext('2d');
            var data = new XMLSerializer().serializeToString(clone);
            var img = new Image();
            img.onload = function() {
                canvas.width = img.width * 2;
                canvas.height = img.height * 2;
                ctx.scale(2, 2);
                ctx.drawImage(img, 0, 0);
                canvas.toBlob(function(blob) {
                    download(blob, currentFile.replace('.mmd', '.png'));
                }, 'image/png');
            };
            img.onerror = function() {
                if (window.toast) toast('Erro ao exportar PNG -- tente SVG');
            };
            img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(data)));
            return;
        }

        var baseConfig = window.SmartBRenderer && SmartBRenderer.MERMAID_CONFIG;
        if (!baseConfig) {
            if (window.toast) toast('Erro: renderer nao carregado');
            return;
        }

        var currentFile = (window.SmartBFileTree && SmartBFileTree.getCurrentFile()) || 'export';

        try {
            // Get current diagram source code (same pipeline as render())
            var editor = document.getElementById('editor');
            var code = editor.value;
            var cleanCode = window.SmartBAnnotations
                ? SmartBAnnotations.getCleanContent(code)
                : code;
            var styledCode = window.injectStatusStyles
                ? injectStatusStyles(cleanCode)
                : cleanCode;

            // Build export config: clone base config with htmlLabels:false
            var exportConfig = JSON.parse(JSON.stringify(baseConfig));
            exportConfig.flowchart.htmlLabels = false;

            // Temporarily re-initialize mermaid for Canvas-safe rendering
            mermaid.initialize(exportConfig);

            // Render a Canvas-safe SVG (no foreignObject)
            var result = await mermaid.render('export-png-' + Date.now(), styledCode.trim());
            var exportSvgStr = result.svg;

            // Restore original mermaid config
            mermaid.initialize(baseConfig);

            // Parse export SVG to get dimensions
            var tempDiv = document.createElement('div');
            tempDiv.style.cssText = 'position:absolute;left:-9999px;top:-9999px;';
            document.body.appendChild(tempDiv);
            // Safe: SVG from mermaid.render(), not user input
            tempDiv.textContent = '';
            tempDiv.insertAdjacentHTML('afterbegin', exportSvgStr);
            var exportSvg = tempDiv.querySelector('svg');

            var canvas = document.createElement('canvas');
            var ctx = canvas.getContext('2d');
            var data = new XMLSerializer().serializeToString(exportSvg);

            document.body.removeChild(tempDiv);

            var img = new Image();
            img.onload = function() {
                try {
                    canvas.width = img.width * 2;
                    canvas.height = img.height * 2;
                    ctx.scale(2, 2);
                    ctx.drawImage(img, 0, 0);
                    canvas.toBlob(function(blob) {
                        download(blob, currentFile.replace('.mmd', '.png'));
                    }, 'image/png');
                } catch (taintErr) {
                    if (window.toast) toast('Erro ao exportar PNG -- tente SVG');
                }
            };
            img.onerror = function() {
                if (window.toast) toast('Erro ao exportar PNG -- tente SVG');
            };
            img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(data)));
        } catch (e) {
            // Restore original config on error
            if (baseConfig) mermaid.initialize(baseConfig);
            if (window.toast) toast('Erro ao exportar PNG -- tente SVG');
        }
    }

    // ── Public API ──
    window.SmartBExport = { exportSVG: exportSVG, exportPNG: exportPNG };

    // Backward compat -- onclick handlers in HTML call these directly
    window.exportSVG = exportSVG;
    window.exportPNG = exportPNG;
})();
