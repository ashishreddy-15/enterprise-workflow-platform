export interface WorkflowAnalyticsTransition {
  eventId: string;
  fromState: string;
  toState: string;
  actorId: string;
  occurredAt: string;
}

export interface WorkflowAnalyticsView {
  workflowId: string;
  templateId: string;
  currentState: string;
  lastActorId: string;
  transitionCount: number;
  lastUpdatedAt: string;
  history: WorkflowAnalyticsTransition[];
}

export interface AuditLogEntry {
  eventId: string;
  workflowId: string;
  templateId: string;
  previousState: string;
  newState: string;
  actorId: string;
  occurredAt: string;
  processedAt?: string;
}

export interface AnalyticsKpiSummary {
  totalWorkflows: number;
  totalEventsLogged: number;
  terminalCount: number;
  inFlightCount: number;
  avgTransitionVelocity: number;
}
