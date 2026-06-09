/**
 * SmartCode Sketch Shapes — camada de desenho à mão (hand-drawn) das 13 formas
 * de nó, usando rough.js (a mesma lib do Excalidraw). Fonte TS compilada via
 * tsup.browser.ts para static/vendor/sketch-shapes.js (IIFE → window.SmartCodeSketchShapes).
 *
 * Esta camada NÃO substitui svg-shapes.js no caminho padrão. Ela só é chamada
 * quando a chave de sketch está ligada (?sketch=1), pela fronteira de delegação
 * em svg-shapes.js (D-22/D-25). Com a chave desligada, este código nunca roda.
 *
 * Estrutura de cada forma (proposta §2.2 — robusta a versões do rough.js):
 *   <g class="smartcode-shape">
 *     <rect|polygon|… class="smartcode-shape-hit" fill stroke/>  ← geometria limpa
 *     <g class="smartcode-sketch"> …paths do rough (traço trêmido)… </g>
 *   </g>
 * A forma de hit é a "limpa" antiga: recebe fill/stroke de status/estilo e dá
 * área de clique/hit-test confiável. O traço rough fica por cima, decorativo.
 *
 * Determinismo: seed derivado do id do nó (sketch-geometry.seedFromId) — o nó
 * desenha igual a cada re-render, sem "dançar" (proposta §3.2).
 *
 * Calibração do traço (D-11, espelha o mockup aprovado): roughness 1.1,
 * bowing 1.0, strokeWidth 1.8, fill sólido pastel.
 */
import {
  resolveShapeName,
  seedFromId,
  shapeToSketchKind,
  type Point,
} from './sketch-geometry.js';

// ── Superfície DOM/rough.js mínima (tsconfig não inclui a lib DOM) ──
// Declaramos só o que usamos, para o typecheck passar sem `lib: ["DOM"]`.
// Em runtime, são o document/Element/window reais do navegador.

interface SvgNode {
  setAttribute(name: string, value: string): void;
  appendChild(child: SvgNode): SvgNode;
  querySelectorAll(selectors: string): ArrayLike<SvgNode>;
  getAttribute(name: string): string | null;
  tagName: string;
}

interface MinimalDocument {
  createElementNS(ns: string, qualifiedName: string): SvgNode;
}

/** API do RoughSVG que consumimos (subset de rough.svg(...)). */
interface RoughSvg {
  rectangle(x: number, y: number, w: number, h: number, options?: RoughOptions): SvgNode;
  polygon(points: Point[], options?: RoughOptions): SvgNode;
  circle(x: number, y: number, diameter: number, options?: RoughOptions): SvgNode;
  path(d: string, options?: RoughOptions): SvgNode;
  line(x1: number, y1: number, x2: number, y2: number, options?: RoughOptions): SvgNode;
}

interface RoughOptions {
  roughness?: number;
  bowing?: number;
  stroke?: string;
  strokeWidth?: number;
  fill?: string;
  fillStyle?: string;
  fillWeight?: number;
  hachureGap?: number;
  seed?: number;
}

interface RoughFactory {
  svg(svg: SvgNode, config?: unknown): RoughSvg;
}

interface SketchGlobal {
  document?: MinimalDocument;
  rough?: RoughFactory;
  getComputedStyle?: (el: unknown) => { getPropertyValue(name: string): string };
}

// Acesso ao escopo global do navegador sem depender da lib DOM no typecheck.
const G: SketchGlobal = globalThis as unknown as SketchGlobal;

const NS = 'http://www.w3.org/2000/svg';

/** Calibração do traço dos nós (D-11). fill é resolvido por chamada. */
const ROUGH_BASE: RoughOptions = {
  roughness: 1.1,
  bowing: 1.0,
  strokeWidth: 1.8,
  fillStyle: 'solid',
  fillWeight: 1.4,
  hachureGap: 5,
};

// ── Helpers de DOM ──

function el(tag: string): SvgNode {
  if (!G.document) throw new Error('SmartCodeSketchShapes: document indisponível');
  return G.document.createElementNS(NS, tag);
}

function setAttrs(node: SvgNode, map: Record<string, string | number>): SvgNode {
  for (const key in map) {
    if (Object.prototype.hasOwnProperty.call(map, key)) {
      node.setAttribute(key, String(map[key]));
    }
  }
  return node;
}

