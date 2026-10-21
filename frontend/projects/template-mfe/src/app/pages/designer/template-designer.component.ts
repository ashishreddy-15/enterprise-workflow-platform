import { Component, OnInit, OnDestroy, HostListener, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TemplateService } from '../../services/template.service';
import { WorkflowTemplate, DAGNode, StepDefinition, CanvasNode, CanvasEdge } from '../../models/template.model';

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

  // Interactive 2D Graph Canvas State
  readonly zoomLevel = signal<number>(1);
  readonly panOffset = signal<{ x: number; y: number }>({ x: 30, y: 30 });
  readonly isPanning = signal<boolean>(false);
  readonly isFullscreenCanvas = signal<boolean>(false);
  private panStart = { x: 0, y: 0 };
  readonly hoveredNodeKey = signal<string | null>(null);
  readonly hoveredEdgeId = signal<string | null>(null);

  // Publishing State
  readonly isPublishing = signal<boolean>(false);

  // New Blueprint Modal
  readonly isCreateModalOpen = signal<boolean>(false);
  readonly newTemplateJson = signal<string>('');
  readonly createError = signal<string | null>(null);
  readonly isSubmitting = signal<boolean>(false);

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
      // Status filter
      if (sf !== 'ALL' && t.status !== sf) {
        return false;
      }
      // Search filter
      if (!q) return true;
      return (
        t.templateKey.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q) ||
        (t.description && t.description.toLowerCase().includes(q))
      );
    });
  });

  // Convert selected template's steps map into sorted DAG Nodes
  readonly dagNodes = computed<DAGNode[]>(() => {
    const tpl = this.selectedTemplate();
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
  });

  // Dynamically compute 2D Hierarchical Auto-Layout for the visual node graph canvas
  readonly canvasLayout = computed<{
    nodes: CanvasNode[];
    edges: CanvasEdge[];
    canvasWidth: number;
    canvasHeight: number;
  }>(() => {
    const rawNodes = this.dagNodes();
    if (!rawNodes || rawNodes.length === 0) {
      return { nodes: [], edges: [], canvasWidth: 800, canvasHeight: 480 };
    }

    const NODE_WIDTH = 230;
    const NODE_HEIGHT = 118;
    const HORIZONTAL_GAP = 120;
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

    // Sort nodes within each column:
    // Success / Approval first, Regular intermediate next, Rejection / Cancelled terminal last
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

        // Exit port from right edge of source card
        const sourceX = source.x + source.width;
        const exitOffset = isDanger ? 22 : -15;
        const sourceY = source.y + source.height / 2 + (source.outgoingTransitions.length > 1 ? exitOffset : 0);

        // Entry port on left edge of target card
        const targetX = target.x;
        const entryOffset = isDanger ? 18 : -15;
        const targetY = target.y + target.height / 2 + (target.incomingTransitions.length > 1 ? entryOffset : 0);

        // Cubic Bezier curve control points
        let pathD = '';
        let midX = 0;
        let midY = 0;

        if (targetX > sourceX) {
          // Forward rightward flow
          const deltaX = Math.max(50, (targetX - sourceX) * 0.45);
          const cp1x = sourceX + deltaX;
          const cp1y = sourceY;
          const cp2x = targetX - deltaX;
          const cp2y = targetY;

          pathD = `M ${sourceX} ${sourceY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${targetX} ${targetY}`;

          // Precise Cubic Bezier midpoint formula at t = 0.5
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
          // Backward / loop-back flow
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
  });

  readonly selectedTemplateDsl = computed<string>(() => {
    const tpl = this.selectedTemplate();
    if (!tpl) return '';
    return JSON.stringify(tpl, null, 2);
  });

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

  private setScrollLock(locked: boolean): void {
    const mainEl = document.querySelector('main');
    if (locked) {
      document.body.style.overflow = 'hidden';
      if (mainEl) (mainEl as HTMLElement).style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      if (mainEl) (mainEl as HTMLElement).style.overflow = '';
    }
  }

  loadTemplates(selectKey?: string): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    this.templateService.getTemplates('ALL').subscribe({
      next: (list) => {
        this.templates.set(list || []);
        if (list && list.length > 0) {
          const keyToSelect = selectKey || this.selectedTemplate()?.templateKey;
          const matched = list.find(t => t.templateKey === keyToSelect);
          this.selectTemplate(matched || list[0]);
        }
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Failed to load workflow blueprints:', err);
        this.errorMessage.set('Could not load templates from template-service.');
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
    return JSON.stringify(node.rawStep || node, null, 2);
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

  // Interactive 2D Canvas Viewport Controls
  zoomIn(): void {
    this.zoomLevel.update(z => Math.min(1.8, +(z + 0.15).toFixed(2)));
  }

  zoomOut(): void {
    this.zoomLevel.update(z => Math.max(0.5, +(z - 0.15).toFixed(2)));
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

  @HostListener('window:mouseup')
  onWindowMouseUp(): void {
    if (this.isPanning()) {
      this.isPanning.set(false);
    }
  }

  publishSelectedTemplate(): void {
    const tpl = this.selectedTemplate();
    if (!tpl || tpl.status === 'PUBLISHED') return;

    this.isPublishing.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    this.templateService.publishTemplate(tpl.templateKey, tpl.version).subscribe({
      next: (published) => {
        this.isPublishing.set(false);
        this.successMessage.set(`Successfully published "${published.name}" (v${published.version})! It is now active.`);
        this.loadTemplates(published.templateKey);
      },
      error: (err) => {
        console.error('Failed to publish template:', err);
        this.errorMessage.set('Failed to publish template: ' + (err?.error?.message || err?.message));
        this.isPublishing.set(false);
      }
    });
  }

  openCreateModal(): void {
    const sampleTemplate: Partial<WorkflowTemplate> = {
      templateKey: 'EQUIPMENT_PROCUREMENT_V1',
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
          requiredRole: 'ROLE_PROCUREMENT',
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
    };

    this.newTemplateJson.set(JSON.stringify(sampleTemplate, null, 2));
    this.createError.set(null);
    this.isCreateModalOpen.set(true);
    this.setScrollLock(true);
  }

  closeCreateModal(): void {
    this.isCreateModalOpen.set(false);
    this.setScrollLock(false);
  }

  submitNewTemplate(publishImmediately: boolean): void {
    try {
      const parsed = JSON.parse(this.newTemplateJson()) as WorkflowTemplate;
      if (!parsed.templateKey || !parsed.name || !parsed.initialState || !parsed.steps) {
        this.createError.set('Template must define templateKey, name, initialState, and steps map.');
        return;
      }

      this.isSubmitting.set(true);
      this.createError.set(null);

      this.templateService.createDraft(parsed).subscribe({
        next: (created) => {
          if (publishImmediately) {
            // Immediately publish after drafting
            this.templateService.publishTemplate(created.templateKey, created.version).subscribe({
              next: (published) => {
                this.isSubmitting.set(false);
                this.closeCreateModal();
                this.successMessage.set(`Successfully created & published "${published.name}"!`);
                this.loadTemplates(published.templateKey);
              },
              error: (err) => {
                this.isSubmitting.set(false);
                this.closeCreateModal();
                this.successMessage.set(`Saved as draft "${created.name}". Publish manually when ready.`);
                this.loadTemplates(created.templateKey);
              }
            });
          } else {
            // Saved as draft
            this.isSubmitting.set(false);
            this.closeCreateModal();
            this.successMessage.set(`Saved "${created.name}" as DRAFT (v${created.version}). You can publish it anytime.`);
            this.loadTemplates(created.templateKey);
          }
        },
        error: (err) => {
          console.error('Failed to create template draft:', err);
          this.createError.set(err?.error?.message || 'Server rejected template. Check DSL syntax.');
          this.isSubmitting.set(false);
        }
      });
    } catch (e: any) {
      this.createError.set('Invalid JSON format: ' + e.message);
    }
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
