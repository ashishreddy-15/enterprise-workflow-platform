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
  readonly successMessage = signal<string | null>(null);
  readonly searchQuery = signal<string>('');
  readonly statusFilter = signal<'ALL' | 'PUBLISHED' | 'DRAFT'>('ALL');
  readonly viewMode = signal<'graph' | 'dsl'>('graph');

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

  setViewMode(mode: 'graph' | 'dsl'): void {
    this.viewMode.set(mode);
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
