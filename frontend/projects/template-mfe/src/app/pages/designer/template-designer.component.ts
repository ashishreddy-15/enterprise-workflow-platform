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
  ConditionalTransitionItem,
  StateBuilderItem,
  BlueprintPreset
} from '../../models/template.model';
import { buildDagNodes, computeCanvasLayout } from '../../utils/graph-layout.util';
import { BLUEPRINT_PRESETS } from '../../data/template-presets.data';
import { onPersonaChanged } from '../../utils/auth-bridge.util';
import {
  AVAILABLE_STEP_TYPES,
  AVAILABLE_ACTOR_SCOPES,
  AVAILABLE_ROLES
} from '../../constants/designer.constants';

// Re-export pure helpers & data for external consumers
export { buildDagNodes, computeCanvasLayout } from '../../utils/graph-layout.util';
export { BLUEPRINT_PRESETS } from '../../data/template-presets.data';

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

  // Existing Draft Editing & Branching State
  readonly editingTemplate = signal<WorkflowTemplate | null>(null);
  readonly isEditingDraft = computed(() => this.editingTemplate()?.status === 'DRAFT');
  readonly isEditingExisting = computed(() => !!this.editingTemplate());

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

  readonly availableStepTypes = AVAILABLE_STEP_TYPES;
  readonly availableActorScopes = AVAILABLE_ACTOR_SCOPES;
  readonly availableRoles = AVAILABLE_ROLES;

  private destroyPersonaBridge?: () => void;

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

      const payloadKeys = !s.isTerminal && s.payloadKeysInput
        ? s.payloadKeysInput.split(',').map(k => k.trim()).filter(Boolean)
        : (!s.isTerminal ? s.requiredPayloadKeys || [] : []);

      const condList = !s.isTerminal && s.conditionalTransitions && s.conditionalTransitions.length > 0
        ? s.conditionalTransitions
            .filter(c => c.action && c.targetState && c.condition)
            .map((c, cIdx) => ({
              action: c.action.trim().toUpperCase(),
              condition: c.condition.trim(),
              targetState: c.targetState,
              priority: c.priority || (cIdx + 1)
            }))
        : [];

      const isParallel = s.actorScope === 'PARALLEL_ROLES' || s.stepType === 'PARALLEL_APPROVAL';
      const reqRoles = isParallel ? (s.requiredRoles || []) : [];

      stepsMap[s.stateKey] = {
        stepOrder: idx + 1,
        stepName: s.stepName,
        stepType: s.isTerminal ? 'TERMINAL' : s.stepType,
        actorScope: s.isTerminal ? 'ANY' : s.actorScope,
        requiredRole: !s.isTerminal && s.actorScope === 'ROLE' ? (s.requiredRole || null) : null,
        requiredRoles: reqRoles,
        requiredPayloadKeys: payloadKeys,
        isTerminal: s.isTerminal,
        slaHours: !s.isTerminal && s.slaHours ? +s.slaHours : null,
        transitions: transMap,
        conditionalTransitions: condList
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
      errors.push('Workflow ID is required (e.g. INVOICE_V1).');
    } else if (!/^[A-Z0-9_]+$/.test(key)) {
      errors.push('Workflow ID must contain only uppercase letters, numbers, and underscores.');
    }

    if (!name) {
      errors.push('Workflow Name is required.');
    }

    if (states.length < 2) {
      errors.push('Workflow must contain at least 2 steps (e.g. 1 starting step and 1 ending step).');
    }

    const keySet = new Set<string>();
    for (const s of states) {
      if (!s.stateKey || !s.stateKey.trim()) {
        errors.push('Every step must have a non-empty Step ID.');
      } else if (keySet.has(s.stateKey)) {
        errors.push(`Duplicate step ID "${s.stateKey}". Step IDs must be unique.`);
      } else {
        keySet.add(s.stateKey);
      }
    }

    if (initial && !keySet.has(initial)) {
      errors.push(`Starting step "${initial}" does not match any defined step ID.`);
    }

    const hasTerminal = states.some(s => s.isTerminal);
    if (!hasTerminal) {
      errors.push('Workflow must have at least one ending step (e.g. COMPLETED or REJECTED).');
    }

    for (const s of states) {
      if (s.actorScope === 'ROLE' && (!s.requiredRole || !s.requiredRole.trim())) {
        errors.push(`Step "${s.stateKey}" is assigned to a role, but no Required Role is specified.`);
      }
      if (!s.isTerminal) {
        if (s.transitions.length === 0) {
          errors.push(`Step "${s.stateKey}" is not an ending step, but has no next step specified.`);
        }
        for (const t of s.transitions) {
          if (!t.action || !t.action.trim()) {
            errors.push(`Step "${s.stateKey}" has a next step with an empty action name.`);
          }
          if (!t.targetState || !keySet.has(t.targetState)) {
            errors.push(`Action [${t.action || '?'}] in "${s.stateKey}" leads to non-existent step "${t.targetState}".`);
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
    this.destroyPersonaBridge = onPersonaChanged(() => this.loadTemplates());
  }

  ngOnDestroy(): void {
    this.setScrollLock(false);
    this.destroyPersonaBridge?.();
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
    this.successMessage.set(`Copied step code to clipboard!`);
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
    this.editingTemplate.set(null);
    this.builderMode.set('visual');
    this.builderPreviewTab.set('canvas');
    this.createError.set(null);
    this.isStudioFullscreen.set(true);
    this.loadPreset('it-procurement');
    this.isCreateModalOpen.set(true);
    this.setScrollLock(true);
  }

  openEditDraft(target?: WorkflowTemplate): void {
    const tpl = target || this.selectedTemplate();
    if (!tpl) return;
    this.editingTemplate.set(tpl);
    this.builderMode.set('visual');
    this.builderPreviewTab.set('canvas');
    this.createError.set(null);
    this.isStudioFullscreen.set(true);
    this.applyTemplateToBuilder(tpl);
    this.resetBuilderZoom();
    this.isCreateModalOpen.set(true);
    this.setScrollLock(true);
  }

  openNewVersionDraft(target?: WorkflowTemplate): void {
    const tpl = target || this.selectedTemplate();
    if (!tpl) return;
    this.editingTemplate.set(null);
    this.builderMode.set('visual');
    this.builderPreviewTab.set('canvas');
    this.createError.set(null);
    this.isStudioFullscreen.set(true);
    this.applyTemplateToBuilder(tpl);
    this.resetBuilderZoom();
    this.isCreateModalOpen.set(true);
    this.setScrollLock(true);
  }

  closeCreateModal(): void {
    this.isCreateModalOpen.set(false);
    this.editingTemplate.set(null);
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

        const condTrans: ConditionalTransitionItem[] = [];
        if (step.conditionalTransitions) {
          for (const ct of step.conditionalTransitions) {
            condTrans.push({
              action: ct.action || 'APPROVE',
              condition: ct.condition || '',
              targetState: ct.targetState,
              priority: ct.priority ?? (condTrans.length + 1)
            });
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
          requiredRoles: step.requiredRoles ? [...step.requiredRoles] : [],
          slaHours: step.slaHours ?? null,
          isInitial: key === tpl.initialState,
          isTerminal: !!step.isTerminal,
          requiredPayloadKeys: payloadKeys,
          payloadKeysInput: payloadKeys.join(', '),
          transitions: trans,
          conditionalTransitions: condTrans
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
      requiredRoles: [],
      slaHours: 24,
      isInitial: states.length === 0,
      isTerminal: false,
      requiredPayloadKeys: [],
      payloadKeysInput: '',
      transitions: [],
      conditionalTransitions: []
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
        if (s.conditionalTransitions) {
          s.conditionalTransitions = s.conditionalTransitions.filter(t => t.targetState !== removed.stateKey);
        }
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
      if (s.conditionalTransitions) {
        s.conditionalTransitions.forEach(t => {
          if (t.targetState === oldKey) {
            t.targetState = sanitized;
          }
        });
      }
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
      states[index].requiredRole = null;
      states[index].requiredRoles = [];
      states[index].requiredPayloadKeys = [];
      states[index].payloadKeysInput = '';
      states[index].transitions = [];
      states[index].conditionalTransitions = [];
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

  addConditionalTransition(stateIndex: number): void {
    const states = [...this.builderStates()];
    const current = states[stateIndex];
    if (current.isTerminal) return;

    const otherTarget = states.find(s => s.stateKey !== current.stateKey);
    const defaultTarget = (otherTarget || current).stateKey;
    const ruleNum = (current.conditionalTransitions?.length || 0) + 1;

    if (!current.conditionalTransitions) {
      current.conditionalTransitions = [];
    }

    current.conditionalTransitions.push({
      action: 'APPROVE',
      condition: '#amount > 10000',
      targetState: defaultTarget,
      priority: ruleNum
    });

    this.builderStates.set(states);
  }

  removeConditionalTransition(stateIndex: number, condIndex: number): void {
    const states = [...this.builderStates()];
    if (states[stateIndex].conditionalTransitions) {
      states[stateIndex].conditionalTransitions.splice(condIndex, 1);
      this.builderStates.set(states);
    }
  }

  toggleParallelRole(state: StateBuilderItem, role: string): void {
    if (!state.requiredRoles) {
      state.requiredRoles = [];
    }
    const idx = state.requiredRoles.indexOf(role);
    if (idx >= 0) {
      state.requiredRoles.splice(idx, 1);
    } else {
      state.requiredRoles.push(role);
    }
    this.builderStates.update(s => [...s]);
  }

  isParallelRoleSelected(state: StateBuilderItem, role: string): boolean {
    return !!state.requiredRoles && state.requiredRoles.includes(role);
  }

  addCustomParallelRole(state: StateBuilderItem, inputElement: HTMLInputElement): void {
    const role = (inputElement.value || '').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    if (role) {
      const fullRole = role.startsWith('ROLE_') ? role : `ROLE_${role}`;
      if (!state.requiredRoles) {
        state.requiredRoles = [];
      }
      if (!state.requiredRoles.includes(fullRole)) {
        state.requiredRoles.push(fullRole);
        this.builderStates.update(s => [...s]);
      }
      inputElement.value = '';
    }
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
      this.successMessage.set('Workflow JSON copied to clipboard!');
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

    const isEdit = this.isEditingDraft() && !!this.editingTemplate();
    const saveObservable = isEdit
      ? this.templateService.updateDraft(this.editingTemplate()!.templateKey, this.editingTemplate()!.version, templateToSubmit)
      : this.templateService.createDraft(templateToSubmit);

    saveObservable.subscribe({
      next: (result: WorkflowTemplate) => {
        if (publishImmediately) {
          this.templateService.publishTemplate(result.templateKey, result.version).subscribe({
            next: (published: WorkflowTemplate) => {
              this.isSubmitting.set(false);
              this.closeCreateModal();
              this.successMessage.set(
                isEdit
                  ? `Successfully updated & published "${published.name}" (v${published.version})!`
                  : `Successfully created & published "${published.name}" (v${published.version})!`
              );
              this.loadTemplates(published.templateKey);
            },
            error: (err: any) => {
              this.isSubmitting.set(false);
              this.closeCreateModal();
              this.successMessage.set(
                isEdit
                  ? `Updated draft "${result.name}". Publish manually when ready.`
                  : `Saved as draft "${result.name}". Publish manually when ready.`
              );
              this.loadTemplates(result.templateKey);
            }
          });
        } else {
          this.isSubmitting.set(false);
          this.closeCreateModal();
          this.successMessage.set(
            isEdit
              ? `Successfully updated draft "${result.name}" (v${result.version}).`
              : `Saved "${result.name}" as DRAFT (v${result.version}). You can publish it anytime.`
          );
          this.loadTemplates(result.templateKey);
        }
      },
      error: (err: any) => {
        console.error('Failed to save template draft:', err);
        this.createError.set(err?.error?.message || 'Server rejected workflow. Please check your step parameters.');
        this.isSubmitting.set(false);
      }
    });
  }

  copyDsl(): void {
    const dsl = this.selectedTemplateDsl();
    if (dsl && navigator.clipboard) {
      navigator.clipboard.writeText(dsl);
      this.successMessage.set('Workflow JSON copied to clipboard!');
      setTimeout(() => this.successMessage.set(null), 3000);
    }
  }
}
