export interface StepDefinition {
  stepOrder: number;
  stepName: string;
  stepType: string;
  actorScope: string;
  requiredRole?: string | null;
  requiredPayloadKeys: string[];
  isTerminal: boolean;
  slaHours?: number | null;
  transitions: Record<string, string>;
}

export interface WorkflowTemplate {
  id?: string;
  templateKey: string;
  version: number;
  name: string;
  description: string;
  status: string;
  initialState: string;
  createdAt?: string;
  updatedAt?: string;
  steps: Record<string, StepDefinition>;
}

export interface DAGNode {
  stateKey: string;
  order: number;
  name: string;
  type: string;
  actorScope: string;
  requiredRole?: string | null;
  isInitial: boolean;
  isTerminal: boolean;
  slaHours?: number | null;
  requiredPayloadKeys: string[];
  outgoingTransitions: { action: string; targetState: string }[];
  incomingTransitions: { action: string; sourceState: string }[];
  rawStep?: StepDefinition;
}
