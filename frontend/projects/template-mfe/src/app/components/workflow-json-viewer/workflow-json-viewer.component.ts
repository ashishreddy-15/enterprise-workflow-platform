import { Component, input, output, ChangeDetectionStrategy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-workflow-json-viewer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './workflow-json-viewer.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WorkflowJsonViewerComponent {
  readonly json = input.required<string>();
  readonly title = input<string>('Blueprint JSON Specification');
  readonly maxHeight = input<string>('550px');

  readonly copied = output<void>();
  readonly isCopied = signal<boolean>(false);

  copyToClipboard(): void {
    const text = this.json();
    if (text && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      this.isCopied.set(true);
      this.copied.emit();
      setTimeout(() => this.isCopied.set(false), 2500);
    }
  }
}
