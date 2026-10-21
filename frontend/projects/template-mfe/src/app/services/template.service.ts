import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { WorkflowTemplate } from '../models/template.model';

@Injectable({
  providedIn: 'root'
})
export class TemplateService {
  private http = inject(HttpClient);
  private readonly baseUrl = 'http://localhost:8080/templates/api/v1/templates';

  private getAuthHeaders(): HttpHeaders {
    const token = localStorage.getItem('ewp_auth_token');
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  getTemplates(status: string = 'ALL'): Observable<WorkflowTemplate[]> {
    return this.http.get<WorkflowTemplate[]>(`${this.baseUrl}?status=${status}`, {
      headers: this.getAuthHeaders()
    });
  }

  getTemplate(key: string, publishedOnly: boolean = false): Observable<WorkflowTemplate> {
    return this.http.get<WorkflowTemplate>(`${this.baseUrl}/${key}?publishedOnly=${publishedOnly}`, {
      headers: this.getAuthHeaders()
    });
  }

  getTemplateVersions(key: string): Observable<WorkflowTemplate[]> {
    return this.http.get<WorkflowTemplate[]>(`${this.baseUrl}/${key}/versions`, {
      headers: this.getAuthHeaders()
    });
  }

  createDraft(doc: Partial<WorkflowTemplate>): Observable<WorkflowTemplate> {
    return this.http.post<WorkflowTemplate>(this.baseUrl, doc, {
      headers: this.getAuthHeaders()
    });
  }

  updateDraft(key: string, version: number, doc: Partial<WorkflowTemplate>): Observable<WorkflowTemplate> {
    return this.http.put<WorkflowTemplate>(`${this.baseUrl}/${key}/versions/${version}`, doc, {
      headers: this.getAuthHeaders()
    });
  }

  publishTemplate(key: string, version: number): Observable<WorkflowTemplate> {
    return this.http.put<WorkflowTemplate>(`${this.baseUrl}/${key}/versions/${version}/publish`, {}, {
      headers: this.getAuthHeaders()
    });
  }
}
