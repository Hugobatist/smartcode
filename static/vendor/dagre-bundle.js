/**
 * dagre-bundle.js — loads graphlib then dagre for browser use.
 *
 * @dagrejs/dagre@2 internally calls require("@dagrejs/graphlib") which
 * breaks in the browser.  We load graphlib first (it self-registers as
 * window.graphlib) and then monkey-patch the bundler's require so dagre
 * can find it.
 */
(function () {
  'use strict';

  /* ── 1. Inject graphlib ──────────────────────────────────────────── */
  var s1 = document.createElement('script');
  s1.src = 'vendor/graphlib.min.js';
  s1.async = false;                       // keep execution order
  document.head.appendChild(s1);

  /* ── 2. Once graphlib is ready, patch require and inject dagre ──── */
  s1.onload = function () {
    // The dagre CJS bundle calls __require("@dagrejs/graphlib").
    // We intercept that by shimming a global require that resolves it.
    var _origRequire = window.require;     // may be undefined — that's fine
    window.require = function (id) {
      if (id === '@dagrejs/graphlib') return window.graphlib;
      if (typeof _origRequire === 'function') return _origRequire(id);
      throw new Error('Cannot find module "' + id + '"');
    };

    var s2 = document.createElement('script');
    s2.src = 'vendor/dagre.min.js';
    s2.async = false;
    document.head.appendChild(s2);

    s2.onload = function () {
      // Restore original require (or remove shim)
      if (_origRequire) {
        window.require = _origRequire;
      } else {
        delete window.require;
      }
    };
  };
})();
