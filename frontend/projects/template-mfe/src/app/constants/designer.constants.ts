export interface StepTypeOption {
  value: string;
  label: string;
}

export interface ActorScopeOption {
  value: string;
  label: string;
}

export const AVAILABLE_STEP_TYPES: StepTypeOption[] = [
  { value: 'DOCUMENT_SUBMISSION', label: 'Form / Document Submission' },
  { value: 'APPROVAL', label: 'Approval Step' },
  { value: 'MANUAL_TASK', label: 'Manual Task' },
  { value: 'AUTOMATED_TASK', label: 'Automated System Step' },
  { value: 'TERMINAL', label: 'End Step' }
];

export const AVAILABLE_ACTOR_SCOPES: ActorScopeOption[] = [
  { value: 'ROLE', label: 'Specific Role' },
  { value: 'REQUESTER', label: 'Original Requester' },
  { value: 'ANY', label: 'Anyone' },
  { value: 'SYSTEM', label: 'Automated System' }
];

export const AVAILABLE_ROLES: string[] = [
  'ROLE_EMPLOYEE',
  'ROLE_LEGAL_COUNSEL',
  'ROLE_FINANCE_MANAGER',
  'ROLE_IT_ADMIN',
  'ROLE_PROCUREMENT',
  'ROLE_HR_ADMIN',
  'ROLE_WORKFLOW_ARCHITECT',
  'ROLE_AUDITOR',
  'ROLE_ADMIN'
];
