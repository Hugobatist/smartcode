import { describe, it, expect } from 'vitest';
import {
  SKETCH_SHAPES,
  resolveShapeName,
  seedFromId,
  shapeToSketchKind,
} from '../../src/render/sketch-geometry.js';

/**
 * Testes da lógica PURA da camada de desenho à mão (sem DOM). Cobre:
 *  - seed determinístico (estabilidade visual — nós não "dançam")
 *  - escolha de primitiva por forma (as 13 + fallback + subroutine normalizado)
 *  - espelhamento da geometria de svg-shapes.js (pontos exatos)
 */

describe('seedFromId — determinismo', () => {
  it('é estável: mesmo id → mesmo seed', () => {
    expect(seedFromId('NODE_A')).toBe(seedFromId('NODE_A'));
    expect(seedFromId('investigar->fix')).toBe(seedFromId('investigar->fix'));
  });

  it('ids diferentes → seeds (quase sempre) diferentes', () => {
    expect(seedFromId('A')).not.toBe(seedFromId('B'));
    expect(seedFromId('START')).not.toBe(seedFromId('END'));
  });

  it('está sempre no intervalo [0, 100000)', () => {
    for (const id of ['', 'x', 'um id bem longo com acentuação çãõ', 'L-1->2']) {
      const s = seedFromId(id);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(100000);
      expect(Number.isInteger(s)).toBe(true);
    }
  });

  it('string vazia é tratada (seed 0)', () => {
    expect(seedFromId('')).toBe(0);
  });
});

describe('resolveShapeName — fallback', () => {
  it('mantém formas conhecidas', () => {
    for (const s of SKETCH_SHAPES) {
      expect(resolveShapeName(s)).toBe(s);
    }
  });
  it('cai em rect para desconhecida/nula', () => {
    expect(resolveShapeName('banana')).toBe('rect');
    expect(resolveShapeName(undefined)).toBe('rect');
    expect(resolveShapeName(null)).toBe('rect');
    expect(resolveShapeName('')).toBe('rect');
  });
});

describe('shapeToSketchKind — escolha de primitiva por forma', () => {
  it('rect/rounded/stadium → kind rect (rough arredonda no traço)', () => {
    for (const s of ['rect', 'rounded', 'stadium']) {
      expect(shapeToSketchKind(s, 120, 60).kind).toBe('rect');
    }
  });

  it('polígonos → kind polygon com a contagem de pontos correta', () => {
    expect(shapeToSketchKind('diamond', 120, 60)).toMatchObject({ kind: 'polygon' });
    const diamond = shapeToSketchKind('diamond', 120, 60);
    if (diamond.kind === 'polygon') expect(diamond.points.length).toBe(4);
    const hex = shapeToSketchKind('hexagon', 120, 60);
    if (hex.kind === 'polygon') expect(hex.points.length).toBe(6);
    const asym = shapeToSketchKind('asymmetric', 120, 60);
    if (asym.kind === 'polygon') expect(asym.points.length).toBe(5);
    for (const s of ['parallelogram', 'parallelogram-alt', 'trapezoid', 'trapezoid-alt']) {
      const k = shapeToSketchKind(s, 120, 60);
      expect(k.kind).toBe('polygon');
      if (k.kind === 'polygon') expect(k.points.length).toBe(4);
    }
  });

  it('circle → kind circle com diâmetro = max(w,h)', () => {
    const k = shapeToSketchKind('circle', 80, 120);
    expect(k.kind).toBe('circle');
    if (k.kind === 'circle') expect(k.diameter).toBe(120);
  });

  it('cylinder → kind path com d não-vazio (arcos)', () => {
    const k = shapeToSketchKind('cylinder', 120, 60);
    expect(k.kind).toBe('path');
    if (k.kind === 'path') expect(k.d.length).toBeGreaterThan(10);
  });

  it('subroutine → kind subroutine normalizado (inset 8)', () => {
    const k = shapeToSketchKind('subroutine', 120, 60);
    expect(k.kind).toBe('subroutine');
    if (k.kind === 'subroutine') {
      expect(k.inset).toBe(8);
      expect(k.w).toBe(120);
      expect(k.h).toBe(60);
    }
  });

  it('forma desconhecida → kind rect (fallback)', () => {
    expect(shapeToSketchKind('banana', 100, 50).kind).toBe('rect');
  });

  it('diamond espelha a geometria de svg-shapes.js (pontos exatos)', () => {
    const k = shapeToSketchKind('diamond', 120, 60);
    if (k.kind === 'polygon') {
      // svg-shapes.js: [0,-h/2],[w/2,0],[0,h/2],[-w/2,0]
      expect(k.points).toEqual([
        [0, -30],
        [60, 0],
        [0, 30],
        [-60, 0],
      ]);
    }
  });
});
