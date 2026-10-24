import { WorkflowTemplate, DAGNode, CanvasNode, CanvasEdge } from '../models/template.model';

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
      type: step.stepType || 'MANUAL_TASK',
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

export function computeCanvasLayout(rawNodes: DAGNode[]): {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  canvasWidth: number;
  canvasHeight: number;
} {
  if (!rawNodes || rawNodes.length === 0) {
    return { nodes: [], edges: [], canvasWidth: 800, canvasHeight: 480 };
  }

  const NODE_WIDTH = 220;
  const NODE_HEIGHT = 100;
  const HORIZONTAL_GAP = 90;
  const VERTICAL_GAP = 55;
  const PADDING_X = 50;
  const PADDING_Y = 50;

  const nodeMap = new Map<string, DAGNode>();
  for (const node of rawNodes) {
    nodeMap.set(node.stateKey, node);
  }

  // 1. Identify Entry / Initial Node
  const initialNode = rawNodes.find(n => n.isInitial) || rawNodes[0];

  // 2. Propagate Ranks (Columns) via topological layering without cycle corruption
  const ranks = new Map<string, number>();
  ranks.set(initialNode.stateKey, 0);

  const queue: string[] = [initialNode.stateKey];
  const inQueue = new Set<string>([initialNode.stateKey]);

  while (queue.length > 0) {
    const currentKey = queue.shift()!;
    inQueue.delete(currentKey);
    const currentRank = ranks.get(currentKey) ?? 0;
    const node = nodeMap.get(currentKey);
    if (!node) continue;

    for (const trans of node.outgoingTransitions) {
      // Anchoring: never re-rank the initial starting node via outgoing transitions
      if (trans.targetState === initialNode.stateKey) {
        continue;
      }

      const targetNode = nodeMap.get(trans.targetState);
      if (targetNode) {
        const existingRank = ranks.get(trans.targetState);
        const newRank = currentRank + 1;

        // Only propagate forward along unvisited or downstream paths
        if (existingRank === undefined) {
          ranks.set(trans.targetState, newRank);
          if (!inQueue.has(trans.targetState)) {
            queue.push(trans.targetState);
            inQueue.add(trans.targetState);
          }
        } else if (newRank > existingRank && existingRank > currentRank) {
          // Forward path that discovers a deeper layer
          ranks.set(trans.targetState, newRank);
          if (!inQueue.has(trans.targetState)) {
            queue.push(trans.targetState);
            inQueue.add(trans.targetState);
          }
        }
      }
    }
  }

  // Fallback for any disconnected intermediate nodes
  for (const node of rawNodes) {
    if (!node.isTerminal && !ranks.has(node.stateKey)) {
      ranks.set(node.stateKey, Math.max(0, node.order - 1));
    }
  }

  // Align all terminal states to the highest column
  let maxIntermediateRank = 0;
  for (const node of rawNodes) {
    if (!node.isTerminal) {
      maxIntermediateRank = Math.max(maxIntermediateRank, ranks.get(node.stateKey) ?? 0);
    }
  }
  const terminalRank = maxIntermediateRank + 1;
  for (const node of rawNodes) {
    if (node.isTerminal) {
      ranks.set(node.stateKey, terminalRank);
    }
  }

  // Dense column normalization: map distinct ranks to contiguous 0, 1, 2, ...
  const uniqueRanks = Array.from(new Set(ranks.values())).sort((a, b) => a - b);
  const rankToCol = new Map<number, number>();
  uniqueRanks.forEach((r, idx) => rankToCol.set(r, idx));

  // 3. Group Nodes by Column Rank and Sort Rows
  const rankGroups = new Map<number, DAGNode[]>();
  for (const node of rawNodes) {
    const rawR = ranks.get(node.stateKey) ?? 0;
    const colR = rankToCol.get(rawR) ?? 0;
    if (!rankGroups.has(colR)) {
      rankGroups.set(colR, []);
    }
    rankGroups.get(colR)!.push(node);
  }

  // Sort nodes within each column
  for (const [, group] of rankGroups.entries()) {
    group.sort((a, b) => {
      const aIsReject = ['REJECTED', 'CANCELLED'].includes(a.stateKey.toUpperCase());
      const bIsReject = ['REJECTED', 'CANCELLED'].includes(b.stateKey.toUpperCase());
      if (aIsReject && !bIsReject) return 1;
      if (!aIsReject && bIsReject) return -1;
      return a.order - b.order;
    });
  }

  // Compute dimensions
  let maxNodesInRank = 1;
  for (const group of rankGroups.values()) {
    maxNodesInRank = Math.max(maxNodesInRank, group.length);
  }

  const totalHeight = Math.max(480, maxNodesInRank * (NODE_HEIGHT + VERTICAL_GAP) + PADDING_Y * 2);
  const maxRank = Math.max(...Array.from(rankGroups.keys()), 0);
  const totalWidth = Math.max(800, (maxRank + 1) * (NODE_WIDTH + HORIZONTAL_GAP) + PADDING_X * 2);

  // 4. Assign Coordinates to Each Node
  const positionedNodes: CanvasNode[] = [];
  const posMap = new Map<string, CanvasNode>();

  for (const [r, group] of rankGroups.entries()) {
    const colX = PADDING_X + r * (NODE_WIDTH + HORIZONTAL_GAP);
    const groupHeight = group.length * NODE_HEIGHT + (group.length - 1) * VERTICAL_GAP;
    const startY = PADDING_Y + (totalHeight - 2 * PADDING_Y - groupHeight) / 2;

    group.forEach((node, rowIdx) => {
      const nodeY = Math.max(PADDING_Y, startY + rowIdx * (NODE_HEIGHT + VERTICAL_GAP));
      const isReject = ['REJECTED', 'CANCELLED'].includes(node.stateKey.toUpperCase());
      let roleDisplay = node.requiredRole ? node.requiredRole.replace(/^ROLE_/, '') : '';
      if (!roleDisplay && node.rawStep?.requiredRoles && node.rawStep.requiredRoles.length > 0) {
        roleDisplay = node.rawStep.requiredRoles.map(role => role.replace(/^ROLE_/, '')).join(' + ');
      }
      const cNode: CanvasNode = {
        ...node,
        x: colX,
        y: nodeY,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        rank: r,
        row: rowIdx,
        isRejectTerminal: node.isTerminal && isReject,
        roleDisplay
      };
      positionedNodes.push(cNode);
      posMap.set(node.stateKey, cNode);
    });
  }

  // 5. Build Smooth Directional Bezier Curve Connectors
  const edges: CanvasEdge[] = [];
  for (const source of positionedNodes) {
    for (const trans of source.outgoingTransitions) {
      const target = posMap.get(trans.targetState);
      if (!target) continue;

      const actionUpper = trans.action.toUpperCase();
      const isDanger = actionUpper.includes('REJECT') || actionUpper.includes('CANCEL');

      let pathD = '';
      let midX = 0;
      let midY = 0;
      let sourceX = 0;
      let sourceY = 0;
      let targetX = 0;
      let targetY = 0;

      if (target.x > source.x) {
        // Forward transition: exits right of source, enters left of target
        sourceX = source.x + source.width;
        const exitOffset = isDanger ? 22 : -15;
        sourceY = source.y + source.height / 2 + (source.outgoingTransitions.length > 1 ? exitOffset : 0);

        targetX = target.x;
        const entryOffset = isDanger ? 18 : -15;
        targetY = target.y + target.height / 2 + (target.incomingTransitions.length > 1 ? entryOffset : 0);

        const deltaX = Math.max(50, (targetX - sourceX) * 0.45);
        const cp1x = sourceX + deltaX;
        const cp1y = sourceY;
        const cp2x = targetX - deltaX;
        const cp2y = targetY;

        pathD = `M ${sourceX} ${sourceY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${targetX} ${targetY}`;

        const t = 0.5;
        midX = Math.round(
          Math.pow(1 - t, 3) * sourceX +
          3 * Math.pow(1 - t, 2) * t * cp1x +
          3 * (1 - t) * Math.pow(t, 2) * cp2x +
          Math.pow(t, 3) * targetX
        );
        midY = Math.round(
          Math.pow(1 - t, 3) * sourceY +
          3 * Math.pow(1 - t, 2) * t * cp1y +
          3 * (1 - t) * Math.pow(t, 2) * cp2y +
          Math.pow(t, 3) * targetY
        );
      } else {
        // Backward / feedback / loop transition: exits bottom of source, curves underneath, enters bottom of target
        sourceX = source.x + source.width * 0.4;
        sourceY = source.y + source.height;

        targetX = target.x + target.width * 0.6;
        targetY = target.y + target.height;

        const loopY = Math.max(sourceY, targetY) + 50;
        pathD = `M ${sourceX} ${sourceY} C ${sourceX} ${loopY}, ${targetX} ${loopY}, ${targetX} ${targetY}`;
        midX = Math.round((sourceX + targetX) / 2);
        midY = loopY - 10;
      }

      edges.push({
        id: `${source.stateKey}-${trans.action}-${target.stateKey}`,
        sourceKey: source.stateKey,
        targetKey: target.stateKey,
        action: trans.action,
        pathD,
        sourceX,
        sourceY,
        targetX,
        targetY,
        midX,
        midY,
        isDanger
      });
    }
  }

  return {
    nodes: positionedNodes,
    edges,
    canvasWidth: totalWidth,
    canvasHeight: totalHeight
  };
}
