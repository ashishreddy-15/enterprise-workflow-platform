import { TaskInboxItem, WorkflowTemplate, WorkflowStepperNode } from '../models/workflow.model';

/**
 * Dynamically derives the linear or branched workflow progression sequence
 * from a workflow template snapshot and task history.
 */
export function buildStepperNodes(
  task: TaskInboxItem | null,
  tpl?: WorkflowTemplate | null
): WorkflowStepperNode[] {
  if (!task) return [];

  const stepsMap = tpl?.steps;

  const isInstanceTerminal =
    task.currentState === 'ONBOARDED' ||
    task.currentState === 'APPROVED' ||
    task.currentState === 'REJECTED' ||
    task.currentState === 'COMPLETED' ||
    task.currentState === 'CANCELLED' ||
    task.currentState === 'CLOSED' ||
    !!stepsMap?.[task.currentState]?.isTerminal;

  if (stepsMap && Object.keys(stepsMap).length > 0) {
    const stepList = Object.entries(stepsMap)
      .map(([key, def]) => ({
        stepKey: key,
        stepOrder: def.stepOrder || 1,
        stepName: def.stepName || key,
        actorScope: def.actorScope || 'ROLE',
        requiredRole: def.requiredRole || null,
        isTerminal: !!def.isTerminal,
        slaHours: def.slaHours
      }))
      .sort((a, b) => a.stepOrder - b.stepOrder);

    const currentStepOrder = stepsMap[task.currentState]?.stepOrder ?? 1;

    const nodes: WorkflowStepperNode[] = stepList.map(step => {
      let status: 'COMPLETED' | 'CURRENT' | 'UPCOMING' | 'SKIPPED' | 'TERMINAL_REJECTED' | 'TERMINAL_APPROVED' = 'UPCOMING';
      let completedBy: string | null = null;
      let actedAt: string | null = null;
      let actionStatus: string | null = null;

      // Check if this step was legitimately executed in task audit history
      const match = task.taskHistory?.find(h =>
        (h.stepName && step.stepName && h.stepName.trim().toLowerCase() === step.stepName.trim().toLowerCase()) ||
        (!step.isTerminal && h.stepOrder && h.stepOrder === step.stepOrder)
      );

      if (match) {
        status = 'COMPLETED';
        completedBy = match.completedBy;
        actedAt = match.actedAt;
        actionStatus = match.status;
      } else if (step.stepKey === task.currentState) {
        if (isInstanceTerminal) {
          status = (task.currentState === 'REJECTED' || task.currentState === 'CANCELLED')
            ? 'TERMINAL_REJECTED'
            : 'TERMINAL_APPROVED';
          actedAt = task.updatedAt;
        } else {
          status = 'CURRENT';
        }
      } else if (isInstanceTerminal) {
        status = 'SKIPPED';
      } else if (step.stepOrder < currentStepOrder) {
        status = 'SKIPPED';
      } else {
        status = 'UPCOMING';
      }

      return {
        stepKey: step.stepKey,
        stepOrder: step.stepOrder,
        stepName: step.stepName,
        actorScope: step.actorScope,
        requiredRole: step.requiredRole,
        isTerminal: step.isTerminal,
        status,
        completedBy,
        actedAt,
        actionStatus,
        slaHours: step.slaHours
      };
    });

    // Filter out bypassed/skipped steps and unused alternate terminal branches
    return nodes.filter(node => {
      if (node.status === 'SKIPPED') {
        return false;
      }
      if (!isInstanceTerminal && node.isTerminal && ['REJECTED', 'CANCELLED'].includes(node.stepKey.toUpperCase())) {
        return false;
      }
      return true;
    });
  }

  // Dynamic fallback derived purely from instance state and task history
  const historyNodes: WorkflowStepperNode[] = (task.taskHistory || []).map((h, i) => ({
    stepKey: h.stepName,
    stepOrder: h.stepOrder || (i + 1),
    stepName: h.stepName,
    actorScope: 'ROLE',
    requiredRole: null,
    isTerminal: false,
    status: 'COMPLETED' as const,
    completedBy: h.completedBy,
    actedAt: h.actedAt,
    actionStatus: h.status
  }));

  const isCurrentTerminal =
    task.currentState === 'ONBOARDED' ||
    task.currentState === 'APPROVED' ||
    task.currentState === 'REJECTED' ||
    task.currentState === 'CANCELLED';

  const currentNode: WorkflowStepperNode = {
    stepKey: task.currentState,
    stepOrder: historyNodes.length + 1,
    stepName: task.currentStepName || task.currentState,
    actorScope: task.actorScope || 'ROLE',
    requiredRole: task.requiredRole || null,
    isTerminal: isCurrentTerminal,
    status: (isCurrentTerminal
      ? (task.currentState === 'REJECTED' || task.currentState === 'CANCELLED' ? 'TERMINAL_REJECTED' : 'TERMINAL_APPROVED')
      : 'CURRENT') as any,
    actedAt: isCurrentTerminal ? task.updatedAt : null,
    slaHours: null
  };

  return [...historyNodes, currentNode];
}
