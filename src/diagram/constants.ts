/** Known Mermaid diagram type keywords */
export const KNOWN_DIAGRAM_TYPES = [
  'flowchart',
  'graph',
  'sequenceDiagram',
  'classDiagram',
  'stateDiagram',
  'erDiagram',
  'gantt',
  'pie',
  'gitgraph',
  'mindmap',
  'timeline',
] as const;

/** Regex to match the start of a Mermaid subgraph definition */
export const SUBGRAPH_START = /^\s*subgraph\s+([^\s\[]+)(?:\s*\["([^"]+)"\])?/;

/** Regex to match the end of a Mermaid subgraph definition */
export const SUBGRAPH_END = /^\s*end\s*$/;
