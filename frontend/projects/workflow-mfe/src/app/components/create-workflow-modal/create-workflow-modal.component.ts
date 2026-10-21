import { Component, input, model, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TemplateCatalogItem } from '../../models/workflow.model';

@Component({
  selector: 'app-create-workflow-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './create-workflow-modal.component.html'
})
export class CreateWorkflowModalComponent {
  readonly isOpen = input<boolean>(false);
  readonly templateCatalog = input<TemplateCatalogItem[]>([]);
  readonly isTemplatesLoading = input<boolean>(false);
  readonly isCreating = input<boolean>(false);
  readonly createErrorMessage = input<string | null>(null);

  readonly selectedTemplateKey = model<string>('VENDOR_ONBOARDING');
  readonly newWorkflowTitle = model<string>('');

  readonly close = output<void>();
  readonly launch = output<{ templateKey: string; title: string }>();
  readonly dismissError = output<void>();

  readonly selectedTemplate = computed(() => {
    const key = this.selectedTemplateKey();
    const catalog = this.templateCatalog();
    return catalog.find(t => t.key === key) || catalog[0];
  });

  selectCatalogTemplate(key: string): void {
    this.selectedTemplateKey.set(key);
  }

  onClose(): void {
    this.close.emit();
  }

  onLaunch(): void {
    const title = this.newWorkflowTitle().trim();
    if (!title || this.isCreating()) return;
    this.launch.emit({
      templateKey: this.selectedTemplateKey(),
      title
    });
  }

  onDismissError(): void {
    this.dismissError.emit();
  }
}
