# Enterprise Event-Driven Workflow Platform — Master Implementation & Roadmap TODO

## ✅ Completed Phases

### Phase 1: Architecture, Contracts & Monorepo Setup
- [x] Configure monorepo structure (`backend/`, `frontend/`, `docker/`, `docs/`, `.github/`).
- [x] Create Maven parent POM with Java 21, Spring Boot 4.1.1, Spring Cloud 2025.1.3, and Virtual Threads enabled (`spring.threads.virtual.enabled: true`).
- [x] Implement Palantir Java formatting standard with Spotless (`com.diffplug.spotless:spotless-maven-plugin:2.44.2`).
- [x] Create `common-contracts` module with immutable Java 21 records:
  - `WorkflowTransitionedEvent`: Event contract with aggregate ID, state transitions, actor ID, comments, metadata, and UTC timestamp.
  - `WorkflowSlaBreachedEvent`: SLA alert event with due/breached timestamps.
  - `TemplateDefinitionResponse`: Dynamic step DAG contract shared between services.

---

### Phase 2: Core Infrastructure & Backing Stores
- [x] PostgreSQL 16: ACID transactional state store with persistent Docker volume.
- [x] MongoDB 7.0: Dynamic JSON schema form store and append-only immutable audit log store.
- [x] Apache Kafka 3.8 (KRaft Mode): Distributed event bus without Zookeeper metadata overhead, configured with dual listeners (internal container network and host port 9092).
- [x] Redis 7.2: Ultra-low latency distributed caching and rate-limiting store with AOF persistence.
- [x] Multi-stage container builds: Lightweight JRE Alpine runtime with unprivileged user `appuser:appgroup` and container-aware JVM flags.

---

### Phase 3: Workflow Engine & PostgreSQL Layer
- [x] Flyway Schema Migrations (`V1` through `V6`):
  - `workflow_instances`: Relational aggregate with optimistic locking (`@Version Long version`), frozen template snapshot (`JSONB`), context data (`JSONB`), and partial index for SLA tracking.
  - `workflow_tasks`: Step tasks with step order, task type, assigned role, completed by, status, and comments.
  - `outbox_events`: Transactional outbox table with aggregate ID, event type, payload (`JSONB`), status (`PENDING`, `PUBLISHED`, `FAILED`), and retry counter.
- [x] Dynamic Criteria Search (`WorkflowSpecifications`): Type-safe composable predicates for state, priority, and requester ID filtering using Spring Data JPA Specifications.
- [x] Concurrency Control:
  - Optimistic locking (`@Version`) protecting against concurrent step execution with HTTP `409 Conflict` mapping.
  - Pessimistic write locking (`FOR UPDATE SKIP LOCKED`) for background outbox polling and SLA evaluation.

---

### Phase 4: Transactional Outbox Pattern & Event Streaming
- [x] Dual-write hazard elimination: State transitions and outbox events written atomically within the same database transaction boundary (`@Transactional`).
- [x] Outbox Poller Worker (`OutboxScheduler`):
  - Scheduled background thread (`fixedDelay = 2000ms`) fetching locked batches of up to 50 pending events.
  - Asynchronous publishing to Kafka topic `workflow-events` with timeout enforcement.
  - Atomic status transition to `PUBLISHED` upon broker acknowledgment.
  - Exponential retry tracking with quarantine to `FAILED` after 3 failed attempts.
- [x] Admin Outbox Management: REST endpoints for bulk re-queuing and individual event replay.

---

### Phase 5: Template Service & Dynamic MongoDB Schemas
- [x] Spring Data MongoDB schema model (`WorkflowTemplateDocument` in collection `workflow_templates`).
- [x] Compound unique index on `{templateKey: 1, version: 1}` preventing duplicate versions.
- [x] Lifecycle state transitions:
  - `DRAFT`: Authoring state allowing incremental updates to step definitions, transitions, and form schemas.
  - `PUBLISHED`: Immutable production state frozen for new workflow instantiations.
  - `ARCHIVED`: Deprecated template state.
- [x] Direct RestClient integration: `workflow-service` fetches the active published blueprint synchronously and freezes it into the workflow instance upon creation.

