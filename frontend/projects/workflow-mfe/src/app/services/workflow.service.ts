import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { TaskInboxItem, WorkflowTransitionRequest, WorkflowTransitionResponse, WorkflowResponse, WorkflowTemplate } from '../models/workflow.model';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class WorkflowService {
  private http = inject(HttpClient);
  private readonly gatewayBaseUrl = `${environment.gatewayUrl}/workflows/api/v1`;
  private readonly templateBaseUrl = `${environment.gatewayUrl}/templates/api/v1`;

  getInbox(filter: 'inbox' | 'participated' | 'initiated' = 'inbox'): Observable<TaskInboxItem[]> {
    return this.http.get<TaskInboxItem[]>(`${this.gatewayBaseUrl}/tasks/inbox?filter=${filter}`);
  }

  getTemplates(): Observable<WorkflowTemplate[]> {
    return this.http.get<WorkflowTemplate[]>(`${this.templateBaseUrl}/templates`);
  }

  getTemplate(templateKey: string): Observable<WorkflowTemplate> {
    return this.http.get<WorkflowTemplate>(`${this.templateBaseUrl}/templates/${templateKey}`);
  }

  createWorkflow(templateId: string, title: string): Observable<WorkflowResponse> {
    return this.http.post<WorkflowResponse>(`${this.gatewayBaseUrl}/workflows`, {
      templateId,
      title
    });
  }

  transitionWorkflow(workflowId: string, request: WorkflowTransitionRequest): Observable<WorkflowTransitionResponse> {
    return this.http.post<WorkflowTransitionResponse>(
      `${this.gatewayBaseUrl}/workflows/${workflowId}/transition`,
      request
    );
  }
}
