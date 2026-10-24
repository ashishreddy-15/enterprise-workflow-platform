import { Component, OnInit, OnDestroy, HostListener, ViewChild, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TemplateService } from '../../services/template.service';
import {
  WorkflowTemplate,
  DAGNode
} from '../../models/template.model';
import { buildDagNodes, computeFlowLayout } from '../../utils/graph-layout.util';
import { onPersonaChanged } from '../../utils/auth-bridge.util';
import { WorkflowCanvasComponent } from '../../components/workflow-canvas/workflow-canvas.component';
import { WorkflowPipelineComponent } from '../../components/workflow-pipeline/workflow-pipeline.component';
import { WorkflowJsonViewerComponent } from '../../components/workflow-json-viewer/workflow-json-viewer.component';
import { StepDetailsDrawerComponent } from '../../components/step-details-drawer/step-details-drawer.component';
import { TemplateStudioModalComponent } from '../../components/template-studio-modal/template-studio-modal.component';

// Re-export pure helpers & data for external consumers
export { buildDagNodes, computeFlowLayout } from '../../utils/graph-layout.util';
export { BLUEPRINT_PRESETS } from '../../data/template-presets.data';

@Component({
  selector: 'app-template-designer',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    WorkflowCanvasComponent,
    WorkflowPipelineComponent,
    WorkflowJsonViewerComponent,
    StepDetailsDrawerComponent,
    TemplateStudioModalComponent
  ],
  templateUrl: './template-designer.component.html',
  styleUrls: ['./template-designer.component.css']
})
export class TemplateDesignerComponent implements OnInit, OnDestroy {
  private templateService = inject(TemplateService);

  @ViewChild('previewCanvas') previewCanvas?: WorkflowCanvasComponent;
  @ViewChild('fullscreenCanvas') fullscreenCanvas?: WorkflowCanvasComponent;

  readonly templates = signal<WorkflowTemplate[]>([]);
  readonly selectedTemplate = signal<WorkflowTemplate | null>(null);
  readonly selectedNode = signal<DAGNode | null>(null);
  readonly isLoading = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly searchQuery = signal<string>('');
  readonly statusFilter = signal<'ALL' | 'PUBLISHED' | 'DRAFT'>('ALL');
  readonly viewMode = signal<'canvas' | 'pipeline' | 'dsl'>('canvas');

  // Fullscreen Viewer State
  readonly isFullscreenCanvas = signal<boolean>(false);

  // Publishing State
  readonly isPublishing = signal<boolean>(false);

  // Studio Modal State
  readonly isCreateModalOpen = signal<boolean>(false);
  readonly editingTemplate = signal<WorkflowTemplate | null>(null);
  readonly createError = signal<string | null>(null);
  readonly isSubmitting = signal<boolean>(false);

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

  // Modern ngx-vflow + Dagre Graph Auto-Layout for Production Viewer
  readonly previewFlow = computed(() => computeFlowLayout(this.dagNodes()));
  readonly previewFlowNodes = computed(() => this.previewFlow().nodes);
  readonly previewFlowEdges = computed(() => this.previewFlow().edges);

  readonly selectedTemplateDsl = computed<string>(() => {
    const tpl = this.selectedTemplate();
    if (!tpl) return '';
    return JSON.stringify(tpl, null, 2);
  });

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
  }

  selectNodeByKey(key: string): void {
    const node = this.dagNodes().find(n => n.stateKey === key);
    if (node) {
      this.selectedNode.set(node);
    }
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

  openCreateModal(): void {
    this.editingTemplate.set(null);
    this.createError.set(null);
    this.isCreateModalOpen.set(true);
    this.setScrollLock(true);
  }

  openEditDraft(target?: WorkflowTemplate): void {
    const tpl = target || this.selectedTemplate();
    if (!tpl) return;
    this.editingTemplate.set(tpl);
    this.createError.set(null);
    this.isCreateModalOpen.set(true);
    this.setScrollLock(true);
  }

  openNewVersionDraft(target?: WorkflowTemplate): void {
    const tpl = target || this.selectedTemplate();
    if (!tpl) return;
    this.editingTemplate.set(null);
    this.createError.set(null);
    this.isCreateModalOpen.set(true);
    this.setScrollLock(true);
  }

  closeCreateModal(): void {
    this.isCreateModalOpen.set(false);
    this.editingTemplate.set(null);
    this.setScrollLock(false);
  }

  handleSaveTemplate(event: { template: WorkflowTemplate; publishImmediately: boolean }): void {
    const { template, publishImmediately } = event;
    this.isSubmitting.set(true);
    this.createError.set(null);

    const isEdit = this.editingTemplate()?.status === 'DRAFT' && !!this.editingTemplate();
    const saveObservable = isEdit
      ? this.templateService.updateDraft(this.editingTemplate()!.templateKey, this.editingTemplate()!.version, template)
      : this.templateService.createDraft(template);

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

  onJsonCopied(): void {
    this.successMessage.set('Workflow JSON copied to clipboard!');
    setTimeout(() => this.successMessage.set(null), 3000);
  }
}