/** Itera uma NodeList (ArrayLike) guardando contra índices vazios. */
function forEachNode(list: ArrayLike<SvgNode>, fn: (node: SvgNode) => void): void {
  for (let i = 0; i < list.length; i++) {
    const node = list[i];
    if (node) fn(node);
  }
}

/** Lê um token CSS resolvido (fonte única em tokens.css). Fallback defensivo. */
function readToken(name: string, fallback: string): string {
  try {
    if (!G.getComputedStyle) return fallback;
    const v = G.getComputedStyle((globalThis as { document?: { documentElement?: unknown } })
      .document?.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  } catch {
    return fallback;
  }
}

/**
 * Instância única do RoughSVG. rough.svg(root) só usa o root para criar
 * elementos via ownerDocument; um <svg> descartável serve. Cacheado para
 * não recriar o gerador a cada nó.
 */
let _rc: RoughSvg | null = null;
function getRough(): RoughSvg {
  if (_rc) return _rc;
  if (!G.rough) throw new Error('SmartCodeSketchShapes: window.rough indisponível (vendor não carregou)');
  const root = el('svg');
  _rc = G.rough.svg(root);
  return _rc;
}

// ── Construção da forma de hit (geometria limpa, recebe fill/stroke) ──

function buildHitShape(shape: string, w: number, h: number): SvgNode {
  const name = resolveShapeName(shape);
  const kind = shapeToSketchKind(name, w, h);

  if (kind.kind === 'circle') {
    return setAttrs(el('circle'), { cx: 0, cy: 0, r: kind.diameter / 2 });
  }
  if (kind.kind === 'polygon') {
    const pts = kind.points.map((p) => p[0] + ',' + p[1]).join(' ');
    return setAttrs(el('polygon'), { points: pts });
  }
  if (kind.kind === 'path' || kind.kind === 'subroutine') {
    // cylinder usa o path de arcos; subroutine usa um rect simples como hit
    // (as linhas internas são só decorativas no traço rough).
    if (kind.kind === 'path') return setAttrs(el('path'), { d: kind.d });
    return setAttrs(el('rect'), { x: -w / 2, y: -h / 2, width: w, height: h, rx: rectRadius(name, h) });
  }
  // rect/rounded/stadium
  return setAttrs(el('rect'), {
    x: -w / 2, y: -h / 2, width: w, height: h, rx: rectRadius(name, h),
  });
}

/** Raio do retângulo de hit por variante (espelha svg-shapes.js). */
function rectRadius(name: string, h: number): number {
  if (name === 'rounded') return 8;
  if (name === 'stadium') return h / 2;
  return 0;
}

// ── Construção do traço rough (decorativo, por cima da forma de hit) ──

function buildSketch(shape: string, w: number, h: number, seed: number, ink: string): SvgNode {
  const rc = getRough();
  const kind = shapeToSketchKind(shape, w, h);
  // Traço só (sem fill): o fill pastel vem da forma de hit por baixo. Mantém
  // o traço trêmido como a borda visível, e status repinta a forma de hit.
  const strokeOpts: RoughOptions = {
    roughness: ROUGH_BASE.roughness,
    bowing: ROUGH_BASE.bowing,
    strokeWidth: ROUGH_BASE.strokeWidth,
    stroke: ink,
    seed: seed,
  };

  const sketch = el('g');
  sketch.setAttribute('class', 'smartcode-sketch');

  if (kind.kind === 'circle') {
    sketch.appendChild(rc.circle(0, 0, kind.diameter, strokeOpts));
  } else if (kind.kind === 'polygon') {
    sketch.appendChild(rc.polygon(kind.points, strokeOpts));
  } else if (kind.kind === 'path') {
    sketch.appendChild(rc.path(kind.d, strokeOpts));
  } else if (kind.kind === 'rect') {
    sketch.appendChild(rc.rectangle(-kind.w / 2, -kind.h / 2, kind.w, kind.h, strokeOpts));
  } else {
    // subroutine: retângulo + 2 linhas verticais internas (à mão)
    sketch.appendChild(rc.rectangle(-kind.w / 2, -kind.h / 2, kind.w, kind.h, strokeOpts));
    const xl = -kind.w / 2 + kind.inset;
    const xr = kind.w / 2 - kind.inset;
    sketch.appendChild(rc.line(xl, -kind.h / 2, xl, kind.h / 2, strokeOpts));
    sketch.appendChild(rc.line(xr, -kind.h / 2, xr, kind.h / 2, strokeOpts));
  }

  // Marca os <path> do rough para pintura seletiva e para não capturarem clique
  // (o hit-test fica na forma de hit). Classe .smartcode-sketch-stroke.
  forEachNode(sketch.querySelectorAll('path'), (p) => {
    p.setAttribute('class', 'smartcode-sketch-stroke');
    p.setAttribute('pointer-events', 'none');
  });
  return sketch;
}

/**
 * Fronteira pública — assinatura compatível com svg-shapes.render(), com um 4º
 * parâmetro opcional `seed` (derivado do id do nó em svg-renderer.js) para o
 * desenho determinístico. Devolve um <g class="smartcode-shape"> centrado em
 * (0,0), pronto para o translate(x,y) do svg-renderer.js.
 *
 * O `fill`/`stroke` reais são aplicados DEPOIS pelo svg-renderer.js na forma de
 * hit (mesmo fluxo de hoje), via paintShape(). Aqui usamos os tokens como cor
 * inicial do traço para o desenho nascer coerente antes da pintura.
 */
function render(shape: string, w: number, h: number, seed?: string | number): SvgNode {
  const group = el('g');
  group.setAttribute('class', 'smartcode-shape');

  const ink = readToken('--node-ink', '#4263c9');
  const fill = readToken('--node-fill', '#e8f0fe');

  // 1) Forma de hit (limpa) por baixo — recebe fill/stroke; alvo de status/clique.
  const hit = buildHitShape(shape, w, h);
  hit.setAttribute('class', 'smartcode-shape-hit');
  setAttrs(hit, { fill: fill, stroke: 'none' });
  group.appendChild(hit);

  // 2) Traço rough por cima — decorativo, determinístico pelo seed.
  const seedNum = typeof seed === 'number' ? seed : seedFromId(seed != null ? String(seed) : shape + w + 'x' + h);
  const sketch = buildSketch(shape, w, h, seedNum, ink);
  group.appendChild(sketch);

  return group;
}

/**
 * Pinta uma forma sketch (fill + stroke), mirando a forma de hit e recolorindo
 * o traço rough por cima — assim status/estilo/heatmap funcionam no modo sketch
 * (D-02). Recebe o <g class="smartcode-shape"> OU qualquer ancestral que o
 * contenha (ex.: o <g class="smartcode-node">).
 *
 * Centraliza a lógica para os pontos de pintura (custom-renderer, diagram-dom,
 * heatmap) ficarem pequenos e não dependerem da estrutura interna do rough.
 */
function paintShape(
  scope: SvgNode,
  fill: string | null,
  stroke: string | null,
  fillOpacity?: string | null,
): boolean {
  const hits = scope.querySelectorAll('.smartcode-shape-hit');
  if (!hits || hits.length === 0) return false;
  forEachNode(hits, (hit) => {
    if (fill != null) hit.setAttribute('fill', fill);
    if (fillOpacity != null) hit.setAttribute('fill-opacity', fillOpacity);
    // O stroke da forma de hit fica 'none' (o traço visível é o rough);
    // não pintamos stroke nela para não duplicar a borda.
  });
  // Recolore o traço rough (borda visível) quando há cor de stroke.
  if (stroke != null) {
    forEachNode(scope.querySelectorAll('.smartcode-sketch-stroke'), (s) => {
      s.setAttribute('stroke', stroke);
    });
  }
  return true;
}

/**
 * Expõe a instância RoughSVG cacheada para o svg-renderer desenhar arestas,
 * setas e subgraphs à mão com o MESMO gerador (coesão visual). Reusa getRough().
 */
function getRoughSvg(): RoughSvg {
  return getRough();
}

// ── API pública (compilada para window.SmartCodeSketchShapes pelo tsup) ──
// `seedFromId` é re-exportado para o svg-renderer derivar seeds de arestas.
export { render, paintShape, getRoughSvg as getRough, seedFromId };
