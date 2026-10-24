import {
  Component,
  ViewChild,
  input,
  output,
  effect,
  ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Vflow, VflowComponent, Connection, Node, Edge } from 'ngx-vflow';
import { FlowCardData, FlowEdgeData } from '../../utils/graph-layout.util';

@Component({
  selector: 'app-workflow-canvas',
  standalone: true,
  imports: [CommonModule, Vflow],
  templateUrl: './workflow-canvas.component.html',
  styleUrls: ['../../pages/designer/template-designer.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WorkflowCanvasComponent {
  @ViewChild('vflow') vflow?: VflowComponent;

  readonly nodes = input.required<Node<FlowCardData>[]>();
  readonly edges = input.required<Edge<FlowEdgeData>[]>();
  readonly selectedKey = input<string | null | undefined>(null);
  readonly readOnly = input<boolean>(true);
  readonly minZoom = input<number>(0.4);
  readonly maxZoom = input<number>(1.5);

  readonly nodeSelect = output<string>();
  readonly connect = output<Connection>();

  constructor() {
    effect(() => {
      // Re-center graph whenever nodes change
      const currentNodes = this.nodes();
      if (currentNodes.length > 0) {
        setTimeout(() => this.fitView(), 120);
      }
    });
  }

  zoomIn(): void {
    if (this.vflow) {
      const cur = this.vflow.viewport().zoom;
      this.vflow.zoomTo(Math.min(2.0, +(cur + 0.15).toFixed(2)));
    }
  }

  zoomOut(): void {
    if (this.vflow) {
      const cur = this.vflow.viewport().zoom;
      this.vflow.zoomTo(Math.max(0.3, +(cur - 0.15).toFixed(2)));
    }
  }

  fitView(): void {
    if (this.vflow) {
      this.vflow.fitView({ padding: 0.2, duration: 250 });
    }
  }

  onNodeClick(stateKey: string): void {
    this.nodeSelect.emit(stateKey);
  }

  onConnect(conn: Connection): void {
    this.connect.emit(conn);
  }

  getEdgeData(edge: any): FlowEdgeData {
    if (!edge) return { action: '', isDanger: false };
    const d = typeof edge.data === 'function' ? edge.data() : edge.data;
    return d || { action: '', isDanger: false };
  }
}
