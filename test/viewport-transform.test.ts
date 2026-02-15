import { describe, it, expect } from 'vitest';

// ── ViewportTransform pure-math re-implementation for testing ───────────────
// The production version lives in static/viewport-transform.js as a browser IIFE.
// We re-implement the pure math here to test coordinate conversions directly.

class ViewportTransform {
  x = 0;
  y = 0;
  zoom = 1;

  screenToGraph(sx: number, sy: number) {
    return { x: (sx - this.x) / this.zoom, y: (sy - this.y) / this.zoom };
  }

  graphToScreen(gx: number, gy: number) {
    return { x: gx * this.zoom + this.x, y: gy * this.zoom + this.y };
  }

  zoomToFit(gw: number, gh: number, cw: number, ch: number) {
    if (gw <= 0 || gh <= 0 || cw <= 0 || ch <= 0) return;
    const padFraction = 0.92;
    const scaleX = (cw * padFraction) / gw;
    const scaleY = (ch * padFraction) / gh;
    this.zoom = Math.min(scaleX, scaleY, 2.5);
    this.x = (cw - gw * this.zoom) / 2;
    this.y = (ch - gh * this.zoom) / 2;
  }

  setTransform(x: number, y: number, zoom: number) {
    this.x = x;
    this.y = y;
    this.zoom = zoom;
  }

  getTransform() {
    return { x: this.x, y: this.y, zoom: this.zoom };
  }
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('ViewportTransform - coordinate conversion', () => {
  it('screenToGraph at zoom=1 pan=(0,0) returns unchanged coordinates', () => {
    const vt = new ViewportTransform();
    const result = vt.screenToGraph(150, 200);
    expect(result).toEqual({ x: 150, y: 200 });
  });

  it('graphToScreen at zoom=1 pan=(0,0) returns unchanged coordinates', () => {
    const vt = new ViewportTransform();
    const result = vt.graphToScreen(150, 200);
    expect(result).toEqual({ x: 150, y: 200 });
  });

  it('screenToGraph(graphToScreen(x,y)) is identity at zoom=0.5', () => {
    const vt = new ViewportTransform();
    vt.setTransform(30, 50, 0.5);
    const screen = vt.graphToScreen(100, 200);
    const back = vt.screenToGraph(screen.x, screen.y);
    expect(back.x).toBeCloseTo(100, 10);
    expect(back.y).toBeCloseTo(200, 10);
  });

  it('graphToScreen(screenToGraph(x,y)) is identity at zoom=2.0', () => {
    const vt = new ViewportTransform();
    vt.setTransform(10, 20, 2.0);
    const graph = vt.screenToGraph(300, 400);
    const back = vt.graphToScreen(graph.x, graph.y);
    expect(back.x).toBeCloseTo(300, 10);
    expect(back.y).toBeCloseTo(400, 10);
  });

  it('round-trip at zoom=3.0 with non-zero pan', () => {
    const vt = new ViewportTransform();
    vt.setTransform(-120, 75, 3.0);
    const screen = vt.graphToScreen(42, 88);
    const back = vt.screenToGraph(screen.x, screen.y);
    expect(back.x).toBeCloseTo(42, 10);
    expect(back.y).toBeCloseTo(88, 10);
  });
});

describe('ViewportTransform - zoomToFit', () => {
  it('zoomToFit(100,100, 800,600) centers and caps zoom at 2.5', () => {
    const vt = new ViewportTransform();
    vt.zoomToFit(100, 100, 800, 600);
    // scaleX = (800*0.92)/100 = 7.36, scaleY = (600*0.92)/100 = 5.52
    // min(7.36, 5.52, 2.5) = 2.5
    expect(vt.zoom).toBe(2.5);
    // x = (800 - 100*2.5)/2 = (800 - 250)/2 = 275
    expect(vt.x).toBe(275);
    // y = (600 - 100*2.5)/2 = (600 - 250)/2 = 175
    expect(vt.y).toBe(175);
  });

  it('zoomToFit wide graph (1000x100, 800x600) uses scaleX', () => {
    const vt = new ViewportTransform();
    vt.zoomToFit(1000, 100, 800, 600);
    // scaleX = (800*0.92)/1000 = 0.736
    // scaleY = (600*0.92)/100 = 5.52
    // min(0.736, 5.52, 2.5) = 0.736
    expect(vt.zoom).toBeCloseTo(0.736, 5);
    // Graph is centered horizontally and vertically
    const expectedX = (800 - 1000 * 0.736) / 2;
    const expectedY = (600 - 100 * 0.736) / 2;
    expect(vt.x).toBeCloseTo(expectedX, 5);
    expect(vt.y).toBeCloseTo(expectedY, 5);
  });

  it('zoomToFit tall graph (100x1000, 800x600) uses scaleY', () => {
    const vt = new ViewportTransform();
    vt.zoomToFit(100, 1000, 800, 600);
    // scaleX = (800*0.92)/100 = 7.36
    // scaleY = (600*0.92)/1000 = 0.552
    // min(7.36, 0.552, 2.5) = 0.552
    expect(vt.zoom).toBeCloseTo(0.552, 5);
    const expectedX = (800 - 100 * 0.552) / 2;
    const expectedY = (600 - 1000 * 0.552) / 2;
    expect(vt.x).toBeCloseTo(expectedX, 5);
    expect(vt.y).toBeCloseTo(expectedY, 5);
  });

  it('zoomToFit with zero/negative dimensions is a no-op', () => {
    const vt = new ViewportTransform();
    vt.setTransform(10, 20, 1.5);
    vt.zoomToFit(0, 100, 800, 600);
    expect(vt.getTransform()).toEqual({ x: 10, y: 20, zoom: 1.5 });
  });
});

describe('ViewportTransform - setTransform/getTransform', () => {
  it('setTransform/getTransform round-trip preserves values', () => {
    const vt = new ViewportTransform();
    vt.setTransform(-50, 123.456, 0.75);
    const t = vt.getTransform();
    expect(t).toEqual({ x: -50, y: 123.456, zoom: 0.75 });
  });

  it('default transform is identity (0,0, zoom=1)', () => {
    const vt = new ViewportTransform();
    expect(vt.getTransform()).toEqual({ x: 0, y: 0, zoom: 1 });
  });
});
