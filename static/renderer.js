/**
 * SmartB Renderer -- Mermaid rendering pipeline, error panel, status injection.
 * Extracted from live.html (Phase 9 Plan 02).
 *
 * Dependencies: mermaid (CDN), event-bus.js (SmartBEventBus)
 * Dependents: pan-zoom.js, export.js, annotations.js, collapse-ui.js
 *
 * Usage:
 *   SmartBRenderer.render(code);      // async
 *   SmartBRenderer.escapeHtml(text);
 *   SmartBRenderer.injectStatusStyles(cleanCode);
 *   SmartBRenderer.MERMAID_CONFIG;     // shared config for export.js
 */
(function() {
    'use strict';

    // ── Shared Mermaid Config ──
    var MERMAID_CONFIG = {
        startOnLoad: false,
        theme: 'base',
        themeVariables: {
            darkMode: false,
            background: '#ffffff',
            fontFamily: 'Inter, sans-serif',
            fontSize: '16px',
            primaryColor: '#3b82f6',
            primaryTextColor: '#18181b',
            primaryBorderColor: '#2563eb',
            secondaryColor: '#dbeafe',
            tertiaryColor: '#f0fdf4',
            lineColor: '#52525b',
            mainBkg: '#eff6ff',
            nodeBorder: '#2563eb',
            clusterBkg: '#f4f4f5',
            clusterBorder: '#a1a1aa',
            titleColor: '#18181b',
            edgeLabelBackground: '#ffffff',
        },
        flowchart: {
            curve: 'basis',
            padding: 48,
            nodeSpacing: 100,
            rankSpacing: 120,
            htmlLabels: false,
            useMaxWidth: false,
        },
        securityLevel: 'loose',
    };

    mermaid.initialize(MERMAID_CONFIG);

    // ── Render State ──
    var isInitialRender = true;

    // ── HTML Escape Helper ──
    function escapeHtml(text) {
        var div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }

    // ── Status Style Injection ──
    var STATUS_CLASS_MAP = {
        'ok': 'ok',
        'problem': 'problem',
        'in-progress': 'inProgress',
        'discarded': 'discarded',
    };

    function injectStatusStyles(cleanCode) {
        if (!window.SmartBAnnotations) return cleanCode;
        var statusMap = SmartBAnnotations.getStatusMap();
        if (!statusMap || statusMap.size === 0) return cleanCode;

        var classDefs = [
            'classDef ok fill:#22c55e,stroke:#16a34a,color:#fff;',
            'classDef problem fill:#ef4444,stroke:#dc2626,color:#fff;',
            'classDef inProgress fill:#eab308,stroke:#ca8a04,color:#000;',
            'classDef discarded fill:#71717a,stroke:#52525b,color:#fff;',
        ];

        var classAssignments = [];
        for (var entry of statusMap) {
            var nodeId = entry[0];
            var statusValue = entry[1];
            var className = STATUS_CLASS_MAP[statusValue];
            if (className) {
                classAssignments.push('class ' + nodeId + ' ' + className);
            }
        }

        if (classAssignments.length === 0) return cleanCode;

        return cleanCode.trimEnd() + '\n' + classDefs.join('\n') + '\n' + classAssignments.join('\n');
    }

    // ── Error Icon (SVG via DOM) ──
    function createErrorIcon() {
        var ns = 'http://www.w3.org/2000/svg';
        var svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('width', '20');
        svg.setAttribute('height', '20');
        svg.setAttribute('viewBox', '0 0 20 20');
        svg.setAttribute('fill', 'none');

        var circle = document.createElementNS(ns, 'circle');
        circle.setAttribute('cx', '10');
        circle.setAttribute('cy', '10');
        circle.setAttribute('r', '9');
        circle.setAttribute('stroke', '#ef4444');
        circle.setAttribute('stroke-width', '2');
        svg.appendChild(circle);

        var line = document.createElementNS(ns, 'path');
        line.setAttribute('d', 'M10 6v5');
        line.setAttribute('stroke', '#ef4444');
        line.setAttribute('stroke-width', '2');
        line.setAttribute('stroke-linecap', 'round');
        svg.appendChild(line);

        var dot = document.createElementNS(ns, 'circle');
        dot.setAttribute('cx', '10');
        dot.setAttribute('cy', '14');
        dot.setAttribute('r', '1');
        dot.setAttribute('fill', '#ef4444');
        svg.appendChild(dot);

        return svg;
    }

    // ── Error Panel Builder ──
    function buildErrorPanel(error, sourceCode) {
        var container = document.createElement('div');
        container.style.cssText = 'padding:40px;max-width:700px;font-family:Inter,sans-serif;';

        // Main panel
        var panel = document.createElement('div');
        panel.style.cssText = 'background:#fff;border:1px solid #fecaca;border-left:4px solid #ef4444;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);';

        // Header
        var header = document.createElement('div');
        header.style.cssText = 'padding:16px 20px;display:flex;align-items:center;gap:10px;border-bottom:1px solid #fef2f2;';

        header.appendChild(createErrorIcon());

        var title = document.createElement('span');
        title.style.cssText = 'font-size:15px;font-weight:700;color:#991b1b;';
        title.textContent = 'Mermaid Syntax Error';
        header.appendChild(title);

        // Parse line number from error message
        var errorMsg = String(error.message || error);
        var lineMatch = errorMsg.match(/line\s+(\d+)/i);
        var errorLine = lineMatch ? parseInt(lineMatch[1], 10) : null;

        if (errorLine !== null) {
            var badge = document.createElement('span');
            badge.style.cssText = 'background:#fef2f2;color:#ef4444;font-size:11px;font-weight:600;padding:2px 8px;border-radius:6px;border:1px solid #fecaca;';
            badge.textContent = 'Line ' + errorLine;
            header.appendChild(badge);
        }

        panel.appendChild(header);

        // Error message
        var msgBlock = document.createElement('div');
        msgBlock.style.cssText = 'padding:16px 20px;';

        var pre = document.createElement('pre');
        pre.style.cssText = 'white-space:pre-wrap;word-break:break-word;color:#6b7280;font-size:13px;font-family:"JetBrains Mono",monospace;margin:0;line-height:1.6;background:#fef2f2;padding:12px;border-radius:8px;';
        pre.textContent = errorMsg;
        msgBlock.appendChild(pre);
        panel.appendChild(msgBlock);

        // Code snippet with context (if line number available)
        if (errorLine !== null && sourceCode) {
            var lines = sourceCode.split('\n');
            var start = Math.max(0, errorLine - 4); // 3 lines before
            var end = Math.min(lines.length, errorLine + 2); // 2 lines after

            var snippetBlock = document.createElement('div');
            snippetBlock.style.cssText = 'padding:0 20px 16px;';

            var snippetLabel = document.createElement('div');
            snippetLabel.style.cssText = 'font-size:11px;font-weight:600;color:#a1a1aa;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;';
            snippetLabel.textContent = 'Codigo fonte';
            snippetBlock.appendChild(snippetLabel);

            var codeContainer = document.createElement('div');
            codeContainer.style.cssText = 'background:#18181b;border-radius:8px;overflow:hidden;font-family:"JetBrains Mono",monospace;font-size:12px;line-height:1.7;';

            for (var i = start; i < end; i++) {
                var lineNum = i + 1;
                var isError = lineNum === errorLine;
                var lineDiv = document.createElement('div');
                lineDiv.style.cssText = isError
                    ? 'display:flex;background:rgba(239,68,68,0.2);'
                    : 'display:flex;';

                var numSpan = document.createElement('span');
                numSpan.style.cssText = 'display:inline-block;width:40px;text-align:right;padding-right:12px;color:' + (isError ? '#ef4444' : '#6b7280') + ';user-select:none;flex-shrink:0;';
                numSpan.textContent = String(lineNum);

                var codeSpan = document.createElement('span');
                codeSpan.style.cssText = 'color:' + (isError ? '#fca5a5' : '#e4e4e7') + ';padding-right:12px;';
                codeSpan.textContent = lines[i] || '';

                lineDiv.appendChild(numSpan);
                lineDiv.appendChild(codeSpan);
                codeContainer.appendChild(lineDiv);
            }

            snippetBlock.appendChild(codeContainer);
            panel.appendChild(snippetBlock);
        }

        container.appendChild(panel);
        return container;
    }

    // ── Render ──
    async function render(code) {
        if (!code || !code.trim()) return;
        // Strip annotations before rendering (Mermaid doesn't understand %% @flag / @status)
        var cleanCode = window.SmartBAnnotations
            ? SmartBAnnotations.getCleanContent(code)
            : code;
        // Inject status classDef styles before rendering
        var styledCode = injectStatusStyles(cleanCode);
        var preview = document.getElementById('preview');
        try {
            var result = await mermaid.render('mermaid-' + Date.now(), styledCode.trim());
            // Safe: SVG generated by mermaid.render(), not user input
            preview.textContent = '';
            preview.insertAdjacentHTML('afterbegin', result.svg);
            // Apply transform (from pan-zoom module, loaded later but called after all scripts)
            if (window.applyTransform) window.applyTransform();
            // Apply flag indicators after SVG is in the DOM
            if (window.SmartBAnnotations) SmartBAnnotations.applyFlagsToSVG();
            // Apply collapse overlays if available
            if (window.SmartBCollapseUI && SmartBCollapseUI.applyOverlays) SmartBCollapseUI.applyOverlays();
            // Only auto-fit on initial render or file navigation; preserve zoom on live updates
            if (isInitialRender) {
                requestAnimationFrame(function() {
                    if (window.zoomFit) window.zoomFit();
                });
                isInitialRender = false;
            } else {
                if (window.applyTransform) window.applyTransform();
            }
            // Emit rendered event
            if (window.SmartBEventBus) {
                SmartBEventBus.emit('diagram:rendered', { svg: result.svg });
            }
        } catch (e) {
            // Show structured error panel with line numbers using cleanCode (user's source)
            preview.textContent = '';
            preview.appendChild(buildErrorPanel(e, cleanCode));
            // Emit error event
            if (window.SmartBEventBus) {
                SmartBEventBus.emit('diagram:error', { error: e });
            }
        }
    }

    // ── Public API ──
    window.SmartBRenderer = {
        render: render,
        escapeHtml: escapeHtml,
        injectStatusStyles: injectStatusStyles,
        MERMAID_CONFIG: MERMAID_CONFIG,
        setInitialRender: function(v) { isInitialRender = v; },
        getInitialRender: function() { return isInitialRender; },
    };

    // Backward compat -- other modules and inline code call these directly
    window.render = render;
    window.escapeHtml = escapeHtml;
    window.injectStatusStyles = injectStatusStyles;
})();
