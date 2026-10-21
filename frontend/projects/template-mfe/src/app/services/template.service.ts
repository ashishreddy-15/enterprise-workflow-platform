import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { WorkflowTemplate } from '../models/template.model';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class TemplateService {
  private http = inject(HttpClient);
  private readonly baseUrl = `${environment.gatewayUrl}/templates/api/v1/templates`;

  getTemplates(status: string = 'ALL'): Observable<WorkflowTemplate[]> {
    return this.http.get<WorkflowTemplate[]>(`${this.baseUrl}?status=${status}`);
  }

  getTemplate(key: string, publishedOnly: boolean = false): Observable<WorkflowTemplate> {
    return this.http.get<WorkflowTemplate>(`${this.baseUrl}/${key}?publishedOnly=${publishedOnly}`);
  }

  getTemplateVersions(key: string): Observable<WorkflowTemplate[]> {
    return this.http.get<WorkflowTemplate[]>(`${this.baseUrl}/${key}/versions`);
  }

  createDraft(doc: Partial<WorkflowTemplate>): Observable<WorkflowTemplate> {
    return this.http.post<WorkflowTemplate>(this.baseUrl, doc);
  }

  updateDraft(key: string, version: number, doc: Partial<WorkflowTemplate>): Observable<WorkflowTemplate> {
    return this.http.put<WorkflowTemplate>(`${this.baseUrl}/${key}/versions/${version}`, doc);
  }

  publishTemplate(key: string, version: number): Observable<WorkflowTemplate> {
    return this.http.put<WorkflowTemplate>(`${this.baseUrl}/${key}/versions/${version}/publish`, {});
  }
}