---

### Phase 6: Audit Analytics Service, CQRS & Resilient Kafka Consumer
- [x] Idempotent Kafka Consumer: Processes `WorkflowTransitionedEvent` using `eventId` as the MongoDB document primary key, discarding duplicates from at-least-once deliveries.
- [x] Non-Blocking Retry Architecture (`@RetryableTopic`):
  - Failed messages route to `workflow-events-retry-1000` (1s delay), then `workflow-events-retry-2000` (2s delay).
  - Terminal failures route to Dead-Letter Topic `workflow-events-dlt` captured by `@DltHandler` for operational alerting.
- [x] CQRS Materialized Views (`WorkflowAnalyticsView`):
  - Pre-computed, denormalized read model in collection `workflow_analytics_views`.
  - Aggregates transition counts, latest actor, current state, and chronological step timeline.
  - High-performance REST endpoints for audit trail inspection and SLA compliance calculation.

---

### Phase 7: API Gateway, BFF Security & Sliding Session Window
- [x] Spring Cloud Gateway (Reactive Netty WebFlux) reverse proxy routing:
  - `/templates/**` $\rightarrow$ `template-service:8083`
  - `/workflows/**` $\rightarrow$ `workflow-service:8081`
  - `/analytics/**` $\rightarrow$ `audit-analytics-service:8082`
- [x] Backend-For-Frontend (BFF) Security Architecture:
  - Zero token storage in browser `localStorage` or `sessionStorage`.
  - Signed HMAC-SHA256 JWT issued in an `HttpOnly`, `SameSite=Lax`, `Path=/` cookie named `ewp_access_token`.
  - Dual-mode authentication: extracts from `HttpOnly` cookie for SPAs or `Authorization: Bearer` for API clients.
- [x] Sliding Session Window Management (`SlidingSessionWebFilter`):
  - 60-minute idle inactivity timeout.
  - 8-hour absolute maximum session lifespan ceiling.
  - Proactive sliding renewal: re-mints and attaches refreshed cookie when $\le$ 15 minutes remain on the idle window.
- [x] Anti-Spoofing Identity Assertion (`AuthenticationHeaderFilter`):
  - Strips incoming client-supplied `X-User-Id` and `X-User-Roles` headers.
  - Injects verified claims from validated JWT downstream to microservices.
- [x] Interactive Scalar API Console: Embedded API explorer at `/scalar` and `/v3/api-docs`.

---

### Phase 8: Keycloak 26 OIDC & Microsoft Entra ID (Azure AD) SSO
- [x] Keycloak 26 container integrated into Docker Compose topology on port `8085`.
- [x] Realm definition (`keycloak-realm.json`) with pre-configured client `ewp-gateway`, protocol mappers, and role bindings.
- [x] Custom Keycloak Enterprise Login Theme (`ewp-theme`):
  - Clean zinc-900 / minimalist design system matching the Angular platform.
  - Responsive PatternFly v5 card container with Inter typography.
- [x] Microsoft Entra ID (Azure AD) OIDC Federation:
  - Azure App Registration integration with discovery, authorization, token, and userinfo endpoints.
  - Gateway `OAuth2AuthenticationSuccessHandler` mapping external OIDC claims into platform session cookies.
- [x] Standardized Role Matrix (`ROLE_ADMIN`, `ROLE_EMPLOYEE`, `ROLE_LEGAL_COUNSEL`, `ROLE_FINANCE_DIRECTOR`).

---

### Phase 9: Angular 22 Native Federation Micro-Frontends
- [x] Four independent applications orchestrated via `@angular-architects/native-federation`:
  - `shell` (Host container, Port 4200 / Port 80)
  - `workflow-mfe` (Task Inbox, step timeline, workflow execution, Port 4201)
  - `analytics-mfe` (SLA compliance dashboard, chronological audit log, Port 4202)
  - `template-mfe` (Visual dynamic form template designer, Port 4203)
- [x] Centralized Design System (`ewp-theme.css`):
  - Semantic CSS utility classes (`.ewp-card`, `.ewp-btn`, `.ewp-badge`, `.ewp-input`).
  - Tailwind v4 `@theme` design tokens.
