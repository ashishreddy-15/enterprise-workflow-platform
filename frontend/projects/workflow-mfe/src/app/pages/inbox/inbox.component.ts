import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { WorkflowService } from '../../services/workflow.service';
import { TaskInboxItem, WorkflowAction, WorkflowTemplate, TemplateCatalogItem, WorkflowStepperNode } from '../../models/workflow.model';
import { computeSlaCountdown } from '../../utils/sla.util';
import { buildStepperNodes } from '../../utils/stepper.util';
import { onPersonaChanged } from '../../utils/auth-bridge.util';
import { CreateWorkflowModalComponent } from '../../components/create-workflow-modal/create-workflow-modal.component';

@Component({
  selector: 'app-inbox',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe, CreateWorkflowModalComponent],
  templateUrl: './inbox.component.html',
  styleUrl: './inbox.component.css'
})
export class InboxComponent implements OnInit, OnDestroy {
  private workflowService = inject(WorkflowService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  // Reactive State Signals
  readonly tasks = signal<TaskInboxItem[]>([]);
  readonly selectedTask = signal<TaskInboxItem | null>(null);
  readonly searchQuery = signal<string>('');
  readonly activeScope = signal<'inbox' | 'participated' | 'initiated'>('inbox');
  readonly isLoading = signal<boolean>(false);
  readonly isSubmitting = signal<boolean>(false);
  readonly actionMessage = signal<string | null>(null);
  readonly actionSuccess = signal<boolean>(true);
  readonly templateMap = signal<Map<string, WorkflowTemplate>>(new Map());

  // Initiate Workflow Modal State Signals
  readonly isCreateModalOpen = signal<boolean>(false);
  readonly isCreating = signal<boolean>(false);
  readonly createErrorMessage = signal<string | null>(null);
  readonly selectedTemplateKey = signal<string>('VENDOR_ONBOARDING');
  readonly newWorkflowTitle = signal<string>('');
  // Dynamic published template catalog loaded via template-service
  readonly templateCatalog = signal<TemplateCatalogItem[]>([]);
  readonly isTemplatesLoading = signal<boolean>(false);

  // Dynamic Form Model State: arbitrary step payload key-value store
  readonly payloadForm = signal<Record<string, string>>({});
  readonly reviewComments = signal<string>('');

  // Selected template object dynamically computed for the launch modal
  readonly selectedTemplate = computed(() => {
    const key = this.selectedTemplateKey();
    return this.templateCatalog().find(t => t.key === key) || this.templateCatalog()[0];
  });

  // Live Clock Signal for real-time SLA countdown updating
  readonly now = signal<number>(Date.now());
  private clockInterval: any;
  private destroyPersonaBridge?: () => void;

  // Live SLA Countdown Computation (delegated to pure utility)
  readonly slaCountdown = computed(() => {
    this.now(); // register signal dependency for reactive tick
    return computeSlaCountdown(this.selectedTask());
  });

  // Dynamically Derived Workflow Stepper Sequence (delegated to pure utility)
  readonly stepperNodes = computed<WorkflowStepperNode[]>(() => {
    const task = this.selectedTask();
    if (!task) return [];
    const tpl = this.templateMap().get(task.templateId);
    return buildStepperNodes(task, tpl);
  });

  readonly currentStepIndex = computed<number>(() => {
    const nodes = this.stepperNodes();
    const idx = nodes.findIndex(n => n.status === 'CURRENT');
    if (idx >= 0) return idx;
    const termIdx = nodes.findIndex(n => n.status === 'TERMINAL_APPROVED' || n.status === 'TERMINAL_REJECTED');
    if (termIdx >= 0) return termIdx;
    return nodes.length - 1;
  });

  // Filtered Tasks computed signal
  readonly filteredTasks = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    if (!query) {
      return this.tasks();
    }
    return this.tasks().filter(t =>
      t.title.toLowerCase().includes(query) ||
      t.templateId.toLowerCase().includes(query) ||
      t.currentState.toLowerCase().includes(query) ||
      t.workflowId.toLowerCase().includes(query)
    );
  });

  // Dynamically derived actions for the currently selected task
  readonly availableActions = computed<WorkflowAction[]>(() => {
    const task = this.selectedTask();
    if (!task) return [];

    const tpl = this.templateMap().get(task.templateId);
    const step = tpl?.steps?.[task.currentState];
    if (step && step.transitions && Object.keys(step.transitions).length > 0) {
      return Object.entries(step.transitions).map(([key, targetState]) => ({
        key,
        label: this.formatActionLabel(key),
        variant: this.getActionVariant(key),
        targetState
      }));
    }

    // Generic fallback actions if template transitions not populated
    return [
      { key: 'REJECT', label: 'Reject', variant: 'danger', targetState: 'REJECTED' },
      { key: 'APPROVE', label: 'Approve \u2192', variant: 'primary', targetState: 'APPROVED' }
    ];
  });

  // Keys required by the currently active step (derived directly from template definition)
  readonly currentStepRequiredKeys = computed<string[]>(() => {
    const task = this.selectedTask();
    if (!task) return [];
    const tpl = this.templateMap().get(task.templateId);
    const step = tpl?.steps?.[task.currentState];
    if (step?.requiredPayloadKeys && step.requiredPayloadKeys.length > 0) {
      return step.requiredPayloadKeys;
    }
    return [];
  });

  setPayloadValue(key: string, value: string): void {
    this.payloadForm.set({
      ...this.payloadForm(),
      [key]: value
    });
  }

  setScope(scope: 'inbox' | 'participated' | 'initiated'): void {
    this.activeScope.set(scope);
    this.selectedTask.set(null);
    this.loadInbox();
  }

  getActiveUser(): { id: string; roles: string[] } {
    try {
      const saved = localStorage.getItem('ewp_active_persona');
      if (saved) {
        if (saved.startsWith('{')) {
          const parsed = JSON.parse(saved);
          return { id: parsed.id || '', roles: parsed.roles || [] };
        }
        return { id: saved, roles: [] };
      }
    } catch (e) {}
    return { id: '', roles: [] };
  }

  readonly isTerminal = computed<boolean>(() => {
    const task = this.selectedTask();
    if (!task) return false;
    const s = task.currentState?.toUpperCase();
    return ['ONBOARDED', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED', 'CLOSED'].includes(s);
  });

  readonly isTerminalRejected = computed<boolean>(() => {
    const task = this.selectedTask();
    if (!task) return false;
    const s = task.currentState?.toUpperCase();
    return ['REJECTED', 'CANCELLED'].includes(s);
  });

  readonly canActionCurrentStep = computed<boolean>(() => {
    const task = this.selectedTask();
    if (!task || this.isTerminal()) return false;

    const user = this.getActiveUser();
    const scope = task.actorScope?.toUpperCase() || 'ANY';
    const step = this.currentStep();
    const isInitialStep = (this.activeTemplate()?.initialState?.toUpperCase() === task.currentState?.toUpperCase())
      || (step?.stepOrder === 1);
    const isApprovalStep = !step?.stepType || step.stepType.toUpperCase() === 'APPROVAL';

    if (scope === 'REQUESTER') {
      return user.id.toLowerCase() === task.requesterId?.toLowerCase();
    } else if (scope === 'ROLE') {
      // Must not be requester (Separation of Duties) ONLY for approval steps (non-initial)
      if (isApprovalStep && !isInitialStep && user.id.toLowerCase() === task.requesterId?.toLowerCase()) {
        return false;
      }
      if (!task.requiredRole) return true;
      return user.roles.some(r => r.toUpperCase() === task.requiredRole?.toUpperCase());
    }
    return true;
  });

  formatFieldLabel(key: string): string {
    return key;
  }

  isPayloadValid(task: TaskInboxItem): boolean {
    const requiredKeys = this.currentStepRequiredKeys();
    if (requiredKeys.length === 0) return true;
    const form = this.payloadForm();
    return requiredKeys.every(k => (form[k] || '').trim().length > 0);
  }

  actionRequiresPayload(actionKey: string, task: TaskInboxItem): boolean {
    const upper = actionKey.toUpperCase();
    if (upper.includes('REJECT') || upper.includes('CANCEL') || upper.includes('DECLINE')) {
      return false;
    }
    return this.currentStepRequiredKeys().length > 0;
  }

  isActionDisabled(action: WorkflowAction, task: TaskInboxItem): boolean {
    if (this.isSubmitting()) {
      return true;
    }
    if (this.actionRequiresPayload(action.key, task)) {
      return !this.isPayloadValid(task);
    }
    return false;
  }

  getActionDisabledReason(action: WorkflowAction, task: TaskInboxItem): string {
    if (this.isSubmitting()) {
      return 'Processing request...';
    }
    if (this.actionRequiresPayload(action.key, task) && !this.isPayloadValid(task)) {
      const form = this.payloadForm();
      const missing = this.currentStepRequiredKeys()
        .filter(k => !(form[k] || '').trim())
        .map(k => this.formatFieldLabel(k));
      return `Required fields missing: ${missing.join(', ')}`;
    }
    return '';
  }

  ngOnInit(): void {
    this.loadInbox();
    this.loadTemplates();
    // Re-fetch inbox whenever the persona switcher in Shell changes roles
    this.destroyPersonaBridge = onPersonaChanged(() => {
      this.loadInbox();
      this.loadTemplates();
    });

    // Live clock ticker every 15s for dynamic SLA countdown
    this.clockInterval = setInterval(() => {
      this.now.set(Date.now());
    }, 15000);

    // Deep link support: /workflows?action=new opens the launch modal directly
    this.route.queryParams.subscribe(params => {
      if (params['action'] === 'new') {
        this.openCreateModal();
      }
    });
  }

  loadTemplates(): void {
    this.isTemplatesLoading.set(true);
    this.workflowService.getTemplates().subscribe({
      next: (templates) => {
        this.isTemplatesLoading.set(false);

        // Pre-populate templateMap with every template loaded from backend
        const nextMap = new Map(this.templateMap());
        for (const tpl of templates) {
          nextMap.set(tpl.templateKey, tpl);
        }
        this.templateMap.set(nextMap);

        // Map to catalog items for the modal picker (only published templates can be initiated)
        const catalogItems: TemplateCatalogItem[] = templates
          .filter(tpl => !tpl.status || tpl.status === 'PUBLISHED')
          .map(tpl => {
          const initialStepDef = tpl.steps?.[tpl.initialState];
          const initialStepName = initialStepDef?.stepName || tpl.initialState || 'Initial Step';
          const sla = initialStepDef?.slaHours ? `${initialStepDef.slaHours}h` : null;
          return {
            key: tpl.templateKey,
            name: tpl.name || tpl.templateKey,
            category: 'Enterprise Governance',
            description: tpl.description || '',
            initialStep: initialStepName,
            estimatedSla: sla
          };
        });

        this.templateCatalog.set(catalogItems);

        // Default selected key if not already set to a valid template
        if (catalogItems.length > 0 && !catalogItems.some(c => c.key === this.selectedTemplateKey())) {
          this.selectedTemplateKey.set(catalogItems[0].key);
        }
      },
      error: (err) => {
        this.isTemplatesLoading.set(false);
        console.error('Failed to load published templates from template-service:', err);
      }
    });
  }

  ngOnDestroy(): void {
    this.destroyPersonaBridge?.();
    if (this.clockInterval) {
      clearInterval(this.clockInterval);
    }
  }

  openCreateModal(): void {
    this.newWorkflowTitle.set('');
    this.createErrorMessage.set(null);
    this.isCreateModalOpen.set(true);
  }

  closeCreateModal(): void {
    this.isCreateModalOpen.set(false);
    this.createErrorMessage.set(null);
    this.router.navigate([], { relativeTo: this.route, queryParams: {} });
  }

  selectCatalogTemplate(key: string): void {
    this.selectedTemplateKey.set(key);
  }

  createAndLaunchWorkflow(data?: { templateKey: string; title: string }): void {
    const templateKey = data?.templateKey || this.selectedTemplateKey();
    const title = (data?.title || this.newWorkflowTitle()).trim();
    if (!title) {
      return;
    }

    this.isCreating.set(true);
    this.createErrorMessage.set(null);

    this.workflowService.createWorkflow(templateKey, title).subscribe({
      next: (res) => {
        this.isCreating.set(false);
        this.isCreateModalOpen.set(false);
        this.actionSuccess.set(true);
        this.actionMessage.set(`Workflow '${res.title}' initiated successfully! State: ${res.currentState}`);
        this.router.navigate([], { relativeTo: this.route, queryParams: {} });
        this.loadInbox(res.id);
      },
      error: (err) => {
        this.isCreating.set(false);
        const detail = err.error?.detail || err.error?.message || 'Failed to initiate workflow.';
        this.createErrorMessage.set(detail);
      }
    });
  }

  loadInbox(targetWorkflowId?: string): void {
    this.isLoading.set(true);
    if (!targetWorkflowId) {
      this.actionMessage.set(null);
    }

    this.workflowService.getInbox(this.activeScope()).subscribe({
      next: (items) => {
        this.tasks.set(items);
        this.isLoading.set(false);

        // Pre-fetch template definitions for tasks in the inbox
        for (const item of items) {
          this.loadTemplate(item.templateId);
        }

        // If targetWorkflowId is specified, find and select that workflow
        if (targetWorkflowId) {
          const targetTask = items.find(i => i.workflowId === targetWorkflowId);
          if (targetTask) {
            this.selectTask(targetTask);
            return;
          }
        }

        // Keep current selected item if present, else auto-select first
        const currentSelected = this.selectedTask();
        if (currentSelected) {
          const updated = items.find(i => i.workflowId === currentSelected.workflowId);
          const taskToSet = updated || (items.length > 0 ? items[0] : null);
          this.selectedTask.set(taskToSet);
          if (taskToSet) {
            this.loadTemplate(taskToSet.templateId);
          }
        } else if (items.length > 0) {
          this.selectedTask.set(items[0]);
          this.loadTemplate(items[0].templateId);
        } else {
          this.selectedTask.set(null);
        }
      },
      error: (err) => {
        console.error('Failed to load inbox tasks:', err);
        this.isLoading.set(false);
      }
    });
  }

  private loadTemplate(templateKey: string): void {
    if (this.templateMap().has(templateKey)) {
      return;
    }
    this.workflowService.getTemplate(templateKey).subscribe({
      next: (tpl) => {
        const nextMap = new Map(this.templateMap());
        nextMap.set(templateKey, tpl);
        this.templateMap.set(nextMap);
      },
      error: (err) => {
        console.warn(`Could not load template definition for ${templateKey}:`, err);
      }
    });
  }

  getContextDataEntries(task: TaskInboxItem): Array<{ key: string; value: string }> {
    if (!task.contextData) return [];
    return Object.entries(task.contextData).map(([key, value]) => ({
      key,
      value: typeof value === 'object' ? JSON.stringify(value) : String(value ?? '')
    }));
  }

  isUrl(value: string): boolean {
    return typeof value === 'string' && (value.startsWith('http://') || value.startsWith('https://'));
  }

  selectTask(task: TaskInboxItem): void {
    this.selectedTask.set(task);
    this.actionMessage.set(null);
    this.reviewComments.set('');
    this.loadTemplate(task.templateId);

    // Pre-populate payload form from task contextData or initialize empty
    const initialPayload: Record<string, string> = {};
    if (task.contextData) {
      for (const [k, v] of Object.entries(task.contextData)) {
        if (typeof v === 'string') {
          initialPayload[k] = v;
        }
      }
    }
    this.payloadForm.set(initialPayload);
  }

  onSearchInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.searchQuery.set(input.value);
  }

  dismissActionMessage(): void {
    this.actionMessage.set(null);
  }

  formatActionLabel(key: string): string {
    return key;
  }

  getActionVariant(key: string): 'primary' | 'danger' | 'secondary' {
    const upper = key.toUpperCase();
    if (upper.includes('REJECT') || upper.includes('DECLINE')) return 'danger';
    if (upper.includes('VERIFY') || upper.includes('APPROVE') || upper.includes('SUBMIT') || upper.includes('ONBOARD')) return 'primary';
    return 'secondary';
  }

  executeAction(actionKey: string, task: TaskInboxItem): void {
    if (this.actionRequiresPayload(actionKey, task) && !this.isPayloadValid(task)) {
      return;
    }

    this.isSubmitting.set(true);
    this.actionMessage.set(null);

    let payload: Record<string, unknown> | undefined = undefined;
    if (this.currentStepRequiredKeys().length > 0) {
      const form = this.payloadForm();
      const cleanPayload: Record<string, string> = {};
      for (const k of this.currentStepRequiredKeys()) {
        cleanPayload[k] = (form[k] || '').trim();
      }
      payload = cleanPayload;
    }

    const userComments = this.reviewComments().trim();
    const commentToSend = userComments || `Action ${this.formatActionLabel(actionKey)} executed via Workbench`;

    this.workflowService.transitionWorkflow(task.workflowId, {
      action: actionKey,
      comments: commentToSend,
      payload
    }).subscribe({
      next: (res) => {
        this.isSubmitting.set(false);
        this.actionSuccess.set(true);
        this.reviewComments.set('');
        this.actionMessage.set(`Action '${this.formatActionLabel(actionKey)}' completed successfully. Current state: ${res.currentState}`);
        this.loadInbox();
      },
      error: (err) => {
        this.isSubmitting.set(false);
        this.actionSuccess.set(false);
        const detail = err.error?.detail || err.error?.message || 'Transition rejected by workflow engine.';
        this.actionMessage.set(detail);
      }
    });
  }
}
