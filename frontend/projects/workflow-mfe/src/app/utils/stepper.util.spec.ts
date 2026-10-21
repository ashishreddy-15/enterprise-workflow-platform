import { buildStepperNodes } from './stepper.util';
import { TaskInboxItem, WorkflowTemplate } from '../models/workflow.model';

describe('stepper.util', () => {
  it('should return empty list when task is null', () => {
    const nodes = buildStepperNodes(null, null);
    expect(nodes).toEqual([]);
  });

  it('should derive sequential steps from template snapshot', () => {
    const task: TaskInboxItem = {
      workflowId: 'wf-101',
      templateId: 'TEST_TPL',
      title: 'Procurement Workflow',
      requesterId: 'user-1',
      currentState: 'STEP_TWO',
      currentStepName: 'Approval Step',
      actorScope: 'ROLE',
      requiredRole: 'ROLE_ADMIN',
      currentStepDueAt: null,
      slaBreached: false,
      updatedAt: '2026-10-21T10:00:00Z',
      taskHistory: [
        {
          id: 'hist-1',
          stepOrder: 1,
          stepName: 'Submit Request',
          taskType: 'DOCUMENT_SUBMISSION',
          completedBy: 'user-1',
          status: 'COMPLETED',
          comments: 'Initial submission',
          actedAt: '2026-10-21T09:00:00Z'
        }
      ]
    };

    const template: WorkflowTemplate = {
      templateKey: 'TEST_TPL',
      name: 'Test Workflow',
      description: 'Test template description',
      status: 'PUBLISHED',
      initialState: 'STEP_ONE',
      steps: {
        STEP_ONE: {
          stepOrder: 1,
          stepName: 'Submit Request',
          stepType: 'DOCUMENT_SUBMISSION',
          actorScope: 'REQUESTER',
          isTerminal: false,
          transitions: { SUBMIT: 'STEP_TWO' }
        },
        STEP_TWO: {
          stepOrder: 2,
          stepName: 'Approval Step',
          stepType: 'APPROVAL',
          actorScope: 'ROLE',
          requiredRole: 'ROLE_ADMIN',
          isTerminal: false,
          transitions: { APPROVE: 'COMPLETED', REJECT: 'REJECTED' }
        },
        COMPLETED: {
          stepOrder: 3,
          stepName: 'Completed',
          stepType: 'TERMINAL',
          actorScope: 'ANY',
          isTerminal: true,
          transitions: {}
        },
        REJECTED: {
          stepOrder: 4,
          stepName: 'Rejected',
          stepType: 'TERMINAL',
          actorScope: 'ANY',
          isTerminal: true,
          transitions: {}
        }
      }
    };

    const nodes = buildStepperNodes(task, template);
    expect(nodes.length).toBe(3); // STEP_ONE, STEP_TWO, COMPLETED (REJECTED alternate branch hidden)

    // First node should be completed from taskHistory
    expect(nodes[0].stepKey).toBe('STEP_ONE');
    expect(nodes[0].status).toBe('COMPLETED');
    expect(nodes[0].completedBy).toBe('user-1');

    // Second node should be CURRENT
    expect(nodes[1].stepKey).toBe('STEP_TWO');
    expect(nodes[1].status).toBe('CURRENT');

    // Third node should be UPCOMING
    expect(nodes[2].stepKey).toBe('COMPLETED');
    expect(nodes[2].status).toBe('UPCOMING');
  });
});
