/**
 * SmartBSessionPlayer -- timeline scrubber, play/pause/speed controls,
 * diff highlighting for session replay.
 * Precomputes cumulative diagram states for O(1) seeking.
 */
var SmartBSessionPlayer = (function() {
    'use strict';

    var state = {
        events: [],
        currentIndex: 0,
        playing: false,
        speed: 1,
        animFrameId: null,
        lastFrameTime: 0,
        diagramStates: [],
        visible: false,
        bboxCache: {},
    };

    // DOM references (set in init)
    var dom = {
        player: null,
        playPause: null,
        scrubber: null,
        speed: null,
        time: null,
        close: null,
    };

    // ── Cumulative State Model ──

    function emptyState() {
        return { nodeIds: new Set(), edgeIds: new Set(), statuses: new Map(), labels: new Map() };
    }

    function cloneState(s) {
        return {
            nodeIds: new Set(s.nodeIds),
            edgeIds: new Set(s.edgeIds),
            statuses: new Map(s.statuses),
            labels: new Map(s.labels),
        };
    }

    function applyEvent(s, ev) {
        var p = ev.payload || {};
        switch (ev.type) {
            case 'node:visited':
            case 'node:added':
                if (p.nodeId) s.nodeIds.add(p.nodeId);
                if (p.nodeId && p.label) s.labels.set(p.nodeId, p.label);
                break;
            case 'node:removed':
                if (p.nodeId) s.nodeIds.delete(p.nodeId);
                break;
            case 'edge:added':
            case 'edge:traversed':
                if (p.edgeId) s.edgeIds.add(p.edgeId);
                break;
            case 'edge:removed':
                if (p.edgeId) s.edgeIds.delete(p.edgeId);
                break;
            case 'status:changed':
                if (p.nodeId && p.status) s.statuses.set(p.nodeId, p.status);
                break;
            default:
                break;
        }
        return s;
    }

    function precomputeStates(events) {
        var states = [];
        var current = emptyState();
        for (var i = 0; i < events.length; i++) {
            current = applyEvent(cloneState(current), events[i]);
            states.push(current);
        }
        return states;
    }

    // ── Diff Computation ──

    function computeDiff(prevState, currState) {
        var added = [];
        var removed = [];
        var modified = [];

        currState.nodeIds.forEach(function(id) {
            if (!prevState.nodeIds.has(id)) {
                added.push(id);
            } else {
                var prevStatus = prevState.statuses.get(id);
                var currStatus = currState.statuses.get(id);
                var prevLabel = prevState.labels.get(id);
                var currLabel = currState.labels.get(id);
                if (prevStatus !== currStatus || prevLabel !== currLabel) {
                    modified.push(id);
                }
            }
        });

        prevState.nodeIds.forEach(function(id) {
            if (!currState.nodeIds.has(id)) {
                removed.push(id);
            }
        });

        return { added: added, removed: removed, modified: modified };
    }

    // ── Diff Highlighting ──

    function clearDiffHighlights() {
        var svg = DiagramDOM.getSVG();
        if (!svg) return;
        var highlighted = svg.querySelectorAll('.diff-added, .diff-removed, .diff-modified');
        for (var i = 0; i < highlighted.length; i++) {
            highlighted[i].classList.remove('diff-added', 'diff-removed', 'diff-modified');
        }
        var ghosts = svg.querySelectorAll('.diff-removed-ghost');
        for (var j = 0; j < ghosts.length; j++) {
            ghosts[j].parentNode.removeChild(ghosts[j]);
        }
    }

    function applyDiffHighlights(diff) {
        clearDiffHighlights();
        var svg = DiagramDOM.getSVG();
        if (!svg) return;

        diff.added.forEach(function(id) {
            var el = DiagramDOM.findNodeElement(id);
            if (el) el.classList.add('diff-added');
        });

        diff.modified.forEach(function(id) {
            var el = DiagramDOM.findNodeElement(id);
            if (el) el.classList.add('diff-modified');
        });

        diff.removed.forEach(function(id) {
            var bbox = state.bboxCache[id];
            if (!bbox) return;
            var ghost = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            ghost.setAttribute('x', bbox.x);
            ghost.setAttribute('y', bbox.y);
            ghost.setAttribute('width', bbox.width);
            ghost.setAttribute('height', bbox.height);
            ghost.classList.add('diff-removed-ghost');
            var g = svg.querySelector('g');
            if (g) g.appendChild(ghost);
        });
    }

    // ── BBox Caching (for removed node ghosts) ──

    function cacheBBoxes() {
        state.bboxCache = {};
        var nodes = DiagramDOM.getAllNodeElements();
        for (var i = 0; i < nodes.length; i++) {
            var el = nodes[i];
            var id = el.getAttribute('data-node-id');
            if (!id) {
                var elId = el.getAttribute('id');
                if (elId) {
                    var m = elId.match(/^flowchart-(.+)-\d+$/);
                    if (m) id = m[1];
                }
            }
            if (id && el.getBBox) {
                try { state.bboxCache[id] = el.getBBox(); } catch (e) { /* ignore */ }
            }
        }
    }

    // ── Frame Application ──

    function applyFrame(index) {
        if (index < 0 || index >= state.diagramStates.length) return;
        state.currentIndex = index;
        cacheBBoxes();

        if (index > 0) {
            var diff = computeDiff(state.diagramStates[index - 1], state.diagramStates[index]);
            applyDiffHighlights(diff);
        } else {
            clearDiffHighlights();
        }
        updateScrubber();
    }

    // ── Playback Controls ──

    function play() {
        if (state.events.length === 0) return;
        if (state.currentIndex >= state.events.length - 1) {
            state.currentIndex = 0;
            applyFrame(0);
        }
        state.playing = true;
        state.lastFrameTime = performance.now();
        dom.playPause.textContent = 'Pause';
        state.animFrameId = requestAnimationFrame(tick);
    }

    function pause() {
        state.playing = false;
        if (state.animFrameId) cancelAnimationFrame(state.animFrameId);
        state.animFrameId = null;
        if (dom.playPause) dom.playPause.textContent = 'Play';
    }

    function tick(now) {
        if (!state.playing) return;
        if (state.currentIndex >= state.events.length - 1) { pause(); return; }

        var elapsed = (now - state.lastFrameTime) * state.speed;
        var nextEvent = state.events[state.currentIndex + 1];
        var currEvent = state.events[state.currentIndex];
        var timeDelta = (nextEvent.ts - currEvent.ts) || 500;

        if (elapsed >= timeDelta) {
            state.currentIndex++;
            state.lastFrameTime = now;
            applyFrame(state.currentIndex);
        }
        state.animFrameId = requestAnimationFrame(tick);
    }

    function seekTo(index) {
        var clamped = Math.max(0, Math.min(index, state.events.length - 1));
        applyFrame(clamped);
    }

    // ── Session Loading ──

    function loadSession(sessionId) {
        return fetch((window.SmartBBaseUrl || '') + '/api/session/' + encodeURIComponent(sessionId))
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (!data.events || data.events.length === 0) return;
                state.events = data.events;
                state.diagramStates = precomputeStates(state.events);
                state.currentIndex = 0;
                dom.scrubber.max = state.events.length - 1;
                show();
                applyFrame(0);
            })
            .catch(function(err) {
                console.warn('Failed to load session:', err.message);
            });
    }

    function handleSessionEvent(sessionId, event) {
        if (!state.visible) return;
        state.events.push(event);
        var prev = state.diagramStates.length > 0
            ? state.diagramStates[state.diagramStates.length - 1]
            : emptyState();
        state.diagramStates.push(applyEvent(cloneState(prev), event));
        dom.scrubber.max = state.events.length - 1;
        if (state.currentIndex === state.events.length - 2) {
            state.currentIndex = state.events.length - 1;
            applyFrame(state.currentIndex);
        }
        updateScrubber();
    }

    // ── Session List ──

    function fetchSessionList(file) {
        if (!file) return Promise.resolve([]);
        return fetch((window.SmartBBaseUrl || '') + '/api/sessions/' + encodeURIComponent(file))
            .then(function(r) { return r.ok ? r.json() : { sessions: [] }; })
            .then(function(data) {
                renderSessionList(data.sessions || []);
                return data.sessions || [];
            })
            .catch(function() { renderSessionList([]); return []; });
    }

    function renderSessionList(sessions) {
        var list = document.getElementById('sessionList');
        if (!list) return;
        // Clear existing items safely
        while (list.firstChild) list.removeChild(list.firstChild);
        if (sessions.length === 0) {
            var empty = document.createElement('div');
            empty.style.cssText = 'padding:8px;color:#71717a;font-size:12px;';
            empty.textContent = 'No sessions recorded';
            list.appendChild(empty);
            return;
        }
        sessions.forEach(function(s) {
            var item = document.createElement('div');
            item.className = 'session-list-item';
            var dur = s.duration ? Math.round(s.duration / 1000) + 's' : '?';
            item.textContent = s.sessionId.substring(0, 8) + ' (' + s.totalEvents + ' events, ' + dur + ')';
            item.addEventListener('click', function() {
                loadSession(s.sessionId);
                toggleSessionDropdown(false);
            });
            list.appendChild(item);
        });
    }

    function toggleSessionDropdown(forceState) {
        var dd = document.getElementById('sessionDropdown');
        if (!dd) return;
        var shouldShow = typeof forceState === 'boolean' ? forceState : dd.classList.contains('hidden');
        if (shouldShow) {
            dd.classList.remove('hidden');
            var file = window.SmartBFileTree ? SmartBFileTree.getCurrentFile() : null;
            fetchSessionList(file);
        } else {
            dd.classList.add('hidden');
        }
    }

    // ── Visibility ──

    function show() {
        state.visible = true;
        if (dom.player) dom.player.classList.remove('hidden');
    }

    function close() {
        pause();
        clearDiffHighlights();
        state.visible = false;
        state.events = [];
        state.diagramStates = [];
        state.currentIndex = 0;
        state.bboxCache = {};
        if (dom.player) dom.player.classList.add('hidden');
        if (dom.scrubber) { dom.scrubber.value = 0; dom.scrubber.max = 0; }
        if (dom.time) dom.time.textContent = '0 / 0';
    }

    // ── Scrubber ──

    function updateScrubber() {
        if (dom.scrubber) dom.scrubber.value = state.currentIndex;
        if (dom.time) {
            dom.time.textContent = (state.currentIndex + 1) + ' / ' + state.events.length;
        }
    }

    // ── Initialization ──

    function init() {
        dom.player = document.getElementById('sessionPlayer');
        dom.playPause = document.getElementById('spPlayPause');
        dom.scrubber = document.getElementById('spScrubber');
        dom.speed = document.getElementById('spSpeed');
        dom.time = document.getElementById('spTime');
        dom.close = document.getElementById('spClose');

        if (dom.playPause) {
            dom.playPause.addEventListener('click', function() {
                state.playing ? pause() : play();
            });
        }
        if (dom.scrubber) {
            dom.scrubber.addEventListener('input', function() {
                seekTo(parseInt(dom.scrubber.value, 10));
            });
        }
        if (dom.speed) {
            dom.speed.addEventListener('change', function() {
                state.speed = parseFloat(dom.speed.value);
            });
        }
        if (dom.close) {
            dom.close.addEventListener('click', close);
        }

        // Sessions button dropdown toggle
        var btn = document.getElementById('btnSessions');
        if (btn) {
            btn.addEventListener('click', function() { toggleSessionDropdown(); });
        }

        // Close dropdown on outside click
        document.addEventListener('click', function(e) {
            var dd = document.getElementById('sessionDropdown');
            var btn2 = document.getElementById('btnSessions');
            if (dd && !dd.contains(e.target) && e.target !== btn2) {
                dd.classList.add('hidden');
            }
        });
    }

    return {
        init: init,
        loadSession: loadSession,
        handleSessionEvent: handleSessionEvent,
        fetchSessionList: fetchSessionList,
        toggleSessionDropdown: toggleSessionDropdown,
        show: show,
        close: close,
        isVisible: function() { return state.visible; },
        isPlaying: function() { return state.playing; },
        getIndex: function() { return state.currentIndex; },
        play: play,
        pause: pause,
        seekTo: seekTo,
    };
})();
