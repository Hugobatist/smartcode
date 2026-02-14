// Types
export type {
  NodeStatus,
  Flag,
  DiagramNode,
  DiagramEdge,
  DiagramContent,
  ValidationResult,
  ValidationError,
  Project,
} from './diagram/types.js';

// Diagram service
export { DiagramService } from './diagram/service.js';

// Annotations
export {
  parseFlags,
  stripAnnotations,
  injectAnnotations,
} from './diagram/annotations.js';

// Validator
export { validateMermaidSyntax } from './diagram/validator.js';

// Parser
export { parseDiagramType, parseDiagramContent } from './diagram/parser.js';

// Project management
export { ProjectManager } from './project/manager.js';
export { discoverMmdFiles } from './project/discovery.js';
