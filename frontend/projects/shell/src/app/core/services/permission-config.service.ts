import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export interface RoutePermissionConfig {
  title: string;
  requiredRoles: string[];
  suggestedPersonaId?: string;
  suggestedPersonaName?: string;
}

export interface PermissionsFileStructure {
  routes: Record<string, RoutePermissionConfig>;
}

const DEFAULT_ROUTE_PERMISSIONS: Record<string, RoutePermissionConfig> = {
  workflows: {
    title: 'Task Inbox & Approvals',
    requiredRoles: ['ROLE_EMPLOYEE', 'ROLE_MANAGER', 'ROLE_ADMIN', 'ROLE_SUBMITTER'],
    suggestedPersonaId: 'usr_ashish_01',
    suggestedPersonaName: 'Ashish Reddy'
  },
  templates: {
    title: 'Workflow Blueprints Studio',
    requiredRoles: ['ROLE_ADMIN'],
    suggestedPersonaId: 'usr_admin_system',
    suggestedPersonaName: 'Platform Administrator'
  },
  analytics: {
    title: 'Audit & Analytics Dashboard',
    requiredRoles: ['ROLE_ANALYST', 'ROLE_MANAGER', 'ROLE_ADMIN', 'ROLE_AUDITOR', 'ROLE_LEGAL_COUNSEL', 'ROLE_FINANCE_APPROVER'],
    suggestedPersonaId: 'usr_admin_system',
    suggestedPersonaName: 'Platform Administrator'
  }
};

@Injectable({
  providedIn: 'root'
})
export class PermissionConfigService {
  private http = inject(HttpClient);

  readonly routePermissions = signal<Record<string, RoutePermissionConfig>>(DEFAULT_ROUTE_PERMISSIONS);
  readonly isLoaded = signal<boolean>(false);

  constructor() {
    this.loadExternalConfig();
  }

  /**
   * Attempts to load external permissions configuration from /permissions.config.json.
   * Falls back gracefully to default enterprise policies on error.
   */
  private loadExternalConfig(): void {
    this.http.get<PermissionsFileStructure>('/permissions.config.json').subscribe({
      next: (config) => {
        if (config && config.routes) {
          const normalizedRoutes: Record<string, RoutePermissionConfig> = {};
          for (const [key, value] of Object.entries(config.routes)) {
            normalizedRoutes[key.toLowerCase()] = value;
          }
          this.routePermissions.set({ ...DEFAULT_ROUTE_PERMISSIONS, ...normalizedRoutes });
        }
        this.isLoaded.set(true);
      },
      error: () => {
        // Keep defaults if file not reachable
        this.isLoaded.set(true);
      }
    });
  }

  /**
   * Normalizes a route path and checks if the given user roles satisfy the route's permission policy.
   * If a route has no configured policy, access is permitted by default.
   */
  canAccessRoute(routePath: string, userRoles: string[]): boolean {
    const cleanPath = this.normalizeRoute(routePath);
    const policy = this.routePermissions()[cleanPath];

    if (!policy || !policy.requiredRoles || policy.requiredRoles.length === 0) {
      return true;
    }

    if (!userRoles || userRoles.length === 0) {
      return false;
    }

    // Check if user has ANY of the permitted roles (OR logic for role access)
    return policy.requiredRoles.some(requiredRole => userRoles.includes(requiredRole));
  }

  getRouteConfig(routePath: string): RoutePermissionConfig | undefined {
    const cleanPath = this.normalizeRoute(routePath);
    return this.routePermissions()[cleanPath];
  }

  private normalizeRoute(routePath: string): string {
    return routePath.replace(/^\//, '').split('/')[0].toLowerCase();
  }
}
