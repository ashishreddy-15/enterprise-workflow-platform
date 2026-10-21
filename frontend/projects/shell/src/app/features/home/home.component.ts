import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { onPersonaChanged } from '../../core/utils/auth-bridge.util';

interface WorkflowQueueSummary {
  workflowId: string;
  templateId: string;
  title: string;
  currentState: string;
  currentStepName: string;
  actorScope: string;
  requiredRole: string | null;
  currentStepDueAt: string | null;
  slaBreached: boolean;
  updatedAt: string;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css'
})
export class HomeComponent implements OnInit, OnDestroy {
  auth = inject(AuthService);
  private http = inject(HttpClient);

  readonly tasks = signal<WorkflowQueueSummary[]>([]);
  readonly isLoading = signal<boolean>(false);
  private destroyPersonaBridge?: () => void;

  ngOnInit(): void {
    this.loadWorkQueue();
    this.destroyPersonaBridge = onPersonaChanged(() => this.loadWorkQueue());
  }

  ngOnDestroy(): void {
    this.destroyPersonaBridge?.();
  }

  loadWorkQueue(): void {
    this.isLoading.set(true);
    this.http.get<WorkflowQueueSummary[]>(`${environment.gatewayUrl}/workflows/api/v1/tasks/inbox`).subscribe({
      next: (data) => {
        this.tasks.set(data);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Failed to load active queue summary:', err);
        this.isLoading.set(false);
      }
    });
  }
}
