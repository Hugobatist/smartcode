/** Status of a diagram node */
export type NodeStatus = 'ok' | 'problem' | 'in-progress' | 'discarded';

/** A flag annotation on a diagram node */
export interface Flag {
  nodeId: string;
  message: string;
  timestamp?: number;
}

/** A node in a Mermaid diagram */
export interface DiagramNode {
  id: string;
  label: string;
  shape: string;
  status?: NodeStatus;
}

/** An edge between two nodes */
export interface DiagramEdge {
  from: string;
  to: string;
  label?: string;
  type: 'arrow' | 'open' | 'dotted' | 'thick';
}

/** Parsed content of a .mmd file */
export interface DiagramContent {
  /** The raw file content including annotations */
  raw: string;
  /** Mermaid content with annotations stripped */
  mermaidContent: string;
  /** Parsed flag annotations */
  flags: Map<string, Flag>;
  /** Parsed status annotations */
  statuses: Map<string, NodeStatus>;
  /** Validation result for the Mermaid syntax */
  validation: ValidationResult;
  /** Relative file path within the project */
  filePath: string;
}

/** Result of Mermaid syntax validation */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  diagramType?: string;
}

/** A structured validation error */
export interface ValidationError {
  message: string;
  line?: number;
  column?: number;
}

/** Risk level for a node annotation */
export type RiskLevel = 'high' | 'medium' | 'low';

/** A risk annotation on a diagram node */
export interface RiskAnnotation {
  nodeId: string;
  level: RiskLevel;
  reason: string;
}

/** A ghost path suggested by AI for alternative diagram flow */
export interface GhostPath {
  fromNodeId: string;
  toNodeId: string;
  label?: string;
  timestamp: number;
}

/** A project containing .mmd files */
export interface Project {
  /** Absolute path to the project root directory */
  rootDir: string;
  /** Relative paths to .mmd files within the project */
  files: string[];
}
