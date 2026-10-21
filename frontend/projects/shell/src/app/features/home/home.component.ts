import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { HttpClient } from '@angular/common/http';

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

  private personaChangeListener = () => {
    this.loadWorkQueue();
  };

  ngOnInit(): void {
    this.loadWorkQueue();
    window.addEventListener('ewp:persona-changed', this.personaChangeListener);
  }

  ngOnDestroy(): void {
    window.removeEventListener('ewp:persona-changed', this.personaChangeListener);
  }

  loadWorkQueue(): void {
    this.isLoading.set(true);
    this.http.get<WorkflowQueueSummary[]>('http://localhost:8080/workflows/api/v1/tasks/inbox').subscribe({
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
