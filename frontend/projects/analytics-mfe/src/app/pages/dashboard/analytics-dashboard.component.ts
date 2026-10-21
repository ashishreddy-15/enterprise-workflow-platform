import { Component, OnInit, OnDestroy, HostListener, inject, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AnalyticsService } from '../../services/analytics.service';
import { WorkflowAnalyticsView, AuditLogEntry, AnalyticsKpiSummary } from '../../models/analytics.model';
import { onPersonaChanged } from '../../utils/auth-bridge.util';

@Component({
  selector: 'app-analytics-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  templateUrl: './analytics-dashboard.component.html',
  styleUrls: ['./analytics-dashboard.component.css']
})
export class AnalyticsDashboardComponent implements OnInit, OnDestroy {
  private analyticsService = inject(AnalyticsService);

  readonly workflows = signal<WorkflowAnalyticsView[]>([]);
  readonly auditLogs = signal<AuditLogEntry[]>([]);
  readonly isLoading = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);

  // Filters & Tabs
  readonly searchQuery = signal<string>('');
  readonly selectedTemplate = signal<string>('ALL');
  readonly activeTab = signal<'ledger' | 'overview'>('ledger');

  // Inspector Drawer
  readonly selectedWorkflow = signal<WorkflowAnalyticsView | null>(null);
  readonly selectedWorkflowAuditLogs = signal<AuditLogEntry[]>([]);
  readonly isLoadingWorkflowAudit = signal<boolean>(false);

  private destroyPersonaBridge?: () => void;

  // Computed KPIs
  readonly kpis = computed<AnalyticsKpiSummary>(() => {
    const wfList = this.workflows();
    const logs = this.auditLogs();
    const total = wfList.length;

    const terminalStates = ['APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED', 'TERMINATED', 'CLOSED'];
    const terminalCount = wfList.filter(w => terminalStates.includes(w.currentState?.toUpperCase())).length;
    const inFlightCount = total - terminalCount;

    const totalTransitions = wfList.reduce((sum, w) => sum + (w.transitionCount || 0), 0);
    const avgTransitionVelocity = total > 0 ? parseFloat((totalTransitions / total).toFixed(1)) : 0;

    return {
      totalWorkflows: total,
      totalEventsLogged: logs.length,
      terminalCount,
      inFlightCount,
      avgTransitionVelocity
    };
  });

  // Unique templates for dropdown filter
  readonly templateOptions = computed<string[]>(() => {
    const set = new Set<string>();
    for (const w of this.workflows()) {
      if (w.templateId) set.add(w.templateId);
    }
    for (const l of this.auditLogs()) {
      if (l.templateId) set.add(l.templateId);
    }
    return Array.from(set).sort();
  });

  // State distribution breakdown
  readonly stateDistribution = computed<{ state: string; count: number; percentage: number }[]>(() => {
    const list = this.workflows();
    if (list.length === 0) return [];

    const counts: Record<string, number> = {};
    for (const w of list) {
      const s = w.currentState || 'UNKNOWN';
      counts[s] = (counts[s] || 0) + 1;
    }

    return Object.entries(counts)
      .map(([state, count]) => ({
        state,
        count,
        percentage: Math.round((count / list.length) * 100)
      }))
      .sort((a, b) => b.count - a.count);
  });

  // Filtered Audit Logs
  readonly filteredAuditLogs = computed<AuditLogEntry[]>(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const template = this.selectedTemplate();

    return this.auditLogs().filter(log => {
      if (template !== 'ALL' && log.templateId !== template) {
        return false;
      }
      if (!query) return true;

      return (
        (log.workflowId && log.workflowId.toLowerCase().includes(query)) ||
        (log.eventId && log.eventId.toLowerCase().includes(query)) ||
        (log.actorId && log.actorId.toLowerCase().includes(query)) ||
        (log.previousState && log.previousState.toLowerCase().includes(query)) ||
        (log.newState && log.newState.toLowerCase().includes(query)) ||
        (log.templateId && log.templateId.toLowerCase().includes(query))
      );
    });
  });

  // Filtered Workflow Projections
  readonly filteredWorkflows = computed<WorkflowAnalyticsView[]>(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const template = this.selectedTemplate();

    return this.workflows().filter(wf => {
      if (template !== 'ALL' && wf.templateId !== template) {
        return false;
      }
      if (!query) return true;

      return (
        (wf.workflowId && wf.workflowId.toLowerCase().includes(query)) ||
        (wf.templateId && wf.templateId.toLowerCase().includes(query)) ||
        (wf.currentState && wf.currentState.toLowerCase().includes(query)) ||
        (wf.lastActorId && wf.lastActorId.toLowerCase().includes(query))
      );
    });
  });

  ngOnInit(): void {
    this.loadData();
    this.destroyPersonaBridge = onPersonaChanged(() => this.loadData());
  }

  ngOnDestroy(): void {
    this.setScrollLock(false);
    this.destroyPersonaBridge?.();
  }

  @HostListener('document:keydown.escape')
  onEscapePress(): void {
    if (this.selectedWorkflow()) {
      this.closeInspector();
    }
  }

  private setScrollLock(locked: boolean): void {
    const mainEl = document.querySelector('main');
    if (locked) {
      document.body.style.overflow = 'hidden';
      if (mainEl) (mainEl as HTMLElement).style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      if (mainEl) (mainEl as HTMLElement).style.overflow = '';
    }
  }

  loadData(): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    let completedCalls = 0;
    const checkDone = () => {
      completedCalls++;
      if (completedCalls >= 2) {
        this.isLoading.set(false);
      }
    };

    this.analyticsService.getWorkflows().subscribe({
      next: (views) => {
        this.workflows.set(views || []);
        checkDone();
      },
      error: (err) => {
        console.error('Failed to load workflow analytics:', err);
        this.errorMessage.set('Could not load workflow analytics data. Please check connection.');
        checkDone();
      }
    });

    this.analyticsService.getAuditLogs(150).subscribe({
      next: (logs) => {
        this.auditLogs.set(logs || []);
        checkDone();
      },
      error: (err) => {
        console.error('Failed to load audit logs:', err);
        checkDone();
      }
    });
  }

  onSearch(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.searchQuery.set(input.value);
  }

  setTemplate(template: string): void {
    this.selectedTemplate.set(template);
  }

  setTab(tab: 'ledger' | 'overview'): void {
    this.activeTab.set(tab);
  }

  inspectWorkflow(wf: WorkflowAnalyticsView): void {
    this.selectedWorkflow.set(wf);
    this.isLoadingWorkflowAudit.set(true);
    this.selectedWorkflowAuditLogs.set([]);
    this.setScrollLock(true);

    this.analyticsService.getWorkflowAuditLogs(wf.workflowId).subscribe({
      next: (logs) => {
        this.selectedWorkflowAuditLogs.set(logs || []);
        this.isLoadingWorkflowAudit.set(false);
      },
      error: (err) => {
        console.error('Failed to load workflow audit logs:', err);
        this.isLoadingWorkflowAudit.set(false);
      }
    });
  }

  inspectWorkflowById(workflowId: string): void {
    const matched = this.workflows().find(w => w.workflowId === workflowId);
    if (matched) {
      this.inspectWorkflow(matched);
    } else {
      // Create provisional view and load its logs
      const provisional: WorkflowAnalyticsView = {
        workflowId,
        templateId: '',
        currentState: 'UNKNOWN',
        lastActorId: 'SYSTEM',
        transitionCount: 0,
        lastUpdatedAt: new Date().toISOString(),
        history: []
      };
      this.inspectWorkflow(provisional);
    }
  }

  closeInspector(): void {
    this.selectedWorkflow.set(null);
    this.selectedWorkflowAuditLogs.set([]);
    this.setScrollLock(false);
  }

  isTerminalState(state: string): boolean {
    const s = state?.toUpperCase();
    return ['APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED', 'CLOSED'].includes(s);
  }
}
