import { Component, input, output, ChangeDetectionStrategy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DAGNode } from '../../models/template.model';

@Component({
  selector: 'app-step-details-drawer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './step-details-drawer.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StepDetailsDrawerComponent {
  readonly node = input<DAGNode | null>(null);

  readonly closeDrawer = output<void>();
  readonly stepSelect = output<string>();

  readonly isCopied = signal<boolean>(false);

  stepDsl(): string {
    const n = this.node();
    if (!n || !n.rawStep) return '{}';
    return JSON.stringify(n.rawStep, null, 2);
  }

  copyStepDsl(): void {
    const text = this.stepDsl();
    if (text && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      this.isCopied.set(true);
      setTimeout(() => this.isCopied.set(false), 2500);
    }
  }

  onClose(): void {
    this.closeDrawer.emit();
  }

  onSelect(stateKey: string): void {
    this.stepSelect.emit(stateKey);
  }
}
