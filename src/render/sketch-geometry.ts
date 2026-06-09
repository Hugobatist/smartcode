/**
 * SmartCode Sketch Geometry — lógica PURA (sem DOM, sem rough.js) da camada
 * de desenho à mão. Aqui mora a geometria das 13 formas e o seed determinístico.
 *
 * Por que separado de sketch-shapes.ts:
 *  - Mantém o limite de 500 linhas por arquivo (regra do projeto).
 *  - É testável em vitest sem precisar de DOM/jsdom (funções puras).
 *
 * Estas funções espelham EXATAMENTE a geometria de static/svg-shapes.js
 * (mesmos pontos, mesmos raios), só que devolvendo dados crus (pontos/dims)
 * em vez de elementos SVG. O desenho rough.js fica em sketch-shapes.ts.
 *
 * Convenção de coordenadas: idêntica ao svg-shapes.js legado — todas as
 * formas centradas em (0, 0), então x varia de -w/2 a w/2 e y de -h/2 a h/2.
 */

/** Um ponto 2D no formato que o rough.js espera ([x, y]). */
export type Point = [number, number];

/**
 * As 13 formas suportadas (mesmos nomes do registry de svg-shapes.js).
 * 'rect' é o fallback quando a forma é desconhecida.
 */
export const SKETCH_SHAPES: readonly string[] = [
  'rect',
  'rounded',
  'stadium',
  'diamond',
  'circle',
  'hexagon',
  'subroutine',
  'cylinder',
  'asymmetric',
  'parallelogram',
  'parallelogram-alt',
  'trapezoid',
  'trapezoid-alt',
];

/**
 * Como cada forma é desenhada pelo rough.js. Define qual primitiva usar e
 * com quais dados — sketch-shapes.ts faz o dispatch sobre este "kind".
 *  - rect      → rc.rectangle(x, y, w, h)         (rough arredonda no traço)
 *  - polygon   → rc.polygon(points)
 *  - circle    → rc.circle(0, 0, diameter)
 *  - path      → rc.path(d)                        (cylinder, arcos)
 *  - subroutine→ retângulo + 2 linhas verticais internas (caso composto)
 */
export type SketchKind =
  | { kind: 'rect'; w: number; h: number }
  | { kind: 'polygon'; points: Point[] }
  | { kind: 'circle'; diameter: number }
  | { kind: 'path'; d: string }
  | { kind: 'subroutine'; w: number; h: number; inset: number };

/**
 * Resolve o nome de forma para um nome conhecido do registry.
 * Desconhecido cai em 'rect' (mesmo fallback de svg-shapes.js:212).
 */
export function resolveShapeName(shape: string | null | undefined): string {
  if (shape && SKETCH_SHAPES.indexOf(shape) !== -1) return shape;
  return 'rect';
}

/**
 * Seed determinístico derivado de uma string (id do nó/aresta).
 *
 * Por que determinístico: o app re-renderiza o SVG inteiro a cada mudança
 * (custom-renderer.js). Sem seed fixo, o rough.js "treme diferente" a cada
 * render e os nós dançam. Derivando o seed do id, o mesmo nó desenha igual
 * sempre (estabilidade visual — proposta §3.2/§5.4).
 *
 * Hash estilo Java string hashCode, normalizado para [0, 100000). É o MESMO
 * algoritmo do mockup aprovado (mockup-novo-visual.html: seedFromId).
 */
export function seedFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 100000;
}

// ── Geometria por forma (espelha svg-shapes.js) ──

function diamondPoints(w: number, h: number): Point[] {
  return [
    [0, -h / 2],
    [w / 2, 0],
    [0, h / 2],
    [-w / 2, 0],
  ];
}

function hexagonPoints(w: number, h: number): Point[] {
  const dx = h / 4;
  return [
    [-w / 2 + dx, -h / 2],
    [w / 2 - dx, -h / 2],
    [w / 2, 0],
    [w / 2 - dx, h / 2],
    [-w / 2 + dx, h / 2],
    [-w / 2, 0],
  ];
}

