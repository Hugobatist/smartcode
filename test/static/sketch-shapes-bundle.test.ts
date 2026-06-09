import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import {
  SKETCH_SHAPES,
  seedFromId as srcSeedFromId,
  shapeToSketchKind,
} from '../../src/render/sketch-geometry.js';

/**
 * Guarda o bundle de navegador (static/vendor/sketch-shapes.js) contra drift da
 * fonte TypeScript (src/render/sketch-shapes.ts + sketch-geometry.ts).
 *
 * O bundle é o que o viewer roda de fato no navegador. Se ele ficar stale, o
 * desenho à mão divergiria silenciosamente da lógica testada — o mesmo modo de
 * falha que o guard de annotations-core.js elimina. Quando este teste falhar,
 * o conserto é: rodar `npm run build` para regenerar o bundle e commitá-lo.
 *
 * Como não há jsdom no projeto, montamos um DOM mínimo em memória e carregamos
 * o vendor rough.min.js (real) + o bundle, ambos via vm.
 */

const vendorDir = join(import.meta.dirname, '..', '..', 'static', 'vendor');
const roughSrc = readFileSync(join(vendorDir, 'rough.min.js'), 'utf-8');
const bundleSrc = readFileSync(join(vendorDir, 'sketch-shapes.js'), 'utf-8');

// ── DOM mínimo: só o que o bundle usa (createElementNS + querySelectorAll). ──
interface FakeEl {
  tagName: string;
  children: FakeEl[];
  attrs: Record<string, string>;
  setAttribute(k: string, v: string): void;
  getAttribute(k: string): string | null;
  appendChild(c: FakeEl): FakeEl;
  querySelectorAll(sel: string): FakeEl[];
  ownerDocument: unknown;
}

function makeDoc() {
  const doc: { createElementNS(ns: string, tag: string): FakeEl; documentElement: unknown } = {
    createElementNS(_ns: string, tag: string): FakeEl {
      const el: FakeEl = {
        tagName: tag,
        children: [],
        attrs: {},
        setAttribute(k, v) { this.attrs[k] = String(v); },
        getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k]! : null; },
        appendChild(c) { this.children.push(c); return c; },
        querySelectorAll(sel) {
          const out: FakeEl[] = [];
          const want = sel.replace(/^\./, '');
          const byClass = sel[0] === '.';
          const walk = (node: FakeEl) => {
            for (const ch of node.children) {
              const cls = (ch.attrs['class'] || '').split(/\s+/);
              if (byClass ? cls.indexOf(want) !== -1 : ch.tagName === sel) out.push(ch);
              walk(ch);
            }
          };
          walk(this);
          return out;
        },
        get ownerDocument() { return doc; },
      };
      return el;
    },
    documentElement: {},
  };
  return doc;
}

