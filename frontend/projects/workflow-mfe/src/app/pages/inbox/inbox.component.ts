import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { WorkflowService } from '../../services/workflow.service';
import { TaskInboxItem, WorkflowAction, WorkflowTemplate } from '../../models/workflow.model';

@Component({
  selector: 'app-inbox',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  templateUrl: './inbox.component.html',
  styleUrl: './inbox.component.css'
})
export class InboxComponent implements OnInit, OnDestroy {
  private workflowService = inject(WorkflowService);

  // Reactive State Signals
  readonly tasks = signal<TaskInboxItem[]>([]);
  readonly selectedTask = signal<TaskInboxItem | null>(null);
  readonly searchQuery = signal<string>('');
  readonly isLoading = signal<boolean>(false);
  readonly isSubmitting = signal<boolean>(false);
  readonly actionMessage = signal<string | null>(null);
  readonly actionSuccess = signal<boolean>(true);
  readonly templateMap = signal<Map<string, WorkflowTemplate>>(new Map());

  // Dynamic Form Model State
  panCardUrl = 'https://storage.corp.internal/kyc/pan.pdf';
  gstCertUrl = 'https://storage.corp.internal/kyc/gst.pdf';
  reviewComments = 'All submitted KYC certificates verified against official registry. Approved.';

  private personaChangeListener = () => {
    this.loadInbox();
  };

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

  ngOnInit(): void {
    this.loadInbox();
    // Re-fetch inbox whenever the persona switcher in Shell changes roles
    window.addEventListener('ewp:persona-changed', this.personaChangeListener);
  }

  ngOnDestroy(): void {
    window.removeEventListener('ewp:persona-changed', this.personaChangeListener);
  }

  loadInbox(): void {
    this.isLoading.set(true);
    this.actionMessage.set(null);

    this.workflowService.getInbox().subscribe({
      next: (items) => {
        this.tasks.set(items);
        this.isLoading.set(false);

        // Pre-fetch template definitions for tasks in the inbox
        for (const item of items) {
          this.loadTemplate(item.templateId);
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

  selectTask(task: TaskInboxItem): void {
    this.selectedTask.set(task);
    this.actionMessage.set(null);
    this.loadTemplate(task.templateId);
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
    this.isSubmitting.set(true);
    this.actionMessage.set(null);

    let payload: Record<string, unknown> | undefined = undefined;
    if (actionKey === 'SUBMIT_DOCS' || task.currentState === 'AWAITING_KYC_DOCS') {
      payload = {
        panCardUrl: this.panCardUrl,
        gstCertUrl: this.gstCertUrl
      };
    }

    this.workflowService.transitionWorkflow(task.workflowId, {
      action: actionKey,
      comments: this.reviewComments || `Action ${actionKey} executed via Workbench`,
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
