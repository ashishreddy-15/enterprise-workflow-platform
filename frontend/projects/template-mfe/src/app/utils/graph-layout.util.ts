import * as dagre from '@dagrejs/dagre';
import { createNodes, createEdges, Node, Edge } from 'ngx-vflow';
import { WorkflowTemplate, DAGNode } from '../models/template.model';

export interface FlowCardData {
  stateKey: string;
  name: string;
  type: string;
  actorScope: string;
  requiredRole: string | null;
  requiredRoles: string[];
  slaHours: number | null;
  isInitial: boolean;
  isTerminal: boolean;
  isRejectTerminal: boolean;
  roleDisplay: string;
  order: number;
  requiredPayloadKeys: string[];
  outgoingTransitions: { action: string; targetState: string }[];
}

export interface FlowEdgeData {
  action: string;
  isDanger: boolean;
}

export function computeFlowLayout(rawNodes: DAGNode[]): {
  nodes: Node<FlowCardData>[];
  edges: Edge<FlowEdgeData>[];
} {
  if (!rawNodes || rawNodes.length === 0) {
    return { nodes: [], edges: [] };
  }

  const NODE_WIDTH = 240;
  const NODE_HEIGHT = 105;

  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: 'LR',
    align: 'UL',
    nodesep: 50,
    ranksep: 100,
    marginx: 40,
    marginy: 40
  });
  g.setDefaultEdgeLabel(() => ({}));

  for (const node of rawNodes) {
    g.setNode(node.stateKey, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }

  for (const node of rawNodes) {
    for (const trans of node.outgoingTransitions) {
      if (rawNodes.some(n => n.stateKey === trans.targetState)) {
        g.setEdge(node.stateKey, trans.targetState);
      }
    }
  }

  dagre.layout(g);

  const staticNodes = rawNodes.map(node => {
    const dagreNode = g.node(node.stateKey);
    const x = dagreNode ? Math.max(20, Math.round(dagreNode.x - NODE_WIDTH / 2)) : 50;
    const y = dagreNode ? Math.max(20, Math.round(dagreNode.y - NODE_HEIGHT / 2)) : 50;

    const isReject = ['REJECTED', 'CANCELLED'].includes(node.stateKey.toUpperCase());
    let roleDisplay = node.requiredRole ? node.requiredRole.replace(/^ROLE_/, '') : '';
    if (!roleDisplay && node.rawStep?.requiredRoles && node.rawStep.requiredRoles.length > 0) {
      roleDisplay = node.rawStep.requiredRoles.map(r => r.replace(/^ROLE_/, '')).join(' + ');
    }

    const cardData: FlowCardData = {
      stateKey: node.stateKey,
      name: node.name,
      type: node.type,
      actorScope: node.actorScope,
      requiredRole: node.requiredRole || null,
      requiredRoles: node.rawStep?.requiredRoles || [],
      slaHours: node.slaHours ?? null,
      isInitial: node.isInitial,
      isTerminal: node.isTerminal,
      isRejectTerminal: node.isTerminal && isReject,
      roleDisplay,
      order: node.order,
      requiredPayloadKeys: node.requiredPayloadKeys,
      outgoingTransitions: node.outgoingTransitions
    };

    return {
      id: node.stateKey,
      point: { x, y },
      type: 'html-template' as const,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      data: cardData
    };
  });

  const staticEdges: any[] = [];
  for (const source of rawNodes) {
    for (const trans of source.outgoingTransitions) {
      if (rawNodes.some(n => n.stateKey === trans.targetState)) {
        const actionUpper = trans.action.toUpperCase();
        const isDanger = actionUpper.includes('REJECT') || actionUpper.includes('CANCEL');

        staticEdges.push({
          id: `${source.stateKey}-${trans.action}-${trans.targetState}`,
          source: source.stateKey,
          target: trans.targetState,
          curve: 'bezier',
          markers: {
            end: {
              type: 'arrow-closed',
              color: isDanger ? '#e11d48' : '#71717a'
            }
          },
          edgeLabels: {
            center: {
              type: 'html-template',
              data: { action: trans.action, isDanger }
            }
          },
          data: { action: trans.action, isDanger }
        });
      }
    }
  }

  return {
    nodes: createNodes(staticNodes),
    edges: createEdges(staticEdges)
  };
}

export function buildDagNodes(tpl: WorkflowTemplate | null): DAGNode[] {
  if (!tpl || !tpl.steps) return [];

  const nodes: DAGNode[] = [];
  const entries = Object.entries(tpl.steps);

  for (const [stateKey, step] of entries) {
    const outgoing: { action: string; targetState: string }[] = [];
    if (step.transitions) {
      for (const [action, target] of Object.entries(step.transitions)) {
        outgoing.push({ action, targetState: target });
      }
    }
    if (step.conditionalTransitions) {
      for (const ct of step.conditionalTransitions) {
        if (!outgoing.some(o => o.action === ct.action && o.targetState === ct.targetState)) {
          outgoing.push({ action: `${ct.action} [${ct.condition}]`, targetState: ct.targetState });
        }
      }
    }

    nodes.push({
      stateKey,
      order: step.stepOrder || 99,
      name: step.stepName || stateKey,
      stepType: step.stepType || (step.isTerminal ? 'TERMINAL' : 'APPROVAL'),
      type: step.stepType || (step.isTerminal ? 'TERMINAL' : 'APPROVAL'),
      actorScope: step.actorScope || 'ANY',
      requiredRole: step.requiredRole,
      isInitial: stateKey === tpl.initialState,
      isTerminal: !!step.isTerminal,
      slaHours: step.slaHours,
      requiredPayloadKeys: step.requiredPayloadKeys || [],
      outgoingTransitions: outgoing,
      incomingTransitions: [],
      rawStep: step
    });
  }

  // Resolve incoming transitions
  for (const node of nodes) {
    for (const other of nodes) {
      for (const out of other.outgoingTransitions) {
        if (out.targetState === node.stateKey) {
          node.incomingTransitions.push({
            action: out.action,
            sourceState: other.stateKey
          });
        }
      }
    }
  }

  // Sort nodes by stepOrder ascending
  return nodes.sort((a, b) => a.order - b.order);
}
