import { computeSlaCountdown } from './sla.util';
import { TaskInboxItem } from '../models/workflow.model';

describe('sla.util', () => {
  it('should return No Active Task when task is null', () => {
    const result = computeSlaCountdown(null);
    expect(result.label).toBe('No Active Task');
    expect(result.isBreached).toBe(false);
    expect(result.urgency).toBe('normal');
  });

  it('should return SLA Breached when task has slaBreached flag set', () => {
    const task: TaskInboxItem = {
      workflowId: 'w-1',
      templateId: 't-1',
      title: 'Test',
      requesterId: 'u-1',
      currentState: 'PENDING',
      currentStepName: 'Review',
      actorScope: 'ROLE',
      requiredRole: 'ROLE_ADMIN',
      currentStepDueAt: new Date(Date.now() + 100000).toISOString(),
      slaBreached: true,
      updatedAt: new Date().toISOString()
    };

    const result = computeSlaCountdown(task);
    expect(result.label).toBe('SLA Breached');
    expect(result.isBreached).toBe(true);
    expect(result.urgency).toBe('breached');
  });

  it('should return No SLA Attached when currentStepDueAt is null', () => {
    const task: TaskInboxItem = {
      workflowId: 'w-1',
      templateId: 't-1',
      title: 'Test',
      requesterId: 'u-1',
      currentState: 'PENDING',
      currentStepName: 'Review',
      actorScope: 'ROLE',
      requiredRole: 'ROLE_ADMIN',
      currentStepDueAt: null,
      slaBreached: false,
      updatedAt: new Date().toISOString()
    };

    const result = computeSlaCountdown(task);
    expect(result.label).toBe('No SLA Attached');
    expect(result.isBreached).toBe(false);
  });

  it('should calculate remaining hours and minutes correctly', () => {
    const nowMs = 1700000000000;
    // 5 hours ahead
    const dueMs = nowMs + 5 * 60 * 60 * 1000 + 15 * 60 * 1000;

    const task: TaskInboxItem = {
      workflowId: 'w-1',
      templateId: 't-1',
      title: 'Test',
      requesterId: 'u-1',
      currentState: 'PENDING',
      currentStepName: 'Review',
      actorScope: 'ROLE',
      requiredRole: 'ROLE_ADMIN',
      currentStepDueAt: new Date(dueMs).toISOString(),
      slaBreached: false,
      updatedAt: new Date().toISOString()
    };

    const result = computeSlaCountdown(task, nowMs);
    expect(result.label).toBe('5h 15m left');
    expect(result.isBreached).toBe(false);
    expect(result.urgency).toBe('normal');
  });
});
