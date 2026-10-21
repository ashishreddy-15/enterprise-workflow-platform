export interface TaskActivityHistory {
  id: string;
  stepOrder: number;
  stepName: string;
  taskType: string;
  completedBy: string;
  status: string;
  comments: string | null;
  actedAt: string | null;
}

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
  contextData?: Record<string, unknown>;
  taskHistory?: TaskActivityHistory[];
}

export interface WorkflowAction {
  key: string;
  label: string;
  variant: 'primary' | 'danger' | 'secondary';
  targetState?: string;
}

export interface TemplateStepDefinition {
  stepOrder: number;
  stepName: string;
  stepType: string;
  actorScope: string;
  requiredRole?: string | null;
  requiredPayloadKeys?: string[] | null;
  isTerminal: boolean;
  slaHours?: number | null;
  transitions: Record<string, string>;
}

export interface WorkflowTemplate {
  id?: string;
  templateKey: string;
  name: string;
  description: string;
  initialState: string;
  status: string;
  steps: Record<string, TemplateStepDefinition>;
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
