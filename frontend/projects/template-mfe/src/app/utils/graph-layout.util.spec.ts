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
});
