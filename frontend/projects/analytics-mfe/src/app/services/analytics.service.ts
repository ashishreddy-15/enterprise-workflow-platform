import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { WorkflowAnalyticsView, AuditLogEntry } from '../models/analytics.model';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AnalyticsService {
  private http = inject(HttpClient);
  private readonly baseUrl = `${environment.gatewayUrl}/analytics/api/v1/analytics`;

  getWorkflows(): Observable<WorkflowAnalyticsView[]> {
    return this.http.get<WorkflowAnalyticsView[]>(`${this.baseUrl}/workflows`);
  }

  getWorkflow(workflowId: string): Observable<WorkflowAnalyticsView> {
    return this.http.get<WorkflowAnalyticsView>(`${this.baseUrl}/workflows/${workflowId}`);
  }

  getAuditLogs(limit: number = 100): Observable<AuditLogEntry[]> {
    return this.http.get<AuditLogEntry[]>(`${this.baseUrl}/audit-logs?limit=${limit}`);
  }

  getWorkflowAuditLogs(workflowId: string): Observable<AuditLogEntry[]> {
    return this.http.get<AuditLogEntry[]>(`${this.baseUrl}/audit-logs/${workflowId}`);
  }
}
