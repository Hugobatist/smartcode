/**
 * SmartB Diagrams -- Editor Popovers
 * Add-node and add-edge popover UI, extracted from diagram-editor.js.
 * Dependencies: diagram-editor.js (MmdEditor), diagram-dom.js (DiagramDOM)
 */
(function () {
    'use strict';

    var _outsideHandler = null;

    function closeEditorPopover() {
        if (_outsideHandler) {
            document.removeEventListener('mousedown', _outsideHandler);
            _outsideHandler = null;
        }
        var existing = document.querySelector('.editor-popover');
        if (existing) existing.remove();
    }

    function createPopover(x, y) {
        closeEditorPopover();
        var pop = document.createElement('div');
        pop.className = 'flag-popover editor-popover';
        pop.style.left = Math.min(x + 12, window.innerWidth - 360) + 'px';
        pop.style.top = Math.min(y - 20, window.innerHeight - 280) + 'px';
        document.body.appendChild(pop);

        setTimeout(function () {
            function outside(e) {
                if (pop.contains(e.target)) return;
                closeEditorPopover();
            }
            _outsideHandler = outside;
            document.addEventListener('mousedown', outside);
        }, 50);

        return pop;
    }

    function showAddNodePopover(clientX, clientY) {
        var editor = document.getElementById('editor');
        if (!editor) return;
        var suggestedId = MmdEditor.generateNodeId(editor.value);
        var pop = createPopover(clientX, clientY);

        // Build popover content using DOM methods
        var titleDiv = document.createElement('div');
        titleDiv.className = 'flag-popover-title';
        var titleSpan = document.createElement('span');
        titleSpan.textContent = 'Novo Nodo';
        titleDiv.appendChild(titleSpan);
        pop.appendChild(titleDiv);

        var idLabel = document.createElement('label');
        idLabel.style.cssText = 'font-size:11px;color:var(--text-secondary);margin-bottom:2px;display:block';
        idLabel.textContent = 'ID (sem espacos)';
        pop.appendChild(idLabel);

        var idInput = document.createElement('input');
        idInput.className = 'ep-input';
        idInput.type = 'text';
        idInput.value = suggestedId;
        idInput.style.marginBottom = '8px';
        pop.appendChild(idInput);

        var labelLabel = document.createElement('label');
        labelLabel.style.cssText = 'font-size:11px;color:var(--text-secondary);margin-bottom:2px;display:block';
        labelLabel.textContent = 'Texto';
        pop.appendChild(labelLabel);

        var labelInput = document.createElement('input');
        labelInput.className = 'ep-input ep-label';
        labelInput.type = 'text';
        labelInput.placeholder = 'Texto do nodo...';
        pop.appendChild(labelInput);

        var actionsDiv = document.createElement('div');
        actionsDiv.className = 'flag-popover-actions';
        actionsDiv.style.marginTop = '10px';

        var btnCancel = document.createElement('button');
        btnCancel.className = 'btn-flag secondary';
        btnCancel.textContent = 'Cancelar';
        btnCancel.addEventListener('click', closeEditorPopover);
        actionsDiv.appendChild(btnCancel);

        var btnCreate = document.createElement('button');
        btnCreate.className = 'btn-flag primary';
        btnCreate.style.background = 'var(--accent)';
        btnCreate.textContent = 'Criar Nodo';
        actionsDiv.appendChild(btnCreate);
        pop.appendChild(actionsDiv);

        labelInput.focus();

        function doCreate() {
            var id = idInput.value.trim().replace(/\s+/g, '_');
            var label = labelInput.value.trim();
            if (!id || !label) return;
            MmdEditor.applyEdit(function (c) { return MmdEditor.addNode(c, id, label); });
            closeEditorPopover();
        }

        labelInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') doCreate();
            if (e.key === 'Escape') closeEditorPopover();
        });
        btnCreate.addEventListener('click', doCreate);
    }

    function showAddEdgePopover(clientX, clientY, fromId, toId) {
        var pop = createPopover(clientX, clientY);

        // Build popover content using DOM methods
        var titleDiv = document.createElement('div');
        titleDiv.className = 'flag-popover-title';
        var titleSpan = document.createElement('span');
        titleSpan.textContent = 'Nova Conexao';
        titleDiv.appendChild(titleSpan);
        var edgeIdSpan = document.createElement('span');
        edgeIdSpan.className = 'node-id';
        edgeIdSpan.textContent = fromId + ' \u2192 ' + toId;
        titleDiv.appendChild(edgeIdSpan);
        pop.appendChild(titleDiv);

        var labelLabel = document.createElement('label');
        labelLabel.style.cssText = 'font-size:11px;color:var(--text-secondary);margin-bottom:2px;display:block';
        labelLabel.textContent = 'Label (opcional)';
        pop.appendChild(labelLabel);

        var labelInput = document.createElement('input');
        labelInput.className = 'ep-input ep-label';
        labelInput.type = 'text';
        labelInput.placeholder = 'Texto da seta...';
        pop.appendChild(labelInput);

        var actionsDiv = document.createElement('div');
        actionsDiv.className = 'flag-popover-actions';
        actionsDiv.style.marginTop = '10px';

        var btnCancel = document.createElement('button');
        btnCancel.className = 'btn-flag secondary';
        btnCancel.textContent = 'Cancelar';
        btnCancel.addEventListener('click', function () {
            closeEditorPopover();
            DiagramDOM.highlightNode(fromId, false);
            var state = MmdEditor.getState();
            state.edgeSource = null;
        });
        actionsDiv.appendChild(btnCancel);

        var btnCreate = document.createElement('button');
        btnCreate.className = 'btn-flag primary';
        btnCreate.style.background = 'var(--accent)';
        btnCreate.textContent = 'Criar Seta';
        actionsDiv.appendChild(btnCreate);
        pop.appendChild(actionsDiv);

        labelInput.focus();

        function doCreate() {
            var label = labelInput.value.trim();
            MmdEditor.applyEdit(function (c) { return MmdEditor.addEdge(c, fromId, toId, label || null); });
            closeEditorPopover();
            DiagramDOM.highlightNode(fromId, false);
            var state = MmdEditor.getState();
            state.edgeSource = null;
        }

        labelInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') doCreate();
            if (e.key === 'Escape') {
                closeEditorPopover();
                DiagramDOM.highlightNode(fromId, false);
                var state = MmdEditor.getState();
                state.edgeSource = null;
            }
        });
        btnCreate.addEventListener('click', doCreate);
    }

    window.SmartBEditorPopovers = {
        showAddNodePopover: showAddNodePopover,
        showAddEdgePopover: showAddEdgePopover,
        closePopover: closeEditorPopover,
    };
})();
