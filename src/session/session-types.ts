/** All possible session event types */
export type SessionEventType =
  | 'session:start'
  | 'session:end'
  | 'node:visited'
  | 'edge:traversed'
  | 'status:changed'
  | 'flag:added'
  | 'flag:removed'
  | 'risk:set'
  | 'node:added'
  | 'node:removed'
  | 'edge:added'
  | 'edge:removed';

/** A single event recorded during a session */
export interface SessionEvent {
  ts: number;
  type: SessionEventType;
  payload: Record<string, unknown>;
}

/** Metadata for an active session */
export interface SessionMeta {
  id: string;
  diagramFile: string;
  startedAt: number;
}

/** Summary statistics for a completed session */
export interface SessionSummary {
  sessionId: string;
  diagramFile: string;
  duration: number;
  totalEvents: number;
  nodesVisited: number;
  uniqueNodesVisited: number;
  edgesTraversed: number;
}