function loadBundle() {
  const doc = makeDoc();
  const sandbox: Record<string, unknown> = {
    document: doc,
    getComputedStyle: () => ({
      getPropertyValue: (n: string) =>
        n === '--node-ink' ? '#4263c9' : n === '--node-fill' ? '#e8f0fe' : '',
    }),
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  runInNewContext(roughSrc, sandbox);
  runInNewContext(bundleSrc, sandbox);
  return sandbox.SmartCodeSketchShapes as {
    render(shape: string, w: number, h: number, seed?: string | number): FakeEl;
    paintShape(scope: FakeEl, fill: string | null, stroke: string | null, op?: string | null): boolean;
    getRough(): unknown;
    seedFromId(id: string): number;
  };
}

const expectedHitTag: Record<string, string> = {
  circle: 'circle',
  diamond: 'polygon',
  hexagon: 'polygon',
  asymmetric: 'polygon',
  parallelogram: 'polygon',
  'parallelogram-alt': 'polygon',
  trapezoid: 'polygon',
  'trapezoid-alt': 'polygon',
  cylinder: 'path',
  subroutine: 'rect',
  rect: 'rect',
  rounded: 'rect',
  stadium: 'rect',
};

describe('vendor/sketch-shapes.js bundle', () => {
  const API = loadBundle();

  it('expõe a API como o global SmartCodeSketchShapes', () => {
    expect(typeof API.render).toBe('function');
    expect(typeof API.paintShape).toBe('function');
    expect(typeof API.getRough).toBe('function');
    expect(typeof API.seedFromId).toBe('function');
  });

  it('seedFromId do bundle bate com a fonte TS (sem drift)', () => {
    for (const id of ['NODE_A', 'START', 'L-1->2', 'investigar', '']) {
      expect(API.seedFromId(id)).toBe(srcSeedFromId(id));
    }
  });

  it('render produz <g class="smartcode-shape"> com hit + sketch para todas as formas', () => {
    for (const shape of [...SKETCH_SHAPES, 'UNKNOWN']) {
      const g = API.render(shape, 120, 60, 'NODE_' + shape);
      expect(g.getAttribute('class')).toBe('smartcode-shape');

      const hits = g.querySelectorAll('.smartcode-shape-hit');
      expect(hits.length).toBe(1);
      // tag da forma de hit bate com a primitiva esperada da fonte
      const expectTag = expectedHitTag[shape] ?? 'rect';
      expect(hits[0]!.tagName).toBe(expectTag);
      // fill pastel inicial + stroke none (status repinta depois)
      expect(hits[0]!.getAttribute('fill')).toBe('#e8f0fe');
      expect(hits[0]!.getAttribute('stroke')).toBe('none');

      const sketch = g.querySelectorAll('.smartcode-sketch');
      expect(sketch.length).toBe(1);
      // o traço rough tem ao menos 1 path marcado para pintura
      const strokes = g.querySelectorAll('.smartcode-sketch-stroke');
      expect(strokes.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('subroutine normaliza para rect de hit + 3 traços (rect + 2 linhas)', () => {
    const g = API.render('subroutine', 120, 60, 'SUB');
    expect(g.querySelectorAll('.smartcode-shape-hit')[0]!.tagName).toBe('rect');
    expect(g.querySelectorAll('.smartcode-sketch-stroke').length).toBe(3);
  });

  it('é determinístico: mesmo id → traço idêntico; ids diferentes → traços diferentes', () => {
    const dPaths = (g: FakeEl) =>
      g.querySelectorAll('path').map((p) => p.getAttribute('d')).join('|');
    const a = API.render('rect', 120, 60, 'X');
    const b = API.render('rect', 120, 60, 'X');
    const c = API.render('rect', 120, 60, 'Y');
    expect(dPaths(a)).toBe(dPaths(b));
    expect(dPaths(a)).not.toBe(dPaths(c));
  });

  it('paintShape pinta a forma de hit (fill) e o traço rough (stroke) — D-02', () => {
    const g = API.render('rect', 120, 60, 'Z');
    const ok = API.paintShape(g, '#e6f6ec', '#2f8f57');
    expect(ok).toBe(true);
    expect(g.querySelectorAll('.smartcode-shape-hit')[0]!.getAttribute('fill')).toBe('#e6f6ec');
    expect(g.querySelectorAll('.smartcode-sketch-stroke')[0]!.getAttribute('stroke')).toBe('#2f8f57');
  });

  it('a contagem de pontos do hit polígono bate com a geometria da fonte', () => {
    // diamond: 4 pontos na fonte → polygon de 4 vértices "x,y x,y ..."
    const g = API.render('diamond', 120, 60, 'D');
    const hit = g.querySelectorAll('.smartcode-shape-hit')[0]!;
    const pts = (hit.getAttribute('points') || '').trim().split(/\s+/);
    const kind = shapeToSketchKind('diamond', 120, 60);
    if (kind.kind === 'polygon') expect(pts.length).toBe(kind.points.length);
  });
});