function asymmetricPoints(w: number, h: number): Point[] {
  const notch = h / 4;
  return [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2 - notch, 0],
    [w / 2, h / 2],
    [-w / 2, h / 2],
  ];
}

function parallelogramPoints(w: number, h: number): Point[] {
  const skew = h * 0.3;
  return [
    [-w / 2 + skew, -h / 2],
    [w / 2, -h / 2],
    [w / 2 - skew, h / 2],
    [-w / 2, h / 2],
  ];
}

function parallelogramAltPoints(w: number, h: number): Point[] {
  const skew = h * 0.3;
  return [
    [-w / 2, -h / 2],
    [w / 2 - skew, -h / 2],
    [w / 2, h / 2],
    [-w / 2 + skew, h / 2],
  ];
}

function trapezoidPoints(w: number, h: number): Point[] {
  const dx = w * 0.15;
  return [
    [-w / 2 + dx, -h / 2],
    [w / 2 - dx, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2],
  ];
}

function trapezoidAltPoints(w: number, h: number): Point[] {
  const dx = w * 0.15;
  return [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2 - dx, h / 2],
    [-w / 2 + dx, h / 2],
  ];
}

/**
 * Path do cilindro — mesmos arcos do svg-shapes.js:120-135.
 * ry fixo de 8px para a "tampa" elíptica.
 */
function cylinderPath(w: number, h: number): string {
  const rx = w / 2;
  const ry = 8;
  const bodyTop = -h / 2 + ry;
  const bodyBottom = h / 2 - ry;
  return (
    'M ' + -rx + ' ' + bodyTop +
    ' A ' + rx + ' ' + ry + ' 0 0 1 ' + rx + ' ' + bodyTop +
    ' L ' + rx + ' ' + bodyBottom +
    ' A ' + rx + ' ' + ry + ' 0 0 1 ' + -rx + ' ' + bodyBottom +
    ' L ' + -rx + ' ' + bodyTop +
    ' A ' + rx + ' ' + ry + ' 0 0 0 ' + rx + ' ' + bodyTop
  );
}

/**
 * Traduz (forma, w, h) na primitiva rough.js a usar e seus dados geométricos.
 * Esta é a tradução 1:1 das funções de svg-shapes.js para "como o rough desenha".
 * Função pura → testável sem DOM.
 */
export function shapeToSketchKind(shape: string, w: number, h: number): SketchKind {
  const name = resolveShapeName(shape);
  switch (name) {
    case 'diamond':
      return { kind: 'polygon', points: diamondPoints(w, h) };
    case 'hexagon':
      return { kind: 'polygon', points: hexagonPoints(w, h) };
    case 'asymmetric':
      return { kind: 'polygon', points: asymmetricPoints(w, h) };
    case 'parallelogram':
      return { kind: 'polygon', points: parallelogramPoints(w, h) };
    case 'parallelogram-alt':
      return { kind: 'polygon', points: parallelogramAltPoints(w, h) };
    case 'trapezoid':
      return { kind: 'polygon', points: trapezoidPoints(w, h) };
    case 'trapezoid-alt':
      return { kind: 'polygon', points: trapezoidAltPoints(w, h) };
    case 'circle':
      return { kind: 'circle', diameter: Math.max(w, h) };
    case 'cylinder':
      return { kind: 'path', d: cylinderPath(w, h) };
    case 'subroutine':
      // Normalizado: retângulo + 2 linhas internas. inset = 8px (svg-shapes.js).
      return { kind: 'subroutine', w: w, h: h, inset: 8 };
    case 'rect':
    case 'rounded':
    case 'stadium':
    default:
      // Todas as variantes de retângulo: o rough arredonda organicamente no
      // próprio traço, então rect/rounded/stadium usam a mesma primitiva.
      return { kind: 'rect', w: w, h: h };
  }
}
