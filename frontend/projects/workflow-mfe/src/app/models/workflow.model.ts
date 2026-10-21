export interface TaskInboxItem {
  workflowId: string;
  templateId: string;
  title: string;
  requesterId: string;
  currentState: string;
  currentStepName: string;
  actorScope: 'REQUESTER' | 'ROLE' | string;
  requiredRole: string | null;
  currentStepDueAt: string | null;
  slaBreached: boolean;
  updatedAt: string;
}

export interface WorkflowTransitionRequest {
  action: string;
  comments?: string;
  payload?: Record<string, unknown>;
}

export interface WorkflowTransitionResponse {
  id: string;
  templateId: string;
  currentState: string;
  currentStepDueAt: string | null;
  slaBreached: boolean;
  tasks: Array<{
    id: string;
    stepOrder: number;
    stepName: string;
    completedBy: string | null;
    status: string;
    comments: string | null;
    actedAt: string | null;
  }>;
}
