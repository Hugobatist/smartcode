"use strict";
var SmartCodeSketchShapes = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/render/sketch-shapes.ts
  var sketch_shapes_exports = {};
  __export(sketch_shapes_exports, {
    getRough: () => getRoughSvg,
    paintShape: () => paintShape,
    render: () => render,
    seedFromId: () => seedFromId
  });

  // src/render/sketch-geometry.ts
  var SKETCH_SHAPES = [
    "rect",
    "rounded",
    "stadium",
    "diamond",
    "circle",
    "hexagon",
    "subroutine",
    "cylinder",
    "asymmetric",
    "parallelogram",
    "parallelogram-alt",
    "trapezoid",
    "trapezoid-alt"
  ];
  function resolveShapeName(shape) {
    if (shape && SKETCH_SHAPES.indexOf(shape) !== -1) return shape;
    return "rect";
  }
  function seedFromId(id) {
    let h = 0;
    for (let i = 0; i < id.length; i++) {
      h = (h << 5) - h + id.charCodeAt(i) | 0;
    }
    return Math.abs(h) % 1e5;
  }
  function diamondPoints(w, h) {
    return [
      [0, -h / 2],
      [w / 2, 0],
      [0, h / 2],
      [-w / 2, 0]
    ];
  }
  function hexagonPoints(w, h) {
    const dx = h / 4;
    return [
      [-w / 2 + dx, -h / 2],
      [w / 2 - dx, -h / 2],
      [w / 2, 0],
      [w / 2 - dx, h / 2],
      [-w / 2 + dx, h / 2],
      [-w / 2, 0]
    ];
  }
  function asymmetricPoints(w, h) {
    const notch = h / 4;
    return [
      [-w / 2, -h / 2],
      [w / 2, -h / 2],
      [w / 2 - notch, 0],
      [w / 2, h / 2],
      [-w / 2, h / 2]
    ];
  }
  function parallelogramPoints(w, h) {
    const skew = h * 0.3;
    return [
      [-w / 2 + skew, -h / 2],
      [w / 2, -h / 2],
      [w / 2 - skew, h / 2],
      [-w / 2, h / 2]
    ];
  }
  function parallelogramAltPoints(w, h) {
    const skew = h * 0.3;
    return [
      [-w / 2, -h / 2],
      [w / 2 - skew, -h / 2],
      [w / 2, h / 2],
      [-w / 2 + skew, h / 2]
    ];
  }
  function trapezoidPoints(w, h) {
    const dx = w * 0.15;
    return [
      [-w / 2 + dx, -h / 2],
      [w / 2 - dx, -h / 2],
      [w / 2, h / 2],
      [-w / 2, h / 2]
    ];
  }
  function trapezoidAltPoints(w, h) {
    const dx = w * 0.15;
    return [
      [-w / 2, -h / 2],
      [w / 2, -h / 2],
      [w / 2 - dx, h / 2],
      [-w / 2 + dx, h / 2]
    ];
  }
  function cylinderPath(w, h) {
    const rx = w / 2;
    const ry = 8;
    const bodyTop = -h / 2 + ry;
    const bodyBottom = h / 2 - ry;
    return "M " + -rx + " " + bodyTop + " A " + rx + " " + ry + " 0 0 1 " + rx + " " + bodyTop + " L " + rx + " " + bodyBottom + " A " + rx + " " + ry + " 0 0 1 " + -rx + " " + bodyBottom + " L " + -rx + " " + bodyTop + " A " + rx + " " + ry + " 0 0 0 " + rx + " " + bodyTop;
  }
  function shapeToSketchKind(shape, w, h) {
    const name = resolveShapeName(shape);
    switch (name) {
      case "diamond":
        return { kind: "polygon", points: diamondPoints(w, h) };
      case "hexagon":
        return { kind: "polygon", points: hexagonPoints(w, h) };
      case "asymmetric":
        return { kind: "polygon", points: asymmetricPoints(w, h) };
      case "parallelogram":
        return { kind: "polygon", points: parallelogramPoints(w, h) };
      case "parallelogram-alt":
        return { kind: "polygon", points: parallelogramAltPoints(w, h) };
      case "trapezoid":
        return { kind: "polygon", points: trapezoidPoints(w, h) };
      case "trapezoid-alt":
        return { kind: "polygon", points: trapezoidAltPoints(w, h) };
      case "circle":
        return { kind: "circle", diameter: Math.max(w, h) };
      case "cylinder":
        return { kind: "path", d: cylinderPath(w, h) };
      case "subroutine":
        return { kind: "subroutine", w, h, inset: 8 };
      case "rect":
      case "rounded":
      case "stadium":
      default:
        return { kind: "rect", w, h };
    }
  }

  // src/render/sketch-shapes.ts
  var G = globalThis;
  var NS = "http://www.w3.org/2000/svg";
  var ROUGH_BASE = {
    roughness: 1.1,
    bowing: 1,
    strokeWidth: 1.8,
    fillStyle: "solid",
    fillWeight: 1.4,
    hachureGap: 5
  };
  function el(tag) {
    if (!G.document) throw new Error("SmartCodeSketchShapes: document indispon\xEDvel");
    return G.document.createElementNS(NS, tag);
  }
  function setAttrs(node, map) {
    for (const key in map) {
      if (Object.prototype.hasOwnProperty.call(map, key)) {
        node.setAttribute(key, String(map[key]));
      }
    }
    return node;
  }
  function forEachNode(list, fn) {
    for (let i = 0; i < list.length; i++) {
      const node = list[i];
      if (node) fn(node);
    }
  }
  function readToken(name, fallback) {
    try {
      if (!G.getComputedStyle) return fallback;
      const v = G.getComputedStyle(globalThis.document?.documentElement).getPropertyValue(name).trim();
      return v || fallback;
    } catch {
      return fallback;
    }
  }
  var _rc = null;
  function getRough() {
    if (_rc) return _rc;
    if (!G.rough) throw new Error("SmartCodeSketchShapes: window.rough indispon\xEDvel (vendor n\xE3o carregou)");
    const root = el("svg");
    _rc = G.rough.svg(root);
    return _rc;
  }
  function buildHitShape(shape, w, h) {
    const name = resolveShapeName(shape);
    const kind = shapeToSketchKind(name, w, h);
    if (kind.kind === "circle") {
      return setAttrs(el("circle"), { cx: 0, cy: 0, r: kind.diameter / 2 });
    }
    if (kind.kind === "polygon") {
      const pts = kind.points.map((p) => p[0] + "," + p[1]).join(" ");
      return setAttrs(el("polygon"), { points: pts });
    }
    if (kind.kind === "path" || kind.kind === "subroutine") {
      if (kind.kind === "path") return setAttrs(el("path"), { d: kind.d });
      return setAttrs(el("rect"), { x: -w / 2, y: -h / 2, width: w, height: h, rx: rectRadius(name, h) });
    }
    return setAttrs(el("rect"), {
      x: -w / 2,
      y: -h / 2,
      width: w,
      height: h,
      rx: rectRadius(name, h)
    });
  }
  function rectRadius(name, h) {
    if (name === "rounded") return 8;
    if (name === "stadium") return h / 2;
    return 0;
  }
  function buildSketch(shape, w, h, seed, ink) {
    const rc = getRough();
    const kind = shapeToSketchKind(shape, w, h);
    const strokeOpts = {
      roughness: ROUGH_BASE.roughness,
      bowing: ROUGH_BASE.bowing,
      strokeWidth: ROUGH_BASE.strokeWidth,
      stroke: ink,
      seed
    };
    const sketch = el("g");
    sketch.setAttribute("class", "smartcode-sketch");
    if (kind.kind === "circle") {
      sketch.appendChild(rc.circle(0, 0, kind.diameter, strokeOpts));
    } else if (kind.kind === "polygon") {
      sketch.appendChild(rc.polygon(kind.points, strokeOpts));
    } else if (kind.kind === "path") {
      sketch.appendChild(rc.path(kind.d, strokeOpts));
    } else if (kind.kind === "rect") {
      sketch.appendChild(rc.rectangle(-kind.w / 2, -kind.h / 2, kind.w, kind.h, strokeOpts));
    } else {
      sketch.appendChild(rc.rectangle(-kind.w / 2, -kind.h / 2, kind.w, kind.h, strokeOpts));
      const xl = -kind.w / 2 + kind.inset;
      const xr = kind.w / 2 - kind.inset;
      sketch.appendChild(rc.line(xl, -kind.h / 2, xl, kind.h / 2, strokeOpts));
      sketch.appendChild(rc.line(xr, -kind.h / 2, xr, kind.h / 2, strokeOpts));
    }
    forEachNode(sketch.querySelectorAll("path"), (p) => {
      p.setAttribute("class", "smartcode-sketch-stroke");
      p.setAttribute("pointer-events", "none");
    });
    return sketch;
  }
  function render(shape, w, h, seed) {
    const group = el("g");
    group.setAttribute("class", "smartcode-shape");
    const ink = readToken("--node-ink", "#4263c9");
    const fill = readToken("--node-fill", "#e8f0fe");
    const hit = buildHitShape(shape, w, h);
    hit.setAttribute("class", "smartcode-shape-hit");
    setAttrs(hit, { fill, stroke: "none" });
    group.appendChild(hit);
    const seedNum = typeof seed === "number" ? seed : seedFromId(seed != null ? String(seed) : shape + w + "x" + h);
    const sketch = buildSketch(shape, w, h, seedNum, ink);
    group.appendChild(sketch);
    return group;
  }
  function paintShape(scope, fill, stroke, fillOpacity) {
    const hits = scope.querySelectorAll(".smartcode-shape-hit");
    if (!hits || hits.length === 0) return false;
    forEachNode(hits, (hit) => {
      if (fill != null) hit.setAttribute("fill", fill);
      if (fillOpacity != null) hit.setAttribute("fill-opacity", fillOpacity);
    });
    if (stroke != null) {
      forEachNode(scope.querySelectorAll(".smartcode-sketch-stroke"), (s) => {
        s.setAttribute("stroke", stroke);
      });
    }
    return true;
  }
  function getRoughSvg() {
    return getRough();
  }
  return __toCommonJS(sketch_shapes_exports);
})();
