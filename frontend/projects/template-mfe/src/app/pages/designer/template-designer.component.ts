import { Component, OnInit, OnDestroy, HostListener, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TemplateService } from '../../services/template.service';
import { WorkflowTemplate, DAGNode, StepDefinition } from '../../models/template.model';

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
  readonly searchQuery = signal<string>('');
  readonly viewMode = signal<'graph' | 'dsl'>('graph');

  // New Blueprint Modal
  readonly isCreateModalOpen = signal<boolean>(false);
  readonly newTemplateJson = signal<string>('');
  readonly createError = signal<string | null>(null);
  readonly isSubmitting = signal<boolean>(false);

  private personaListener?: (event: Event) => void;

  readonly filteredTemplates = computed<WorkflowTemplate[]>(() => {
    const q = this.searchQuery().trim().toLowerCase();
    if (!q) return this.templates();

    return this.templates().filter(t =>
      t.templateKey.toLowerCase().includes(q) ||
      t.name.toLowerCase().includes(q) ||
      (t.description && t.description.toLowerCase().includes(q))
    );
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
        incomingTransitions: []
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
    if (this.isCreateModalOpen()) {
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

  loadTemplates(): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    this.templateService.getTemplates().subscribe({
      next: (list) => {
        this.templates.set(list || []);
        if (list && list.length > 0) {
          // If no template is currently selected, select the first one
          if (!this.selectedTemplate()) {
            this.selectTemplate(list[0]);
          } else {
            // Re-select fresh instance
            const matched = list.find(t => t.templateKey === this.selectedTemplate()?.templateKey);
            if (matched) this.selectTemplate(matched);
          }
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
  }

  selectNode(node: DAGNode): void {
    this.selectedNode.set(node);
  }

  setViewMode(mode: 'graph' | 'dsl'): void {
    this.viewMode.set(mode);
  }

  openCreateModal(): void {
    const sampleTemplate: Partial<WorkflowTemplate> = {
      templateKey: 'EXPENSE_REPORT_V1',
      version: 1,
      name: 'Standard Corporate Expense Reimbursement',
      description: 'Employee expense report submission with manager & finance approval gates',
      status: 'DRAFT',
      initialState: 'DRAFT_SUBMISSION',
      steps: {
        DRAFT_SUBMISSION: {
          stepOrder: 1,
          stepName: 'Submit Expense Details & Receipts',
          stepType: 'DOCUMENT_SUBMISSION',
          actorScope: 'REQUESTER',
          requiredRole: null,
          requiredPayloadKeys: ['expenseAmount', 'receiptUrl'],
          isTerminal: false,
          slaHours: 48,
          transitions: {
            SUBMIT_REPORT: 'PENDING_MANAGER_APPROVAL'
          }
        },
        PENDING_MANAGER_APPROVAL: {
          stepOrder: 2,
          stepName: 'Line Manager Review',
          stepType: 'APPROVAL',
          actorScope: 'ROLE',
          requiredRole: 'ROLE_MANAGER',
          requiredPayloadKeys: [],
          isTerminal: false,
          slaHours: 24,
          transitions: {
            APPROVE: 'PENDING_FINANCE_DISBURSEMENT',
            REJECT: 'REJECTED'
          }
        },
        PENDING_FINANCE_DISBURSEMENT: {
          stepOrder: 3,
          stepName: 'Finance Reimbursement Processing',
          stepType: 'APPROVAL',
          actorScope: 'ROLE',
          requiredRole: 'ROLE_FINANCE',
          requiredPayloadKeys: [],
          isTerminal: false,
          slaHours: 48,
          transitions: {
            DISBURSE_FUNDS: 'COMPLETED',
            REJECT: 'REJECTED'
          }
        },
        COMPLETED: {
          stepOrder: 4,
          stepName: 'Reimbursement Completed',
          stepType: 'TERMINAL',
          actorScope: 'ANY',
          requiredRole: null,
          requiredPayloadKeys: [],
          isTerminal: true,
          transitions: {}
        },
        REJECTED: {
          stepOrder: 5,
          stepName: 'Expense Claim Rejected',
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

  submitNewTemplate(): void {
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
          this.isSubmitting.set(false);
          this.closeCreateModal();
          this.loadTemplates();
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
    }
  }
}