- [x] Cross-MFE State Synchronization (`AuthBridge`):
  - Zero-dependency `BroadcastChannel` with `localStorage` fallback propagating active persona across all remotes.
- [x] Unified Nginx Ingress: Multi-port virtual host with unified port 80 proxying.

---

### Phase 10: CI/CD & DevSecOps Automation
- [x] GitHub Actions Path-Filtered Matrix CI (`.github/workflows/ci.yml`):
  - Selective execution using `dorny/paths-filter`.
  - Java 21 compilation and Palantir Spotless formatting verification (`mvn spotless:check`).
  - Node 22 build compiling all 4 Micro-Frontends.
- [x] DevSecOps Vulnerability Scanners (`.github/workflows/security.yml`):
  - Gitleaks automated commit secret scanner with `.gitleaks.toml` allowlist.
  - Aqua Trivy filesystem vulnerability scanner for CRITICAL and HIGH CVEs.
- [x] Automated OCI Container Factory (`.github/workflows/docker-publish.yml`):
  - Parallel matrix building 5 Docker images with BuildKit layer caching.
  - Automated publishing to GitHub Container Registry (`ghcr.io`) with `latest` and `sha-<commit>` tags.

---

### Phase 11: Observability, Metrics & Distributed Tracing
- [x] Prometheus Metrics (`:9090`): Fine-grained 5-second scraping of `/actuator/prometheus` across all microservices.
- [x] Pre-Provisioned Grafana Dashboards (`:3000`):
  - JVM Virtual Thread and heap utilization metrics.
  - HTTP p95 and p99 request latency by application.
  - HTTP 4xx / 5xx error rates and request throughput.
- [x] Distributed Tracing with OpenTelemetry & Jaeger (`:16686`):
  - Spring Boot `spring-boot-starter-opentelemetry` integration.
  - OTLP HTTP span exporter pushing traces to `http://jaeger:4318/v1/traces`.
  - W3C `traceparent` context propagation across WebFlux reactive gateway, Spring MVC downstream, and Kafka record headers.
  - MDC log correlation matching logs directly to trace and span IDs (`[%5p [service,traceId,spanId]]`).

---

## 🚀 Future Roadmap & Planned Enhancements

### Phase 12: Automated Testing Suite & Quality Gates
- [ ] **Testcontainers Integration Tests**:
  - Spin up real PostgreSQL 16, MongoDB 7, and Kafka KRaft containers in JUnit 5.
  - End-to-end integration tests for `WorkflowService.transitionWorkflow()` and outbox publishing.
  - Contract testing for REST endpoints.
- [ ] **End-to-End Browser Tests (Playwright / Cypress)**:
  - Automated UI tests logging in, authoring templates, initiating workflows, and verifying approvals across MFEs.
- [ ] **Performance & Load Benchmarks (k6 / Gatling)**:
  - Benchmark outbox poller throughput and database concurrency under 1,000+ RPS.

### Phase 13: Advanced Workflow Engine Features
- [ ] **SLA Auto-Escalation Engine**:
  - Background scheduler executing transition actions automatically when an approval task expires past its SLA deadline.
- [ ] **Dynamic Conditional Branching (Rules Engine)**:
  - Spring Expression Language (SpEL) predicate evaluation on form payloads (e.g. `amount > 10000` routes to VP; else routes to Manager).
- [ ] **Parallel / Multi-Party Approvals (Fork-Join)**:
  - Steps requiring concurrent approval from multiple roles before advancing.

### Phase 14: Cloud-Native Kubernetes & GitOps
- [ ] **Helm Charts & Kubernetes Manifests**:
  - Deployments, Services, ConfigMaps, Secrets, and PersistentVolumeClaims for all microservices.
- [ ] **Ingress Controller & TLS**:
  - NGINX Ingress Controller / Traefik with Cert-Manager for automated Let's Encrypt certificates.
- [ ] **GitOps with ArgoCD**:
  - Declarative continuous deployment syncing GitHub commits directly to a live Kubernetes cluster.
