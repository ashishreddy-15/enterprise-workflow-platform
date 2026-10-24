import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DAGNode } from '../../models/template.model';

@Component({
  selector: 'app-workflow-pipeline',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './workflow-pipeline.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WorkflowPipelineComponent {
  readonly nodes = input.required<DAGNode[]>();
  readonly selectedKey = input<string | null | undefined>(null);

  readonly nodeSelect = output<string>();

  onSelect(stateKey: string): void {
    this.nodeSelect.emit(stateKey);
  }
}
