import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { WorkflowAnalyticsView, AuditLogEntry } from '../models/analytics.model';

@Injectable({
  providedIn: 'root'
})
export class AnalyticsService {
  private http = inject(HttpClient);
  private readonly baseUrl = 'http://localhost:8080/analytics/api/v1/analytics';

  private getAuthHeaders(): HttpHeaders {
    const token = localStorage.getItem('ewp_auth_token');
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  getWorkflows(): Observable<WorkflowAnalyticsView[]> {
    return this.http.get<WorkflowAnalyticsView[]>(`${this.baseUrl}/workflows`, {
      headers: this.getAuthHeaders()
    });
  }

  getWorkflow(workflowId: string): Observable<WorkflowAnalyticsView> {
    return this.http.get<WorkflowAnalyticsView>(`${this.baseUrl}/workflows/${workflowId}`, {
      headers: this.getAuthHeaders()
    });
  }

  getAuditLogs(limit: number = 100): Observable<AuditLogEntry[]> {
    return this.http.get<AuditLogEntry[]>(`${this.baseUrl}/audit-logs?limit=${limit}`, {
      headers: this.getAuthHeaders()
    });
  }

  getWorkflowAuditLogs(workflowId: string): Observable<AuditLogEntry[]> {
    return this.http.get<AuditLogEntry[]>(`${this.baseUrl}/audit-logs/${workflowId}`, {
      headers: this.getAuthHeaders()
    });
  }
}
