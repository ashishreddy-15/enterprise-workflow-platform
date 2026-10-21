import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { TaskInboxItem, WorkflowTransitionRequest, WorkflowTransitionResponse } from '../models/workflow.model';

@Injectable({
  providedIn: 'root'
})
export class WorkflowService {
  private http = inject(HttpClient);
  private readonly gatewayBaseUrl = 'http://localhost:8080/workflows/api/v1';

  getInbox(): Observable<TaskInboxItem[]> {
    return this.http.get<TaskInboxItem[]>(`${this.gatewayBaseUrl}/tasks/inbox`);
  }

  transitionWorkflow(workflowId: string, request: WorkflowTransitionRequest): Observable<WorkflowTransitionResponse> {
    return this.http.post<WorkflowTransitionResponse>(
      `${this.gatewayBaseUrl}/workflows/${workflowId}/transition`,
      request
    );
  }
}
