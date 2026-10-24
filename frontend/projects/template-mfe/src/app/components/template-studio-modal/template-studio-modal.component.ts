import {
  Component,
  input,
  output,
  signal,
  computed,
  effect,
  ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Connection } from 'ngx-vflow';
import {
  WorkflowTemplate,
  DAGNode,
  StepDefinition,
  TransitionBuilderItem,
  ConditionalTransitionItem,
  StateBuilderItem,
  BlueprintPreset
} from '../../models/template.model';
import { buildDagNodes, computeFlowLayout } from '../../utils/graph-layout.util';
import { BLUEPRINT_PRESETS } from '../../data/template-presets.data';
import {
  AVAILABLE_STEP_TYPES,
  AVAILABLE_ACTOR_SCOPES,
  AVAILABLE_ROLES
} from '../../constants/designer.constants';
import { WorkflowCanvasComponent } from '../workflow-canvas/workflow-canvas.component';
import { WorkflowPipelineComponent } from '../workflow-pipeline/workflow-pipeline.component';
import { WorkflowJsonViewerComponent } from '../workflow-json-viewer/workflow-json-viewer.component';

@Component({
  selector: 'app-template-studio-modal',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    WorkflowCanvasComponent,
    WorkflowPipelineComponent,
    WorkflowJsonViewerComponent
  ],
  templateUrl: './template-studio-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TemplateStudioModalComponent {
  readonly isOpen = input.required<boolean>();
  readonly editingTemplate = input<WorkflowTemplate | null>(null);
  readonly isSubmitting = input<boolean>(false);
  readonly errorMessage = input<string | null>(null);

  readonly save = output<{ template: WorkflowTemplate; publishImmediately: boolean }>();
  readonly closeModal = output<void>();

  readonly builderPresets = BLUEPRINT_PRESETS;
  readonly selectedPresetId = signal<string>('it-procurement');
  readonly builderMode = signal<'visual' | 'dsl'>('visual');
  readonly builderPreviewTab = signal<'canvas' | 'pipeline' | 'dsl'>('canvas');
  readonly isStudioFullscreen = signal<boolean>(true);
  readonly builderKey = signal<string>('IT_HARDWARE_PROCUREMENT_V1');
  readonly builderName = signal<string>('IT Equipment & Hardware Procurement');
  readonly builderDescription = signal<string>('Employee hardware request with IT approval and procurement fulfillment');
  readonly builderInitialState = signal<string>('REQUEST_SUBMISSION');
  readonly builderStates = signal<StateBuilderItem[]>([]);
  readonly newTemplateJson = signal<string>('');
  readonly localError = signal<string | null>(null);
  readonly toastMessage = signal<string | null>(null);

  readonly availableStepTypes = AVAILABLE_STEP_TYPES;
  readonly availableActorScopes = AVAILABLE_ACTOR_SCOPES;
  readonly availableRoles = AVAILABLE_ROLES;

  readonly isEditing = computed(() => !!this.editingTemplate());
  readonly isEditingDraft = computed(() => this.editingTemplate()?.status === 'DRAFT');

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
      version: this.editingTemplate()?.version || 1,
      name: this.builderName(),
      description: this.builderDescription(),
      status: this.editingTemplate()?.status || 'DRAFT',
      initialState: this.builderInitialState(),
      steps: stepsMap
    };
  });

  readonly builderDagNodes = computed<DAGNode[]>(() => buildDagNodes(this.builderTemplate()));
  readonly builderFlow = computed(() => computeFlowLayout(this.builderDagNodes()));
  readonly builderFlowNodes = computed(() => this.builderFlow().nodes);
  readonly builderFlowEdges = computed(() => this.builderFlow().edges);
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

  constructor() {
    effect(() => {
      const open = this.isOpen();
      const tpl = this.editingTemplate();
      if (open) {
        this.localError.set(null);
        this.builderMode.set('visual');
        this.builderPreviewTab.set('canvas');
        if (tpl) {
          this.applyTemplateToBuilder(tpl);
        } else {
          this.loadPreset('it-procurement');
        }
      }
    });
  }

  loadPreset(presetId: string): void {
    this.selectedPresetId.set(presetId);
    const preset = this.builderPresets.find(p => p.id === presetId);
    if (preset) {
      this.applyTemplateToBuilder(preset.template);
      this.localError.set(null);
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

    states.forEach(s => {
      s.transitions.forEach(t => {
        if (t.targetState === oldKey) t.targetState = sanitized;
      });
      if (s.conditionalTransitions) {
        s.conditionalTransitions.forEach(t => {
          if (t.targetState === oldKey) t.targetState = sanitized;
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

    let defaultTarget = '';
    if (stateIndex + 1 < states.length && !states[stateIndex + 1].isTerminal) {
      defaultTarget = states[stateIndex + 1].stateKey;
    } else {
      const terminalState = states.find(s => s.isTerminal && !['REJECTED', 'CANCELLED'].includes(s.stateKey.toUpperCase()))
        || states.find(s => s.isTerminal)
        || states.find(s => s.stateKey !== current.stateKey);
      defaultTarget = terminalState ? terminalState.stateKey : current.stateKey;
    }
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
          this.localError.set(null);
        } else {
          this.localError.set('Invalid JSON format: object required.');
        }
      } catch (err: any) {
        this.localError.set('Cannot parse JSON into Visual Studio: ' + err.message);
      }
    }
  }

  onBuilderConnect(conn: Connection): void {
    if (!conn.source || !conn.target || conn.source === conn.target) return;
    const states = [...this.builderStates()];
    const sourceState = states.find(s => s.stateKey === conn.source);
    if (!sourceState || sourceState.isTerminal) return;

    const existing = sourceState.transitions.find(t => t.targetState === conn.target);
    if (existing) {
      this.showToast(`Transition from "${conn.source}" to "${conn.target}" already exists (${existing.action}).`);
      return;
    }

    const isRejectTarget = ['REJECTED', 'CANCELLED'].includes(conn.target.toUpperCase());
    let defaultAction = 'NEXT';
    if (sourceState.transitions.length === 0) {
      defaultAction = isRejectTarget ? 'REJECT' : 'APPROVE';
    } else if (sourceState.transitions.length === 1) {
      defaultAction = isRejectTarget ? 'REJECT' : (sourceState.transitions[0].action === 'APPROVE' ? 'REJECT' : 'APPROVE');
    } else {
      defaultAction = isRejectTarget ? 'REJECT' : `ACTION_${sourceState.transitions.length + 1}`;
    }

    sourceState.transitions.push({
      action: defaultAction,
      targetState: conn.target
    });

    this.builderStates.set(states);
    this.showToast(`Connected "${conn.source}" ➔ "${conn.target}" with action [${defaultAction}].`);
  }

  focusStep(key: string): void {
    const el = document.getElementById('step-card-' + key);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      el.classList.add('ring-2', 'ring-indigo-500');
      setTimeout(() => el.classList.remove('ring-2', 'ring-indigo-500'), 1500);
    }
  }

  showToast(msg: string): void {
    this.toastMessage.set(msg);
    setTimeout(() => this.toastMessage.set(null), 3500);
  }

  toggleStudioFullscreen(): void {
    this.isStudioFullscreen.update(f => !f);
  }

  onSubmit(publishImmediately: boolean): void {
    let tpl: WorkflowTemplate;

    if (this.builderMode() === 'visual') {
      const errors = this.builderValidationErrors();
      if (errors.length > 0) {
        this.localError.set(errors[0]);
        return;
      }
      tpl = this.builderTemplate();
    } else {
      try {
        tpl = JSON.parse(this.newTemplateJson()) as WorkflowTemplate;
        if (!tpl.templateKey || !tpl.name || !tpl.initialState || !tpl.steps) {
          this.localError.set('Template must define templateKey, name, initialState, and steps map.');
          return;
        }
      } catch (e: any) {
        this.localError.set('Invalid JSON format: ' + e.message);
        return;
      }
    }

    this.save.emit({ template: tpl, publishImmediately });
  }

  onClose(): void {
    this.closeModal.emit();
  }
}
