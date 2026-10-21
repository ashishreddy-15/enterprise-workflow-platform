import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { WorkflowService } from '../../services/workflow.service';
import { TaskInboxItem } from '../../models/workflow.model';

@Component({
  selector: 'app-inbox',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  templateUrl: './inbox.component.html',
  styleUrl: './inbox.component.css'
})
export class InboxComponent implements OnInit {
  private workflowService = inject(WorkflowService);

  // Reactive State Signals
  readonly tasks = signal<TaskInboxItem[]>([]);
  readonly selectedTask = signal<TaskInboxItem | null>(null);
  readonly searchQuery = signal<string>('');
  readonly isLoading = signal<boolean>(false);
  readonly isSubmitting = signal<boolean>(false);
  readonly actionMessage = signal<string | null>(null);
  readonly actionSuccess = signal<boolean>(true);

  // Dynamic Form Model State
  panCardUrl = 'https://storage.corp.internal/kyc/pan.pdf';
  gstCertUrl = 'https://storage.corp.internal/kyc/gst.pdf';
  reviewComments = 'All submitted KYC certificates verified against official registry. Approved.';

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

  ngOnInit(): void {
    this.loadInbox();
  }

  loadInbox(): void {
    this.isLoading.set(true);
    this.actionMessage.set(null);

    this.workflowService.getInbox().subscribe({
      next: (items) => {
        this.tasks.set(items);
        this.isLoading.set(false);

        // Keep current selected item if present, else auto-select first
        const currentSelected = this.selectedTask();
        if (currentSelected) {
          const updated = items.find(i => i.workflowId === currentSelected.workflowId);
          this.selectedTask.set(updated || (items.length > 0 ? items[0] : null));
        } else if (items.length > 0) {
          this.selectedTask.set(items[0]);
        }
      },
      error: (err) => {
        console.error('Failed to load inbox tasks:', err);
        this.isLoading.set(false);
      }
    });
  }

  selectTask(task: TaskInboxItem): void {
    this.selectedTask.set(task);
    this.actionMessage.set(null);
  }

  onSearchInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.searchQuery.set(input.value);
  }

  submitKycDocs(task: TaskInboxItem): void {
    this.isSubmitting.set(true);
    this.actionMessage.set(null);

    this.workflowService.transitionWorkflow(task.workflowId, {
      action: 'SUBMIT_DOCS',
      comments: 'KYC documents submitted via Workflow MFE Workbench',
      payload: {
        panCardUrl: this.panCardUrl,
        gstCertUrl: this.gstCertUrl
      }
    }).subscribe({
      next: (res) => {
        this.isSubmitting.set(false);
        this.actionSuccess.set(true);
        this.actionMessage.set(`Successfully transitioned workflow to ${res.currentState}`);
        this.loadInbox();
      },
      error: (err) => {
        this.isSubmitting.set(false);
        this.actionSuccess.set(false);
        this.actionMessage.set(err.error?.detail || 'Transition rejected by workflow engine.');
      }
    });
  }

  approveLegalWorkflow(task: TaskInboxItem): void {
    this.isSubmitting.set(true);
    this.actionMessage.set(null);

    this.workflowService.transitionWorkflow(task.workflowId, {
      action: 'VERIFY_AND_ONBOARD',
      comments: this.reviewComments
    }).subscribe({
      next: (res) => {
        this.isSubmitting.set(false);
        this.actionSuccess.set(true);
        this.actionMessage.set(`Workflow approved and completed: ${res.currentState}`);
        this.loadInbox();
      },
      error: (err) => {
        this.isSubmitting.set(false);
        this.actionSuccess.set(false);
        this.actionMessage.set(err.error?.detail || 'Approval rejected by workflow engine.');
      }
    });
  }

  rejectWorkflow(task: TaskInboxItem): void {
    this.isSubmitting.set(true);
    this.actionMessage.set(null);

    this.workflowService.transitionWorkflow(task.workflowId, {
      action: 'REJECT',
      comments: 'Rejected during legal review'
    }).subscribe({
      next: (res) => {
        this.isSubmitting.set(false);
        this.actionSuccess.set(true);
        this.actionMessage.set(`Workflow rejected: ${res.currentState}`);
        this.loadInbox();
      },
      error: (err) => {
        this.isSubmitting.set(false);
        this.actionSuccess.set(false);
        this.actionMessage.set(err.error?.detail || 'Rejection failed.');
      }
    });
  }
}
