import { TaskInboxItem } from '../models/workflow.model';

export interface SlaCountdownResult {
  label: string;
  isBreached: boolean;
  urgency: 'normal' | 'warning' | 'breached';
}

/**
 * Pure calculation function for live SLA countdown display and badge styling
 */
export function computeSlaCountdown(task: TaskInboxItem | null, nowMs: number = Date.now()): SlaCountdownResult {
  if (!task) {
    return { label: 'No Active Task', isBreached: false, urgency: 'normal' };
  }
  if (task.slaBreached) {
    return { label: 'SLA Breached', isBreached: true, urgency: 'breached' };
  }
  if (!task.currentStepDueAt) {
    return { label: 'No SLA Attached', isBreached: false, urgency: 'normal' };
  }

  const due = new Date(task.currentStepDueAt).getTime();
  const diffMs = due - nowMs;
  if (diffMs <= 0) {
    return { label: 'SLA Overdue', isBreached: true, urgency: 'breached' };
  }

  const totalHours = Math.floor(diffMs / (1000 * 60 * 60));
  const totalMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  const urgency: 'normal' | 'warning' | 'breached' = totalHours <= 2 ? 'warning' : 'normal';

  if (totalHours >= 24) {
    const days = Math.floor(totalHours / 24);
    const remHours = totalHours % 24;
    return { label: `${days}d ${remHours}h left`, isBreached: false, urgency };
  }
  if (totalHours > 0) {
    return { label: `${totalHours}h ${totalMins}m left`, isBreached: false, urgency };
  }
  return { label: `${totalMins}m left`, isBreached: false, urgency: 'warning' };
}
