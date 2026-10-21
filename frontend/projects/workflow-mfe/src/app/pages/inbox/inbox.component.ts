import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { WorkflowService } from '../../services/workflow.service';
import { TaskInboxItem, WorkflowAction, WorkflowTemplate, TemplateCatalogItem, WorkflowStepperNode } from '../../models/workflow.model';

@Component({
  selector: 'app-inbox',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
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

  readonly templateCatalog: TemplateCatalogItem[] = [
    {
      key: 'VENDOR_ONBOARDING',
      name: 'Enterprise Vendor KYC & Legal Onboarding',
      category: 'Procurement & Compliance',
      description: 'Two-stage multi-party vendor onboarding. Requester uploads verified PAN & GST credentials, routed to Legal & Compliance officers for final verification.',
      initialStep: 'Awaiting KYC Documents',
      estimatedSla: '24h'
    },
    {
      key: 'VENDOR_ONBOARDING_TEST',
      name: 'Fast-Track Vendor Audit & Risk Check',
      category: 'Vendor Governance',
      description: 'Expedited compliance audit with automated state machine transitions and audit logging.',
      initialStep: 'Awaiting KYC Documents',
      estimatedSla: '12h'
    }
  ];

  readonly quickFillTitles: string[] = [
    'Acme Industrial Technologies Ltd',
    'Starlight Global Logistics Inc',
    'Zenith Semiconductor Labs'
  ];

  // Dynamic Form Model State (Signals for instantaneous zoneless UI reactivity)
  readonly panCardUrl = signal<string>('https://storage.corp.internal/kyc/pan.pdf');
  readonly gstCertUrl = signal<string>('https://storage.corp.internal/kyc/gst.pdf');
  readonly reviewComments = signal<string>('All submitted KYC certificates verified against official registry. Approved.');

  // Live Clock Signal for real-time SLA countdown updating
  readonly now = signal<number>(Date.now());
  private clockInterval: any;

  private personaChangeListener = () => {
    this.loadInbox();
  };

  // Live SLA Countdown Computation
  readonly slaCountdown = computed(() => {
    this.now(); // register signal dependency for reactive tick
    const task = this.selectedTask();
    if (!task) {
      return { label: 'No Active Task', isBreached: false, urgency: 'normal' as const };
    }
    if (task.slaBreached) {
      return { label: 'SLA Breached', isBreached: true, urgency: 'breached' as const };
    }
    if (!task.currentStepDueAt) {
      return { label: 'No SLA Attached', isBreached: false, urgency: 'normal' as const };
    }

    const due = new Date(task.currentStepDueAt).getTime();
    const diffMs = due - Date.now();
    if (diffMs <= 0) {
      return { label: 'SLA Overdue', isBreached: true, urgency: 'breached' as const };
    }

    const totalHours = Math.floor(diffMs / (1000 * 60 * 60));
    const totalMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const urgency: 'normal' | 'warning' | 'breached' = totalHours <= 2 ? 'warning' : 'normal';

    if (totalHours >= 24) {
      const days = Math.floor(totalHours / 24);
      const remHours = totalHours % 24;
      return { label: `${days}d ${remHours}h left`, isBreached: false, urgency };
    }
    if (totalHours > 0) {
      return { label: `${totalHours}h ${totalMins}m left`, isBreached: false, urgency };
    }
    return { label: `${totalMins}m left`, isBreached: false, urgency: 'warning' as const };
  });

  // Dynamically Derived Workflow Stepper Sequence
  readonly stepperNodes = computed<WorkflowStepperNode[]>(() => {
    const task = this.selectedTask();
    if (!task) return [];

    const tpl = this.templateMap().get(task.templateId);
    const stepsMap = tpl?.steps;

    if (stepsMap && Object.keys(stepsMap).length > 0) {
      const stepList = Object.entries(stepsMap)
        .map(([key, def]) => ({
          stepKey: key,
          stepOrder: def.stepOrder || 1,
          stepName: def.stepName || key,
          actorScope: def.actorScope || 'ROLE',
          requiredRole: def.requiredRole || null,
          isTerminal: !!def.isTerminal,
          slaHours: def.slaHours
        }))
        .sort((a, b) => a.stepOrder - b.stepOrder);

      const currentStepOrder = stepsMap[task.currentState]?.stepOrder ?? 1;

      return stepList.map(step => {
        let status: 'COMPLETED' | 'CURRENT' | 'UPCOMING' = 'UPCOMING';
        let completedBy: string | null = null;
        let actedAt: string | null = null;

        if (step.stepKey === task.currentState) {
          status = 'CURRENT';
        } else if (step.stepOrder < currentStepOrder) {
          status = 'COMPLETED';
          const match = task.taskHistory?.find(h => h.stepOrder === step.stepOrder || h.stepName === step.stepName);
          if (match) {
            completedBy = match.completedBy;
            actedAt = match.actedAt;
          }
        } else {
          status = 'UPCOMING';
        }

        return {
          stepKey: step.stepKey,
          stepOrder: step.stepOrder,
          stepName: step.stepName,
          actorScope: step.actorScope,
          requiredRole: step.requiredRole,
          isTerminal: step.isTerminal,
          status,
          completedBy,
          actedAt
        };
      });
    }

    // High fidelity fallback sequence if template is loading
    const isPastKyc = task.currentState !== 'AWAITING_KYC_DOCS';
    const isPastLegal = task.currentState === 'ONBOARDED' || task.currentState === 'REJECTED';

    return [
      {
        stepKey: 'AWAITING_KYC_DOCS',
        stepOrder: 1,
        stepName: 'Upload Vendor KYC Documents',
        actorScope: 'REQUESTER',
        requiredRole: null,
        isTerminal: false,
        status: task.currentState === 'AWAITING_KYC_DOCS' ? 'CURRENT' : 'COMPLETED',
        completedBy: isPastKyc ? (task.taskHistory?.[0]?.completedBy || task.requesterId) : null,
        actedAt: isPastKyc ? task.taskHistory?.[0]?.actedAt : null
      },
      {
        stepKey: 'PENDING_LEGAL_VERIFY',
        stepOrder: 2,
        stepName: 'Legal Compliance Review',
        actorScope: 'ROLE',
        requiredRole: 'ROLE_LEGAL_COUNSEL',
        isTerminal: false,
        status: task.currentState === 'PENDING_LEGAL_VERIFY' ? 'CURRENT' : (isPastLegal ? 'COMPLETED' : 'UPCOMING'),
        completedBy: isPastLegal ? (task.taskHistory?.[1]?.completedBy || 'legal_counsel_meera') : null,
        actedAt: isPastLegal ? task.taskHistory?.[1]?.actedAt : null
      },
      {
        stepKey: 'ONBOARDED',
        stepOrder: 3,
        stepName: task.currentState === 'REJECTED' ? 'Vendor Rejected' : 'Vendor Active & Onboarded',
        actorScope: 'ANY',
        requiredRole: null,
        isTerminal: true,
        status: (task.currentState === 'ONBOARDED' || task.currentState === 'REJECTED') ? 'CURRENT' : 'UPCOMING'
      }
    ];
  });

  readonly currentStepIndex = computed<number>(() => {
    const nodes = this.stepperNodes();
    const idx = nodes.findIndex(n => n.status === 'CURRENT');
    return idx >= 0 ? idx : 0;
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

    // Intelligent default actions based on known workflow blueprint states
    if (task.currentState === 'PENDING_LEGAL_VERIFY') {
      return [
        { key: 'REJECT_VENDOR', label: 'Reject', variant: 'danger', targetState: 'REJECTED' },
        { key: 'VERIFY_AND_ONBOARD', label: 'Verify & Onboard \u2192', variant: 'primary', targetState: 'ONBOARDED' }
      ];
    }
    if (task.currentState === 'AWAITING_KYC_DOCS') {
      return [
        { key: 'SUBMIT_DOCS', label: 'Submit KYC Documents \u2192', variant: 'primary', targetState: 'PENDING_LEGAL_VERIFY' },
        { key: 'CANCEL', label: 'Cancel', variant: 'secondary', targetState: 'CANCELLED' }
      ];
    }

    return [
      { key: 'REJECT', label: 'Reject', variant: 'danger', targetState: 'REJECTED' },
      { key: 'APPROVE', label: 'Approve \u2192', variant: 'primary', targetState: 'APPROVED' }
    ];
  });

  fillSampleKycData(): void {
    this.panCardUrl.set('https://storage.corp.internal/kyc/pan.pdf');
    this.gstCertUrl.set('https://storage.corp.internal/kyc/gst.pdf');
  }

  isPayloadValid(task: TaskInboxItem): boolean {
    const tpl = this.templateMap().get(task.templateId);
    const step = tpl?.steps?.[task.currentState];
    const requiredKeys = step?.requiredPayloadKeys || (task.currentState === 'AWAITING_KYC_DOCS' ? ['panCardUrl', 'gstCertUrl'] : []);

    if (requiredKeys.includes('panCardUrl') && !this.panCardUrl().trim()) {
      return false;
    }
    if (requiredKeys.includes('gstCertUrl') && !this.gstCertUrl().trim()) {
      return false;
    }
    return true;
  }

  actionRequiresPayload(actionKey: string, task: TaskInboxItem): boolean {
    const upper = actionKey.toUpperCase();
    // Non-submitting actions (reject/cancel) do not require document payload
    if (upper.includes('REJECT') || upper.includes('CANCEL') || upper.includes('DECLINE')) {
      return false;
    }
    const tpl = this.templateMap().get(task.templateId);
    const step = tpl?.steps?.[task.currentState];
    const requiredKeys = step?.requiredPayloadKeys || (task.currentState === 'AWAITING_KYC_DOCS' ? ['panCardUrl', 'gstCertUrl'] : []);
    return requiredKeys.length > 0;
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
      const missing: string[] = [];
      if (!this.panCardUrl().trim()) missing.push('PAN Card URL');
      if (!this.gstCertUrl().trim()) missing.push('GST Certificate URL');
      return `Required fields missing: ${missing.join(', ')}`;
    }
    return '';
  }

  ngOnInit(): void {
    this.loadInbox();
    // Re-fetch inbox whenever the persona switcher in Shell changes roles
    window.addEventListener('ewp:persona-changed', this.personaChangeListener);

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

  ngOnDestroy(): void {
    window.removeEventListener('ewp:persona-changed', this.personaChangeListener);
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

  setQuickTitle(title: string): void {
    this.newWorkflowTitle.set(title);
  }

  createAndLaunchWorkflow(): void {
    const title = this.newWorkflowTitle().trim();
    if (!title) {
      return;
    }

    this.isCreating.set(true);
    this.createErrorMessage.set(null);

    this.workflowService.createWorkflow(this.selectedTemplateKey(), title).subscribe({
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

    this.workflowService.getInbox().subscribe({
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
    this.loadTemplate(task.templateId);

    // If task contextData already contains submitted values, populate form inputs
    if (task.contextData?.['panCardUrl']) {
      this.panCardUrl.set(String(task.contextData['panCardUrl']));
    }
    if (task.contextData?.['gstCertUrl']) {
      this.gstCertUrl.set(String(task.contextData['gstCertUrl']));
    }
  }

  onSearchInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.searchQuery.set(input.value);
  }

  dismissActionMessage(): void {
    this.actionMessage.set(null);
  }

  formatActionLabel(key: string): string {
    if (key === 'REJECT_VENDOR') return 'Reject';
    if (key === 'VERIFY_AND_ONBOARD') return 'Verify & Onboard \u2192';
    if (key === 'SUBMIT_DOCS') return 'Submit KYC Documents \u2192';
    return key
      .split('_')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
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
    if (actionKey === 'SUBMIT_DOCS' || task.currentState === 'AWAITING_KYC_DOCS') {
      payload = {
        panCardUrl: this.panCardUrl().trim(),
        gstCertUrl: this.gstCertUrl().trim()
      };
    }

    this.workflowService.transitionWorkflow(task.workflowId, {
      action: actionKey,
      comments: this.reviewComments() || `Action ${actionKey} executed via Workbench`,
      payload
    }).subscribe({
      next: (res) => {
        this.isSubmitting.set(false);
        this.actionSuccess.set(true);
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
