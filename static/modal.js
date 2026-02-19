/**
 * SmartB Modal -- reusable prompt/confirm replacement.
 * Replaces native prompt() and confirm() with styled modals.
 *
 * Dependencies: modal.css
 *
 * Usage:
 *   SmartBModal.prompt({ title, placeholder, defaultValue, onConfirm });
 *   SmartBModal.confirm({ title, message, danger, onConfirm });
 *   SmartBModal.close();
 */
(function() {
    'use strict';

    var backdrop = null;
    var outsideHandler = null;

    function close() {
        if (outsideHandler) {
            document.removeEventListener('mousedown', outsideHandler);
            outsideHandler = null;
        }
        if (backdrop) {
            backdrop.remove();
            backdrop = null;
        }
    }

    function createBackdrop() {
        close();
        var el = document.createElement('div');
        el.className = 'smartb-modal-backdrop';
        document.body.appendChild(el);
        backdrop = el;

        // Outside-click dismiss (setTimeout pattern like context-menu.js)
        setTimeout(function() {
            outsideHandler = function(e) {
                if (e.target === backdrop) close();
            };
            document.addEventListener('mousedown', outsideHandler);
        }, 50);

        return el;
    }

    function createCard(titleText) {
        var card = document.createElement('div');
        card.className = 'smartb-modal-card';

        var title = document.createElement('div');
        title.className = 'smartb-modal-title';
        title.textContent = titleText || '';
        card.appendChild(title);

        return card;
    }

    function createActions() {
        var actions = document.createElement('div');
        actions.className = 'smartb-modal-actions';
        return actions;
    }

    function createButton(text, variant) {
        var btn = document.createElement('button');
        btn.className = 'smartb-modal-btn smartb-modal-btn--' + variant;
        btn.textContent = text;
        return btn;
    }

    // ── Prompt Modal ──

    function showPrompt(opts) {
        var title = opts.title || 'Input';
        var placeholder = opts.placeholder || '';
        var defaultValue = opts.defaultValue || '';
        var onConfirm = opts.onConfirm;

        var bg = createBackdrop();
        var card = createCard(title);

        var input = document.createElement('input');
        input.className = 'smartb-modal-input';
        input.type = 'text';
        input.placeholder = placeholder;
        input.value = defaultValue;
        card.appendChild(input);

        var actions = createActions();
        var btnCancel = createButton('Cancel', 'secondary');
        var btnOk = createButton('OK', 'primary');
        actions.appendChild(btnCancel);
        actions.appendChild(btnOk);
        card.appendChild(actions);

        bg.appendChild(card);

        // Focus and select input content
        input.focus();
        if (defaultValue) input.select();

        function doConfirm() {
            var val = input.value.trim();
            if (!val && !opts.allowEmpty) return;
            close();
            if (onConfirm) onConfirm(val);
        }

        btnOk.addEventListener('click', doConfirm);
        btnCancel.addEventListener('click', close);

        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') doConfirm();
            if (e.key === 'Escape') close();
        });
    }

    // ── Confirm Modal ──

    function showConfirm(opts) {
        var title = opts.title || 'Confirm';
        var message = opts.message || '';
        var danger = opts.danger || false;
        var onConfirm = opts.onConfirm;

        var bg = createBackdrop();
        var card = createCard(title);

        if (message) {
            var msg = document.createElement('div');
            msg.className = 'smartb-modal-message';
            msg.textContent = message;
            card.appendChild(msg);
        }

        var actions = createActions();
        var btnCancel = createButton('Cancel', 'secondary');
        var btnOk = createButton(danger ? 'Delete' : 'OK', danger ? 'danger' : 'primary');
        actions.appendChild(btnCancel);
        actions.appendChild(btnOk);
        card.appendChild(actions);

        bg.appendChild(card);

        btnOk.focus();

        btnOk.addEventListener('click', function() {
            close();
            if (onConfirm) onConfirm();
        });
        btnCancel.addEventListener('click', close);

        // Escape to close
        function onKey(e) {
            if (e.key === 'Escape') {
                close();
                document.removeEventListener('keydown', onKey);
            }
        }
        document.addEventListener('keydown', onKey);
    }

    // ── Public API ──

    window.SmartBModal = {
        prompt: showPrompt,
        confirm: showConfirm,
        close: close,
    };
})();
