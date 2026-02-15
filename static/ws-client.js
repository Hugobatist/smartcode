// ws-client.js -- Reconnecting WebSocket client with exponential backoff + jitter
// Browser-native WebSocket API only -- no npm dependencies

/**
 * Creates a WebSocket connection that automatically reconnects with exponential backoff.
 *
 * @param {string} url - WebSocket URL (e.g., 'ws://localhost:3333/ws')
 * @param {function} onMessage - Called with parsed JSON message on each incoming message
 * @param {function} onStatusChange - Called with status string: 'connected' | 'disconnected' | 'reconnecting'
 * @returns {{ close: function }} - Object with close() method to teardown the connection
 */
function createReconnectingWebSocket(url, onMessage, onStatusChange) {
  var ws = null;
  var attempt = 0;
  var timer = null;
  var BASE_DELAY = 500;    // 500ms initial delay
  var MAX_DELAY = 16000;   // 16s cap
  var MAX_ATTEMPTS = Infinity;

  function connect() {
    // Guard: don't create a new connection if one is already open or connecting
    if (ws && ws.readyState < 2) return;

    ws = new WebSocket(url);

    ws.onopen = function () {
      attempt = 0;
      onStatusChange('connected');
    };

    ws.onmessage = function (event) {
      try {
        var msg = JSON.parse(event.data);
        onMessage(msg);
      } catch (e) {
        console.error('WS parse error:', e);
      }
    };

    ws.onclose = function () {
      onStatusChange('disconnected');
      scheduleReconnect();
    };

    ws.onerror = function () {
      // No-op: onclose fires after onerror
    };
  }

  function scheduleReconnect() {
    var delay = Math.min(BASE_DELAY * Math.pow(2, attempt), MAX_DELAY);
    var jitter = delay * (0.5 + Math.random() * 0.5); // 50-100% of delay
    attempt++;
    onStatusChange('reconnecting');
    timer = setTimeout(connect, jitter);
  }

  function close() {
    clearTimeout(timer);
    if (ws) ws.close();
  }

  // Connect immediately
  connect();

  return { close: close };
}
