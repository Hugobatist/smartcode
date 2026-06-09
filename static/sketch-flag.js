/**
 * SmartCode Sketch Flag -- chave de liga/desliga do modo "desenhado à mão"
 * (Wave 2 da reforma visual, estilo Excalidraw). D-25.
 *
 * Regra de segurança: o visual PADRÃO não muda nesta wave. O render à mão
 * (rough.js) só entra quando a chave está LIGADA. Desligada (default), todo o
 * caminho de render é exatamente o de hoje.
 *
 * Como o dono liga: abrir a página com ?sketch=1 na URL.
 *   http://localhost:PORTA/?sketch=1
 * Qualquer outro valor (ou ausência) = desligado.
 *
 * O valor é lido UMA vez (no carregamento) e guardado, para a checagem na
 * fronteira de desenho (svg-shapes.js) ser barata e estável durante a sessão.
 *
 * Dependencies: nenhuma (standalone). Deve carregar ANTES de svg-shapes.js.
 * Dependents: svg-shapes.js (delegação), svg-renderer.js (dot-grid).
 */
(function() {
    'use strict';

    // Lê ?sketch=1 da query string uma única vez. Defensivo: se não houver
    // location/URLSearchParams (ambiente não-browser), fica desligado.
    var enabled = false;
    try {
        var search = (window.location && window.location.search) || '';
        var params = new URLSearchParams(search);
        enabled = params.get('sketch') === '1';
    } catch (e) {
        enabled = false;
    }

    window.SmartCodeSketchFlag = {
        /** true se o modo sketch (hand-drawn) está ligado nesta sessão. */
        isEnabled: function() { return enabled; }
    };
})();
