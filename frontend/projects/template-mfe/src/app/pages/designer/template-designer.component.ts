import { Component, OnInit, OnDestroy, HostListener, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TemplateService } from '../../services/template.service';
import {
  WorkflowTemplate,
  DAGNode,
  StepDefinition,
  CanvasNode,
  CanvasEdge,
  TransitionBuilderItem,
  StateBuilderItem,
  BlueprintPreset
} from '../../models/template.model';

// =============================================================================
// PURE TOPOLOGY & AUTO-LAYOUT HELPER FUNCTIONS
// Shared across both Template Designer production viewer and Visual Studio
// =============================================================================

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

  // 2. Propagate Ranks (Columns) via topological BFS
  const ranks = new Map<string, number>();
  ranks.set(initialNode.stateKey, 0);

  const queue: string[] = [initialNode.stateKey];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const currentKey = queue.shift()!;
    visited.add(currentKey);
    const currentRank = ranks.get(currentKey) ?? 0;
    const node = nodeMap.get(currentKey);
    if (!node) continue;

    for (const trans of node.outgoingTransitions) {
      const targetNode = nodeMap.get(trans.targetState);
      if (targetNode) {
        const existingRank = ranks.get(trans.targetState) ?? 0;
        const newRank = currentRank + 1;
        if (newRank > existingRank) {
          ranks.set(trans.targetState, newRank);
        }
        if (!visited.has(trans.targetState) && !queue.includes(trans.targetState)) {
          queue.push(trans.targetState);
        }
      }
    }
  }

  // Fallback for any disconnected nodes
  for (const node of rawNodes) {
    if (!ranks.has(node.stateKey)) {
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

  // 3. Group Nodes by Column Rank and Sort Rows
  const rankGroups = new Map<number, DAGNode[]>();
  for (const node of rawNodes) {
    const r = ranks.get(node.stateKey) ?? 0;
    if (!rankGroups.has(r)) {
      rankGroups.set(r, []);
    }
    rankGroups.get(r)!.push(node);
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
      const roleDisplay = node.requiredRole ? node.requiredRole.replace(/^ROLE_/, '') : '';
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

      const sourceX = source.x + source.width;
      const exitOffset = isDanger ? 22 : -15;
      const sourceY = source.y + source.height / 2 + (source.outgoingTransitions.length > 1 ? exitOffset : 0);

      const targetX = target.x;
      const entryOffset = isDanger ? 18 : -15;
      const targetY = target.y + target.height / 2 + (target.incomingTransitions.length > 1 ? entryOffset : 0);

      let pathD = '';
      let midX = 0;
      let midY = 0;

      if (targetX > sourceX) {
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
        const loopY = Math.max(sourceY, targetY) + 70;
        pathD = `M ${sourceX} ${sourceY} C ${sourceX + 60} ${loopY}, ${targetX - 60} ${loopY}, ${targetX} ${targetY}`;
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

// =============================================================================
// PRE-BUILT ENTERPRISE BLUEPRINT PRESETS
// =============================================================================

export const BLUEPRINT_PRESETS: BlueprintPreset[] = [
  {
    id: 'it-procurement',
    name: 'Hardware & IT Procurement',
    badge: 'Standard 4-Stage',
    description: 'Hardware equipment request with IT admin approval and vendor dispatch',
    template: {
      templateKey: 'IT_HARDWARE_PROCUREMENT_V1',
      version: 1,
      name: 'IT Equipment & Hardware Procurement',
      description: 'Employee hardware request with IT approval and procurement fulfillment',
      status: 'DRAFT',
      initialState: 'REQUEST_SUBMISSION',
      steps: {
        REQUEST_SUBMISSION: {
          stepOrder: 1,
          stepName: 'Submit Equipment Request',
          stepType: 'DOCUMENT_SUBMISSION',
          actorScope: 'REQUESTER',
          requiredRole: null,
          requiredPayloadKeys: ['deviceModel', 'businessJustification'],
          isTerminal: false,
          slaHours: 24,
          transitions: {
            SUBMIT_REQUEST: 'PENDING_IT_APPROVAL'
          }
        },
        PENDING_IT_APPROVAL: {
          stepOrder: 2,
          stepName: 'IT Operations Approval',
          stepType: 'APPROVAL',
          actorScope: 'ROLE',
          requiredRole: 'ROLE_IT_ADMIN',
          requiredPayloadKeys: [],
          isTerminal: false,
          slaHours: 48,
          transitions: {
            APPROVE_REQUEST: 'PENDING_PROCUREMENT',
            REJECT_REQUEST: 'REJECTED'
          }
        },
        PENDING_PROCUREMENT: {
          stepOrder: 3,
          stepName: 'Procurement & Dispatch',
          stepType: 'MANUAL_TASK',
          actorScope: 'ROLE',
          requiredRole: 'ROLE_FINANCE_MANAGER',
          requiredPayloadKeys: ['trackingNumber'],
          isTerminal: false,
          slaHours: 72,
          transitions: {
            DISPATCH_ITEM: 'COMPLETED'
          }
        },
        COMPLETED: {
          stepOrder: 4,
          stepName: 'Device Delivered',
          stepType: 'TERMINAL',
          actorScope: 'ANY',
          requiredRole: null,
          requiredPayloadKeys: [],
          isTerminal: true,
          transitions: {}
        },
        REJECTED: {
          stepOrder: 5,
          stepName: 'Request Rejected',
          stepType: 'TERMINAL',
          actorScope: 'ANY',
          requiredRole: null,
          requiredPayloadKeys: [],
          isTerminal: true,
          transitions: {}
        }
      }
    }
  },
  {
    id: 'capex-approval',
    name: 'CAPEX Capital Expenditure',
    badge: 'Multi-Level Approval',
    description: 'High-value expenditure approval by Department Head and Finance Controller',
    template: {
      templateKey: 'CAPEX_EXPENDITURE_V1',
      version: 1,
      name: 'Capital Expenditure Authorization',
      description: 'Dual-gate financial approval for expenses over $10,000',
      status: 'DRAFT',
      initialState: 'SUBMIT_CAPEX',
      steps: {
        SUBMIT_CAPEX: {
          stepOrder: 1,
          stepName: 'Initiate CAPEX Dossier',
          stepType: 'DOCUMENT_SUBMISSION',
          actorScope: 'REQUESTER',
          requiredRole: null,
          requiredPayloadKeys: ['amount', 'vendorName', 'costCenter'],
          isTerminal: false,
          slaHours: 24,
          transitions: {
            SUBMIT_FOR_REVIEW: 'DEPT_HEAD_APPROVAL'
          }
        },
        DEPT_HEAD_APPROVAL: {
          stepOrder: 2,
          stepName: 'Department Head Review',
          stepType: 'APPROVAL',
          actorScope: 'ROLE',
          requiredRole: 'ROLE_EMPLOYEE',
          requiredPayloadKeys: [],
          isTerminal: false,
          slaHours: 48,
          transitions: {
            APPROVE: 'FINANCE_CONTROLLER_REVIEW',
            REJECT: 'REJECTED'
          }
        },
        FINANCE_CONTROLLER_REVIEW: {
          stepOrder: 3,
          stepName: 'Finance Controller Audit',
          stepType: 'APPROVAL',
          actorScope: 'ROLE',
          requiredRole: 'ROLE_FINANCE_MANAGER',
          requiredPayloadKeys: ['allocatedBudgetCode'],
          isTerminal: false,
          slaHours: 48,
          transitions: {
            AUTHORIZE_DISBURSEMENT: 'FUNDS_DISBURSED',
            REJECT: 'REJECTED'
          }
        },
        FUNDS_DISBURSED: {
          stepOrder: 4,
          stepName: 'Funds Disbursed',
          stepType: 'TERMINAL',
          actorScope: 'ANY',
          requiredRole: null,
          requiredPayloadKeys: [],
          isTerminal: true,
          transitions: {}
        },
        REJECTED: {
          stepOrder: 5,
          stepName: 'CAPEX Denied',
          stepType: 'TERMINAL',
          actorScope: 'ANY',
          requiredRole: null,
          requiredPayloadKeys: [],
          isTerminal: true,
          transitions: {}
        }
      }
    }
  },
  {
    id: 'vendor-onboarding',
    name: 'Vendor Compliance & SLA',
    badge: 'Legal & Compliance',
    description: 'Vendor document collection, legal audit, and production onboarding',
    template: {
      templateKey: 'ENTERPRISE_VENDOR_ONBOARDING_V1',
      version: 1,
      name: 'Vendor Compliance Onboarding',
      description: 'Vendor compliance verification with legal audit',
      status: 'DRAFT',
      initialState: 'SUBMIT_KYC_DOCS',
      steps: {
        SUBMIT_KYC_DOCS: {
          stepOrder: 1,
          stepName: 'Submit KYC Documents',
          stepType: 'DOCUMENT_SUBMISSION',
          actorScope: 'REQUESTER',
          requiredRole: null,
          requiredPayloadKeys: ['taxId', 'corporateRegistration'],
          isTerminal: false,
          slaHours: 24,
          transitions: {
            SUBMIT: 'LEGAL_COMPLIANCE_REVIEW'
          }
        },
        LEGAL_COMPLIANCE_REVIEW: {
          stepOrder: 2,
          stepName: 'Legal Counsel Review',
          stepType: 'APPROVAL',
          actorScope: 'ROLE',
          requiredRole: 'ROLE_LEGAL_COUNSEL',
          requiredPayloadKeys: [],
          isTerminal: false,
          slaHours: 48,
          transitions: {
            VERIFY_AND_ONBOARD: 'VENDOR_ACTIVE',
            REJECT: 'REJECTED'
          }
        },
        VENDOR_ACTIVE: {
          stepOrder: 3,
          stepName: 'Vendor Active',
          stepType: 'TERMINAL',
          actorScope: 'ANY',
          requiredRole: null,
          requiredPayloadKeys: [],
          isTerminal: true,
          transitions: {}
        },
        REJECTED: {
          stepOrder: 4,
          stepName: 'Onboarding Rejected',
          stepType: 'TERMINAL',
          actorScope: 'ANY',
          requiredRole: null,
          requiredPayloadKeys: [],
          isTerminal: true,
          transitions: {}
        }
      }
    }
  },
  {
    id: 'blank',
    name: 'Blank Blueprint',
    badge: 'Minimal Starter',
    description: 'Start from scratch with one initial step, one approved state, and one rejected state',
    template: {
      templateKey: 'CUSTOM_WORKFLOW_V1',
      version: 1,
      name: 'Custom Workflow Blueprint',
      description: 'Custom state machine workflow specification',
      status: 'DRAFT',
      initialState: 'INITIATE',
      steps: {
        INITIATE: {
          stepOrder: 1,
          stepName: 'Initiate Request',
          stepType: 'DOCUMENT_SUBMISSION',
          actorScope: 'REQUESTER',
          requiredRole: null,
          requiredPayloadKeys: [],
          isTerminal: false,
          slaHours: 24,
          transitions: {
            SUBMIT: 'COMPLETED',
            CANCEL: 'CANCELLED'
          }
        },
        COMPLETED: {
          stepOrder: 2,
          stepName: 'Approved & Completed',
          stepType: 'TERMINAL',
          actorScope: 'ANY',
          requiredRole: null,
          requiredPayloadKeys: [],
          isTerminal: true,
          transitions: {}
        },
        CANCELLED: {
          stepOrder: 3,
          stepName: 'Cancelled / Rejected',
          stepType: 'TERMINAL',
          actorScope: 'ANY',
          requiredRole: null,
          requiredPayloadKeys: [],
          isTerminal: true,
          transitions: {}
        }
      }
    }
  }
];

// =============================================================================
// COMPONENT DEFINITION
// =============================================================================

@Component({
  selector: 'app-template-designer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './template-designer.component.html',
  styleUrls: ['./template-designer.component.css']
})
export class TemplateDesignerComponent implements OnInit, OnDestroy {
  private templateService = inject(TemplateService);

  readonly templates = signal<WorkflowTemplate[]>([]);
  readonly selectedTemplate = signal<WorkflowTemplate | null>(null);
  readonly selectedNode = signal<DAGNode | null>(null);
  readonly isLoading = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly searchQuery = signal<string>('');
  readonly statusFilter = signal<'ALL' | 'PUBLISHED' | 'DRAFT'>('ALL');
  readonly viewMode = signal<'canvas' | 'pipeline' | 'dsl'>('canvas');

  // Interactive 2D Graph Canvas State (Production Viewer)
  readonly zoomLevel = signal<number>(1);
  readonly panOffset = signal<{ x: number; y: number }>({ x: 30, y: 30 });
  readonly isPanning = signal<boolean>(false);
  readonly isFullscreenCanvas = signal<boolean>(false);
  private panStart = { x: 0, y: 0 };
  readonly hoveredNodeKey = signal<string | null>(null);
  readonly hoveredEdgeId = signal<string | null>(null);

  // Publishing State
  readonly isPublishing = signal<boolean>(false);

  // Modal & Visual Studio State
  readonly isCreateModalOpen = signal<boolean>(false);
  readonly newTemplateJson = signal<string>('');
  readonly createError = signal<string | null>(null);
  readonly isSubmitting = signal<boolean>(false);

  // Visual Studio Specific State
  readonly builderPresets = BLUEPRINT_PRESETS;
  readonly selectedPresetId = signal<string>('it-procurement');
  readonly builderMode = signal<'visual' | 'dsl'>('visual');
  readonly builderPreviewTab = signal<'canvas' | 'dsl'>('canvas');
  readonly isStudioFullscreen = signal<boolean>(true);
  readonly builderKey = signal<string>('IT_HARDWARE_PROCUREMENT_V1');
  readonly builderName = signal<string>('IT Equipment & Hardware Procurement');
  readonly builderDescription = signal<string>('Employee hardware request with IT approval and procurement fulfillment');
  readonly builderInitialState = signal<string>('REQUEST_SUBMISSION');
  readonly builderStates = signal<StateBuilderItem[]>([]);
  readonly builderZoomLevel = signal<number>(1.0);
  readonly builderPanOffset = signal<{ x: number; y: number }>({ x: 30, y: 30 });
  readonly isBuilderPanning = signal<boolean>(false);
  private builderPanStart = { x: 0, y: 0 };

  readonly availableStepTypes = [
    { value: 'DOCUMENT_SUBMISSION', label: 'Document Submission' },
    { value: 'APPROVAL', label: 'Approval Gate' },
    { value: 'MANUAL_TASK', label: 'Manual Task' },
    { value: 'AUTOMATED_TASK', label: 'Automated System Task' },
    { value: 'TERMINAL', label: 'Terminal State' }
  ];

  readonly availableActorScopes = [
    { value: 'ROLE', label: 'Specific Role (Authority)' },
    { value: 'REQUESTER', label: 'Original Requester' },
    { value: 'ANY', label: 'Any Authenticated User' },
    { value: 'SYSTEM', label: 'System Service' }
  ];

  readonly availableRoles = [
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

  private personaListener?: (event: Event) => void;

  readonly publishedCount = computed(() =>
    this.templates().filter(t => t.status === 'PUBLISHED').length
  );

  readonly draftCount = computed(() =>
    this.templates().filter(t => t.status === 'DRAFT').length
  );

  readonly filteredTemplates = computed<WorkflowTemplate[]>(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const sf = this.statusFilter();

    return this.templates().filter(t => {
      if (sf !== 'ALL' && t.status !== sf) {
        return false;
      }
      if (!q) return true;
      return (
        t.templateKey.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q) ||
        (t.description && t.description.toLowerCase().includes(q))
      );
    });
  });

  // Convert selected template's steps map into sorted DAG Nodes
  readonly dagNodes = computed<DAGNode[]>(() => buildDagNodes(this.selectedTemplate()));

  // Dynamically compute 2D Hierarchical Auto-Layout for the visual node graph canvas
  readonly canvasLayout = computed(() => computeCanvasLayout(this.dagNodes()));

  readonly selectedTemplateDsl = computed<string>(() => {
    const tpl = this.selectedTemplate();
    if (!tpl) return '';
    return JSON.stringify(tpl, null, 2);
  });

  // ===========================================================================
  // VISUAL STUDIO COMPUTED PROPERTIES
  // ===========================================================================

  readonly builderTemplate = computed<WorkflowTemplate>(() => {
    const states = this.builderStates();
    const stepsMap: Record<string, StepDefinition> = {};

    states.forEach((s, idx) => {
      const transMap: Record<string, string> = {};
      if (!s.isTerminal) {
        s.transitions.forEach(t => {
          if (t.action && t.targetState) {
            transMap[t.action] = t.targetState;
          }
        });
      }

      const payloadKeys = s.payloadKeysInput
        ? s.payloadKeysInput.split(',').map(k => k.trim()).filter(Boolean)
        : s.requiredPayloadKeys || [];

      stepsMap[s.stateKey] = {
        stepOrder: idx + 1,
        stepName: s.stepName,
        stepType: s.stepType,
        actorScope: s.actorScope,
        requiredRole: s.actorScope === 'ROLE' ? (s.requiredRole || null) : null,
        requiredPayloadKeys: payloadKeys,
        isTerminal: s.isTerminal,
        slaHours: s.slaHours ? +s.slaHours : null,
        transitions: transMap
      };
    });

    return {
      templateKey: this.builderKey(),
      version: 1,
      name: this.builderName(),
      description: this.builderDescription(),
      status: 'DRAFT',
      initialState: this.builderInitialState(),
      steps: stepsMap
    };
  });

  readonly builderDagNodes = computed<DAGNode[]>(() => buildDagNodes(this.builderTemplate()));
  readonly builderCanvasLayout = computed(() => computeCanvasLayout(this.builderDagNodes()));
  readonly builderDslPreview = computed(() => JSON.stringify(this.builderTemplate(), null, 2));

  readonly builderValidationErrors = computed<string[]>(() => {
    const errors: string[] = [];
    const key = this.builderKey().trim();
    const name = this.builderName().trim();
    const states = this.builderStates();
    const initial = this.builderInitialState();

    if (!key) {
      errors.push('Template Key is required (e.g. INVOICE_V1).');
    } else if (!/^[A-Z0-9_]+$/.test(key)) {
      errors.push('Template Key must contain only uppercase letters, numbers, and underscores.');
    }

    if (!name) {
      errors.push('Blueprint Display Name is required.');
    }

    if (states.length < 2) {
      errors.push('Workflow must contain at least 2 states (e.g. 1 initial step and 1 terminal state).');
    }

    const keySet = new Set<string>();
    for (const s of states) {
      if (!s.stateKey || !s.stateKey.trim()) {
        errors.push('Every state must have a non-empty State Key.');
      } else if (keySet.has(s.stateKey)) {
        errors.push(`Duplicate state key "${s.stateKey}". Keys must be unique.`);
      } else {
        keySet.add(s.stateKey);
      }
    }

    if (initial && !keySet.has(initial)) {
      errors.push(`Initial state "${initial}" does not match any defined state key.`);
    }

    const hasTerminal = states.some(s => s.isTerminal);
    if (!hasTerminal) {
      errors.push('Workflow must have at least one terminal state (e.g. COMPLETED or REJECTED).');
    }

    for (const s of states) {
      if (s.actorScope === 'ROLE' && (!s.requiredRole || !s.requiredRole.trim())) {
        errors.push(`State "${s.stateKey}" has actor scope ROLE but no Required Authority role is specified.`);
      }
      if (!s.isTerminal) {
        if (s.transitions.length === 0) {
          errors.push(`State "${s.stateKey}" is not terminal but has no outgoing transitions.`);
        }
        for (const t of s.transitions) {
          if (!t.action || !t.action.trim()) {
            errors.push(`State "${s.stateKey}" has a transition with an empty action name.`);
          }
          if (!t.targetState || !keySet.has(t.targetState)) {
            errors.push(`Transition [${t.action || '?'}] in "${s.stateKey}" targets non-existent state "${t.targetState}".`);
          }
        }
      }
    }

    return errors;
  });

  // ===========================================================================
  // LIFECYCLE
  // ===========================================================================

  ngOnInit(): void {
    this.loadTemplates();

    this.personaListener = () => {
      this.loadTemplates();
    };
    window.addEventListener('ewp:persona-changed', this.personaListener);
  }

  ngOnDestroy(): void {
    this.setScrollLock(false);
    if (this.personaListener) {
      window.removeEventListener('ewp:persona-changed', this.personaListener);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.selectedNode()) {
      this.selectedNode.set(null);
    } else if (this.isFullscreenCanvas()) {
      this.toggleFullscreen(false);
    } else if (this.isCreateModalOpen()) {
      this.closeCreateModal();
    }
  }

  private setScrollLock(lock: boolean): void {
    if (typeof document !== 'undefined') {
      if (lock) {
        document.body.classList.add('overflow-hidden');
      } else {
        document.body.classList.remove('overflow-hidden');
      }
    }
  }

  loadTemplates(preselectKey?: string): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    this.templateService.getTemplates(this.statusFilter()).subscribe({
      next: (tpls: WorkflowTemplate[]) => {
        this.templates.set(tpls);
        this.isLoading.set(false);

        if (tpls.length > 0) {
          if (preselectKey) {
            const found = tpls.find((t: WorkflowTemplate) => t.templateKey === preselectKey);
            this.selectedTemplate.set(found || tpls[0]);
          } else if (!this.selectedTemplate()) {
            this.selectedTemplate.set(tpls[0]);
          } else {
            const refreshed = tpls.find((t: WorkflowTemplate) => t.templateKey === this.selectedTemplate()?.templateKey);
            this.selectedTemplate.set(refreshed || tpls[0]);
          }
        } else {
          this.selectedTemplate.set(null);
        }
        this.resetZoom();
      },
      error: (err: any) => {
        console.error('Failed to load templates:', err);
        this.errorMessage.set('Failed to connect to Template Catalog Service. Ensure backend is running.');
        this.isLoading.set(false);
      }
    });
  }

  selectTemplate(tpl: WorkflowTemplate): void {
    this.selectedTemplate.set(tpl);
    this.selectedNode.set(null);
    this.resetZoom();
  }

  selectNode(node: DAGNode): void {
    this.selectedNode.set(node);
  }

  stepDsl(node: DAGNode): string {
    if (!node.rawStep) return '{}';
    return JSON.stringify(node.rawStep, null, 2);
  }

  copyStepDsl(node: DAGNode): void {
    navigator.clipboard.writeText(this.stepDsl(node));
    this.successMessage.set(`Copied step schema for [${node.stateKey}] to clipboard!`);
    setTimeout(() => this.successMessage.set(null), 3000);
  }

  setStatusFilter(filter: 'ALL' | 'PUBLISHED' | 'DRAFT'): void {
    this.statusFilter.set(filter);
  }

  setViewMode(mode: 'canvas' | 'pipeline' | 'dsl'): void {
    this.viewMode.set(mode);
  }

  toggleFullscreen(enable?: boolean): void {
    const next = enable !== undefined ? enable : !this.isFullscreenCanvas();
    this.isFullscreenCanvas.set(next);
    this.setScrollLock(next);
    if (next) {
      this.resetZoom();
    }
  }

  // Interactive 2D Canvas Viewport Controls (Production Canvas)
  zoomIn(): void {
    this.zoomLevel.update(z => Math.min(1.8, +(z + 0.15).toFixed(2)));
  }

  zoomOut(): void {
    this.zoomLevel.update(z => Math.max(0.4, +(z - 0.15).toFixed(2)));
  }

  resetZoom(): void {
    this.zoomLevel.set(1);
    this.panOffset.set({ x: 30, y: 30 });
  }

  startPan(event: MouseEvent): void {
    if ((event.target as HTMLElement).closest('.canvas-node-card') ||
        (event.target as HTMLElement).closest('.canvas-action-pill') ||
        (event.target as HTMLElement).closest('.canvas-controls')) {
      return;
    }
    this.isPanning.set(true);
    this.panStart = {
      x: event.clientX - this.panOffset().x,
      y: event.clientY - this.panOffset().y
    };
  }

  pan(event: MouseEvent): void {
    if (!this.isPanning()) return;
    this.panOffset.set({
      x: event.clientX - this.panStart.x,
      y: event.clientY - this.panStart.y
    });
  }

  endPan(): void {
    this.isPanning.set(false);
  }

  // Builder Canvas Panning
  startBuilderPan(event: MouseEvent): void {
    if ((event.target as HTMLElement).closest('.canvas-node-card') ||
        (event.target as HTMLElement).closest('.canvas-action-pill') ||
        (event.target as HTMLElement).closest('.canvas-controls')) {
      return;
    }
    this.isBuilderPanning.set(true);
    this.builderPanStart = {
      x: event.clientX - this.builderPanOffset().x,
      y: event.clientY - this.builderPanOffset().y
    };
  }

  panBuilder(event: MouseEvent): void {
    if (!this.isBuilderPanning()) return;
    this.builderPanOffset.set({
      x: event.clientX - this.builderPanStart.x,
      y: event.clientY - this.builderPanStart.y
    });
  }

  endBuilderPan(): void {
    this.isBuilderPanning.set(false);
  }

  zoomInBuilder(): void {
    this.builderZoomLevel.update(z => Math.min(1.6, +(z + 0.15).toFixed(2)));
  }

  zoomOutBuilder(): void {
    this.builderZoomLevel.update(z => Math.max(0.3, +(z - 0.15).toFixed(2)));
  }

  resetBuilderZoom(): void {
    this.builderZoomLevel.set(1.0);
    this.builderPanOffset.set({ x: 30, y: 30 });
  }

  toggleStudioFullscreen(): void {
    this.isStudioFullscreen.update(f => !f);
    setTimeout(() => this.resetBuilderZoom(), 50);
  }

  @HostListener('window:mouseup')
  onWindowMouseUp(): void {
    if (this.isPanning()) {
      this.isPanning.set(false);
    }
    if (this.isBuilderPanning()) {
      this.isBuilderPanning.set(false);
    }
  }

  publishSelectedTemplate(): void {
    const tpl = this.selectedTemplate();
    if (!tpl || tpl.status === 'PUBLISHED') return;

    this.isPublishing.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    this.templateService.publishTemplate(tpl.templateKey, tpl.version).subscribe({
      next: (published: WorkflowTemplate) => {
        this.isPublishing.set(false);
        this.successMessage.set(`Successfully published "${published.name}" (v${published.version})! It is now active.`);
        this.loadTemplates(published.templateKey);
      },
      error: (err: any) => {
        console.error('Failed to publish template:', err);
        this.errorMessage.set('Failed to publish template: ' + (err?.error?.message || err?.message));
        this.isPublishing.set(false);
      }
    });
  }

  // ===========================================================================
  // VISUAL BLUEPRINT CREATOR ACTIONS
  // ===========================================================================

  openCreateModal(): void {
    this.builderMode.set('visual');
    this.builderPreviewTab.set('canvas');
    this.createError.set(null);
    this.isStudioFullscreen.set(true);
    this.loadPreset('it-procurement');
    this.isCreateModalOpen.set(true);
    this.setScrollLock(true);
  }

  closeCreateModal(): void {
    this.isCreateModalOpen.set(false);
    this.setScrollLock(false);
  }

  loadPreset(presetId: string): void {
    this.selectedPresetId.set(presetId);
    const preset = this.builderPresets.find(p => p.id === presetId);
    if (preset) {
      this.applyTemplateToBuilder(preset.template);
      this.createError.set(null);
      this.resetBuilderZoom();
    }
  }

  applyTemplateToBuilder(tpl: Partial<WorkflowTemplate>): void {
    if (!tpl) return;
    this.builderKey.set(tpl.templateKey || 'NEW_WORKFLOW_V1');
    this.builderName.set(tpl.name || 'New Enterprise Workflow');
    this.builderDescription.set(tpl.description || '');
    this.builderInitialState.set(tpl.initialState || '');

    const items: StateBuilderItem[] = [];
    if (tpl.steps) {
      const entries = Object.entries(tpl.steps);
      entries.sort((a, b) => (a[1].stepOrder || 0) - (b[1].stepOrder || 0));

      for (const [key, step] of entries) {
        const trans: TransitionBuilderItem[] = [];
        if (step.transitions) {
          for (const [act, tgt] of Object.entries(step.transitions)) {
            trans.push({ action: act, targetState: tgt });
          }
        }

        const payloadKeys = step.requiredPayloadKeys || [];

        items.push({
          id: 's_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
          stateKey: key,
          stepName: step.stepName || key,
          stepType: step.stepType || (step.isTerminal ? 'TERMINAL' : 'APPROVAL'),
          actorScope: step.actorScope || (step.isTerminal ? 'ANY' : 'ROLE'),
          requiredRole: step.requiredRole || null,
          slaHours: step.slaHours ?? null,
          isInitial: key === tpl.initialState,
          isTerminal: !!step.isTerminal,
          requiredPayloadKeys: payloadKeys,
          payloadKeysInput: payloadKeys.join(', '),
          transitions: trans
        });
      }
    }
    this.builderStates.set(items);
    if (!this.builderInitialState() && items.length > 0) {
      this.builderInitialState.set(items[0].stateKey);
    }
  }

  addState(): void {
    const states = this.builderStates();
    const count = states.length + 1;
    const newKey = `STAGE_${count}`;
    const newState: StateBuilderItem = {
      id: 's_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      stateKey: newKey,
      stepName: `Stage ${count} Review`,
      stepType: 'APPROVAL',
      actorScope: 'ROLE',
      requiredRole: 'ROLE_EMPLOYEE',
      slaHours: 24,
      isInitial: states.length === 0,
      isTerminal: false,
      requiredPayloadKeys: [],
      payloadKeysInput: '',
      transitions: []
    };

    if (states.length === 0) {
      this.builderInitialState.set(newKey);
    }

    this.builderStates.set([...states, newState]);
  }

  removeState(index: number): void {
    const states = [...this.builderStates()];
    const removed = states.splice(index, 1)[0];
    if (removed) {
      if (this.builderInitialState() === removed.stateKey && states.length > 0) {
        this.builderInitialState.set(states[0].stateKey);
      }
      states.forEach(s => {
        s.transitions = s.transitions.filter(t => t.targetState !== removed.stateKey);
      });
    }
    this.builderStates.set(states);
  }

  moveState(index: number, dir: 'up' | 'down'): void {
    const states = [...this.builderStates()];
    const targetIdx = dir === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= states.length) return;
    const temp = states[index];
    states[index] = states[targetIdx];
    states[targetIdx] = temp;
    this.builderStates.set(states);
  }

  updateStateKey(index: number, rawKey: string): void {
    const sanitized = (rawKey || '').toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    const states = [...this.builderStates()];
    const oldKey = states[index].stateKey;
    states[index].stateKey = sanitized;

    if (this.builderInitialState() === oldKey) {
      this.builderInitialState.set(sanitized);
    }

    // Cascade update to any transitions pointing to oldKey
    states.forEach(s => {
      s.transitions.forEach(t => {
        if (t.targetState === oldKey) {
          t.targetState = sanitized;
        }
      });
    });

    this.builderStates.set(states);
  }

  setInitialState(key: string): void {
    this.builderInitialState.set(key);
    this.builderStates.update(states =>
      states.map(s => ({ ...s, isInitial: s.stateKey === key }))
    );
  }

  toggleTerminal(index: number, isTerminal: boolean): void {
    const states = [...this.builderStates()];
    states[index].isTerminal = isTerminal;
    if (isTerminal) {
      states[index].stepType = 'TERMINAL';
      states[index].actorScope = 'ANY';
      states[index].transitions = [];
      states[index].slaHours = null;
    } else {
      if (states[index].stepType === 'TERMINAL') {
        states[index].stepType = 'APPROVAL';
        states[index].actorScope = 'ROLE';
        states[index].requiredRole = 'ROLE_EMPLOYEE';
        states[index].slaHours = 24;
      }
    }
    this.builderStates.set(states);
  }

  isCustomRole(role: string | null | undefined): boolean {
    if (!role) return false;
    return !this.availableRoles.includes(role);
  }

  onRoleSelectChange(state: StateBuilderItem, selectedValue: string): void {
    if (selectedValue === '__CUSTOM__') {
      state.requiredRole = state.requiredRole && !this.availableRoles.includes(state.requiredRole)
        ? state.requiredRole
        : 'ROLE_CUSTOM';
    } else {
      state.requiredRole = selectedValue;
    }
    this.builderStates.update(s => [...s]);
  }

  onCustomRoleInput(state: StateBuilderItem, rawValue: string): void {
    const sanitized = (rawValue || '').toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    state.requiredRole = sanitized;
    this.builderStates.update(s => [...s]);
  }

  addTransition(stateIndex: number): void {
    const states = [...this.builderStates()];
    const current = states[stateIndex];
    if (current.isTerminal) return;

    const terminalTarget = states.find(s => s.isTerminal && s.stateKey !== current.stateKey);
    const otherTarget = states.find(s => s.stateKey !== current.stateKey);
    const defaultTarget = (terminalTarget || otherTarget || current).stateKey;

    const actionNum = current.transitions.length + 1;
    const defaultAction = actionNum === 1 ? 'APPROVE' : (actionNum === 2 ? 'REJECT' : `ACTION_${actionNum}`);

    current.transitions.push({
      action: defaultAction,
      targetState: defaultTarget
    });

    this.builderStates.set(states);
  }

  removeTransition(stateIndex: number, transIndex: number): void {
    const states = [...this.builderStates()];
    states[stateIndex].transitions.splice(transIndex, 1);
    this.builderStates.set(states);
  }

  switchBuilderMode(mode: 'visual' | 'dsl'): void {
    if (mode === 'dsl') {
      this.newTemplateJson.set(this.builderDslPreview());
      this.builderMode.set('dsl');
    } else {
      try {
        const parsed = JSON.parse(this.newTemplateJson()) as WorkflowTemplate;
        if (parsed && typeof parsed === 'object') {
          this.applyTemplateToBuilder(parsed);
          this.builderMode.set('visual');
          this.createError.set(null);
        } else {
          this.createError.set('Invalid JSON format: object required.');
        }
      } catch (err: any) {
        this.createError.set('Cannot parse JSON into Visual Studio: ' + err.message);
      }
    }
  }

  copyBuilderDsl(): void {
    const dsl = this.builderDslPreview();
    if (dsl && navigator.clipboard) {
      navigator.clipboard.writeText(dsl);
      this.successMessage.set('Synthesized JSON DSL copied to clipboard!');
      setTimeout(() => this.successMessage.set(null), 3000);
    }
  }

  submitNewTemplate(publishImmediately: boolean): void {
    let templateToSubmit: WorkflowTemplate;

    if (this.builderMode() === 'visual') {
      const errors = this.builderValidationErrors();
      if (errors.length > 0) {
        this.createError.set(errors[0]);
        return;
      }
      templateToSubmit = this.builderTemplate();
    } else {
      try {
        templateToSubmit = JSON.parse(this.newTemplateJson()) as WorkflowTemplate;
        if (!templateToSubmit.templateKey || !templateToSubmit.name || !templateToSubmit.initialState || !templateToSubmit.steps) {
          this.createError.set('Template must define templateKey, name, initialState, and steps map.');
          return;
        }
      } catch (e: any) {
        this.createError.set('Invalid JSON format: ' + e.message);
        return;
      }
    }

    this.isSubmitting.set(true);
    this.createError.set(null);

    this.templateService.createDraft(templateToSubmit).subscribe({
      next: (created: WorkflowTemplate) => {
        if (publishImmediately) {
          this.templateService.publishTemplate(created.templateKey, created.version).subscribe({
            next: (published: WorkflowTemplate) => {
              this.isSubmitting.set(false);
              this.closeCreateModal();
              this.successMessage.set(`Successfully created & published "${published.name}" (v${published.version})!`);
              this.loadTemplates(published.templateKey);
            },
            error: (err: any) => {
              this.isSubmitting.set(false);
              this.closeCreateModal();
              this.successMessage.set(`Saved as draft "${created.name}". Publish manually when ready.`);
              this.loadTemplates(created.templateKey);
            }
          });
        } else {
          this.isSubmitting.set(false);
          this.closeCreateModal();
          this.successMessage.set(`Saved "${created.name}" as DRAFT (v${created.version}). You can publish it anytime.`);
          this.loadTemplates(created.templateKey);
        }
      },
      error: (err: any) => {
        console.error('Failed to create template draft:', err);
        this.createError.set(err?.error?.message || 'Server rejected template. Check blueprint parameters.');
        this.isSubmitting.set(false);
      }
    });
  }

  copyDsl(): void {
    const dsl = this.selectedTemplateDsl();
    if (dsl && navigator.clipboard) {
      navigator.clipboard.writeText(dsl);
      this.successMessage.set('Blueprint JSON copied to clipboard!');
      setTimeout(() => this.successMessage.set(null), 3000);
    }
  }
}
