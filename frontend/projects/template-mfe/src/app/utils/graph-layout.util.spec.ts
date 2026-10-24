import { buildDagNodes, computeCanvasLayout } from './graph-layout.util';
import { WorkflowTemplate } from '../models/template.model';

describe('graph-layout.util', () => {
  it('should return empty list when template is null or has no steps', () => {
    expect(buildDagNodes(null)).toEqual([]);
    expect(buildDagNodes({ steps: {} } as any)).toEqual([]);
  });

  it('should parse steps into ordered DAG nodes with incoming and outgoing transitions', () => {
    const template: WorkflowTemplate = {
      templateKey: 'ORDER_APPROVAL',
      name: 'Order Approval',
      description: 'Order flow',
      version: 1,
      status: 'PUBLISHED',
      initialState: 'SUBMISSION',
      steps: {
        SUBMISSION: {
          stepOrder: 1,
          stepName: 'Submit Order',
          stepType: 'DOCUMENT_SUBMISSION',
          actorScope: 'REQUESTER',
          requiredPayloadKeys: ['orderTotal'],
          isTerminal: false,
          transitions: {
            SUBMIT: 'REVIEW'
          }
        },
        REVIEW: {
          stepOrder: 2,
          stepName: 'Finance Review',
          stepType: 'APPROVAL',
          actorScope: 'ROLE',
          requiredRole: 'ROLE_FINANCE_MANAGER',
          requiredPayloadKeys: [],
          isTerminal: false,
          transitions: {
            APPROVE: 'COMPLETED',
            REJECT: 'REJECTED'
          }
        },
        COMPLETED: {
          stepOrder: 3,
          stepName: 'Order Completed',
          stepType: 'TERMINAL',
          actorScope: 'ANY',
          requiredPayloadKeys: [],
          isTerminal: true,
          transitions: {}
        },
        REJECTED: {
          stepOrder: 4,
          stepName: 'Order Rejected',
          stepType: 'TERMINAL',
          actorScope: 'ANY',
          requiredPayloadKeys: [],
          isTerminal: true,
          transitions: {}
        }
      }
    };

    const dagNodes = buildDagNodes(template);
    expect(dagNodes.length).toBe(4);
    expect(dagNodes[0].stateKey).toBe('SUBMISSION');
    expect(dagNodes[0].isInitial).toBe(true);
    expect(dagNodes[0].outgoingTransitions.length).toBe(1);
    expect(dagNodes[0].outgoingTransitions[0].targetState).toBe('REVIEW');

    const reviewNode = dagNodes.find(n => n.stateKey === 'REVIEW')!;
    expect(reviewNode.incomingTransitions.length).toBe(1);
    expect(reviewNode.incomingTransitions[0].sourceState).toBe('SUBMISSION');
    expect(reviewNode.outgoingTransitions.length).toBe(2);

    const layout = computeCanvasLayout(dagNodes);
    expect(layout.nodes.length).toBe(4);
    expect(layout.edges.length).toBe(3); // SUBMISSION->REVIEW, REVIEW->COMPLETED, REVIEW->REJECTED
    expect(layout.canvasWidth).toBeGreaterThan(0);
    expect(layout.canvasHeight).toBeGreaterThan(0);

    // Verify bezier curve connectors are calculated
    for (const edge of layout.edges) {
      expect(edge.pathD).toContain('M ');
      expect(edge.pathD).toContain('C ');
    }
  });

  it('should include conditional transitions and parallel multi-role badges in DAG layout', () => {
    const template: WorkflowTemplate = {
      templateKey: 'CAPEX_V2',
      name: 'CapEx Dynamic & Parallel',
      description: 'Test template',
      version: 1,
      status: 'DRAFT',
      initialState: 'SUBMISSION',
      steps: {
        SUBMISSION: {
          stepOrder: 1,
          stepName: 'Submit CapEx',
          stepType: 'DOCUMENT_SUBMISSION',
          actorScope: 'REQUESTER',
          requiredPayloadKeys: ['amount'],
          isTerminal: false,
          transitions: {
            SUBMIT: 'MANAGER_REVIEW'
          }
        },
        MANAGER_REVIEW: {
          stepOrder: 2,
          stepName: 'Manager Review',
          stepType: 'APPROVAL',
          actorScope: 'ROLE',
          requiredRole: 'ROLE_MANAGER',
          requiredPayloadKeys: [],
          isTerminal: false,
          transitions: {
            REJECT: 'REJECTED'
          },
          conditionalTransitions: [
            { action: 'APPROVE', condition: '#amount > 50000', targetState: 'VP_APPROVAL', priority: 1 },
            { action: 'APPROVE', condition: '#amount <= 50000', targetState: 'JOINT_REVIEW', priority: 2 }
          ]
        },
        VP_APPROVAL: {
          stepOrder: 3,
          stepName: 'VP Approval',
          stepType: 'APPROVAL',
          actorScope: 'ROLE',
          requiredRole: 'ROLE_VP',
          requiredPayloadKeys: [],
          isTerminal: false,
          transitions: {
            APPROVE: 'JOINT_REVIEW',
            REJECT: 'REJECTED'
          }
        },
        JOINT_REVIEW: {
          stepOrder: 4,
          stepName: 'Joint Review',
          stepType: 'PARALLEL_APPROVAL',
          actorScope: 'PARALLEL_ROLES',
          requiredRoles: ['ROLE_LEGAL_COUNSEL', 'ROLE_FINANCE_DIRECTOR'],
          requiredPayloadKeys: [],
          isTerminal: false,
          transitions: {
            APPROVE: 'APPROVED',
            REJECT: 'REJECTED'
          }
        },
        APPROVED: {
          stepOrder: 5,
          stepName: 'Approved',
          stepType: 'TERMINAL',
          actorScope: 'ANY',
          requiredPayloadKeys: [],
          isTerminal: true,
          transitions: {}
        },
        REJECTED: {
          stepOrder: 6,
          stepName: 'Rejected',
          stepType: 'TERMINAL',
          actorScope: 'ANY',
          requiredPayloadKeys: [],
          isTerminal: true,
          transitions: {}
        }
      }
    };

    const dagNodes = buildDagNodes(template);
    const mgrNode = dagNodes.find(n => n.stateKey === 'MANAGER_REVIEW')!;

    // Verify conditional transitions were parsed as outgoing edges with condition label
    expect(mgrNode.outgoingTransitions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: 'REJECT', targetState: 'REJECTED' }),
        expect.objectContaining({ action: 'APPROVE [#amount > 50000]', targetState: 'VP_APPROVAL' }),
        expect.objectContaining({ action: 'APPROVE [#amount <= 50000]', targetState: 'JOINT_REVIEW' })
      ])
    );

    const layout = computeCanvasLayout(dagNodes);
    const jointNode = layout.nodes.find(n => n.stateKey === 'JOINT_REVIEW')!;

    // Verify multi-role display concatenation
    expect(jointNode.roleDisplay).toBe('LEGAL_COUNSEL + FINANCE_DIRECTOR');
  });

  it('properly layers workflows with feedback cycles without inverting layout', () => {
    // Exact scenario from user's screen:
    // INITIATE -> SUBMIT -> STAGE_4
    // STAGE_4 -> APPROVE [#amount > 10000] -> INITIATE (loop-back)
    // INITIATE -> AUTO_APPROVE -> COMPLETED
    const cycleTpl: WorkflowTemplate = {
      templateKey: 'CUSTOM_WORKFLOW_V1',
      version: 1,
      name: 'Custom Workflow Template',
      description: '',
      status: 'DRAFT',
      initialState: 'INITIATE',
      steps: {
        INITIATE: {
          stepOrder: 1,
          stepName: 'Initiate Request',
          stepType: 'DOCUMENT_SUBMISSION',
          actorScope: 'REQUESTER',
          requiredPayloadKeys: ['amount'],
          isTerminal: false,
          transitions: {
            SUBMIT: 'STAGE_4'
          },
          conditionalTransitions: []
        },
        STAGE_4: {
          stepOrder: 2,
          stepName: 'Stage 4 Review',
          stepType: 'APPROVAL',
          actorScope: 'ROLE',
          requiredRole: 'ROLE_EMPLOYEE',
          requiredPayloadKeys: [],
          isTerminal: false,
          transitions: {},
          conditionalTransitions: [
            { action: 'APPROVE', condition: '#amount > 10000', targetState: 'COMPLETED' },
            { action: 'REVISE', condition: '#amount <= 10000', targetState: 'INITIATE' }
          ]
        },
        COMPLETED: { stepOrder: 3, stepName: 'Approved & Completed', stepType: 'TERMINAL', isTerminal: true },
        CANCELLED: { stepOrder: 4, stepName: 'Cancelled / Rejected', stepType: 'TERMINAL', isTerminal: true }
      }
    };

    const dag = buildDagNodes(cycleTpl);
    const layout = computeCanvasLayout(dag);

    const initNode = layout.nodes.find(n => n.stateKey === 'INITIATE')!;
    const s4Node = layout.nodes.find(n => n.stateKey === 'STAGE_4')!;
    const compNode = layout.nodes.find(n => n.stateKey === 'COMPLETED')!;

    // INITIATE MUST be at Column 0 (x=50)
    expect(initNode.x).toBe(50);
    // STAGE_4 MUST be downstream of INITIATE (x > initNode.x)
    expect(s4Node.x).toBeGreaterThan(initNode.x);
    // COMPLETED MUST be downstream of STAGE_4 (x > s4Node.x)
    expect(compNode.x).toBeGreaterThan(s4Node.x);
  });
});
