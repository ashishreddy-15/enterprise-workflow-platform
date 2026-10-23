# Architecture Guide — Enterprise Event-Driven Workflow Platform

## 1. Executive Architecture Summary

The **Enterprise Event-Driven Workflow Platform (EWP)** is a cloud-native, distributed microservices system designed for high-concurrency business process automation, multi-tier approvals, dynamic form authoring, and immutable audit trails.

The platform is built on modern industry standards:
- **Runtime**: **Java 21 (Virtual Threads / Project Loom)** for high-throughput, non-blocking I/O.
- **Framework**: **Spring Boot 4.1.1** & **Spring Cloud 2025.1.3**.
- **Frontend**: **Angular 22** running **Zoneless change detection** with **Native Federation** Micro-Frontends.
- **Identity & Access**: **Keycloak 26.1 OIDC** federated with **Microsoft Entra ID (Azure AD)** and **Backend-For-Frontend (BFF)** `HttpOnly` cookie sessions.
- **Messaging**: **Apache Kafka 3.8 in KRaft mode** (no Zookeeper) with transactional outbox publishing and non-blocking multi-topic retries.
- **Persistence**: **Polyglot storage** (PostgreSQL 16 for ACID state, MongoDB 7.0 for flexible schemas and audit logs, Redis 7.2 for distributed caching).
- **Observability**: **Prometheus 2.51**, **Grafana 10.4.1**, and **OpenTelemetry (OTel)** distributed tracing with **Jaeger 1.56**.

---

## 2. High-Level System Architecture (C4 Container Diagram)

```mermaid
flowchart TD
    subgraph ClientLayer ["Client & Edge Ingress Layer"]
        Browser["Enterprise Browser<br/>(Desktop / Mobile)"]
        Nginx["Nginx Reverse Proxy (:80 / :4200-:4203)<br/>Multi-Virtual Host MFE Container"]
    end

    subgraph SecurityBoundary ["Identity & Security Boundary"]
        Keycloak["Keycloak 26.1 OIDC IdP (:8085)<br/>Custom zinc-900 'ewp' Theme"]
        EntraID["Microsoft Entra ID (Azure AD)<br/>Cloud Identity Provider"]
    end

    subgraph GatewayLayer ["API Gateway & BFF (:8080)"]
        Gateway["Spring Cloud Gateway (WebFlux / Netty)<br/>BFF Cookie Management & Anti-Spoofing"]
        Scalar["Scalar API Explorer (:8080/scalar)<br/>Interactive OpenAPI 3.1 Aggregator"]
    end

    subgraph CoreServices ["Core Application Microservices (Java 21 Virtual Threads)"]
        TemplateSvc["Template Service (:8083)<br/>Spring Data MongoDB"]
        WorkflowSvc["Workflow Engine (:8081)<br/>Spring Data JPA + Outbox Poller"]
        AuditSvc["Audit & Analytics (:8082)<br/>Idempotent Kafka Consumer + CQRS"]
    end

    subgraph Messaging ["Distributed Event Bus"]
        Kafka["Apache Kafka 3.8 (KRaft)<br/>Topics: workflow-events, -retry-1000, -retry-2000, -dlt"]
    end

    subgraph Storage ["Polyglot Persistence Layer"]
        PG[("PostgreSQL 16 (:5432)<br/>workflow_db (ACID State & Outbox)")]
        Mongo[("MongoDB 7.0 (:27017)<br/>template_db & audit_db")]
        Redis[("Redis 7.2 (:6379)<br/>Distributed Session Cache & Rate Limiting")]
    end

    subgraph Observability ["Observability & Telemetry"]
        Prometheus["Prometheus 2.51 (:9090)<br/>5s Scrape Interval"]
        Grafana["Grafana 10.4.1 (:3000)<br/>Pre-Provisioned Dashboards"]
        Jaeger["Jaeger All-in-One 1.56 (:16686 / :4318)<br/>OTLP Distributed Tracing"]
    end

    Browser -->|HTTP / REST| Nginx
    Nginx -->|Route API Requests| Gateway
    Gateway -->|OAuth2 / OIDC Code Flow| Keycloak
    Keycloak -.->|OIDC Federation| EntraID

    Gateway -->|/templates/**| TemplateSvc
    Gateway -->|/workflows/**| WorkflowSvc
    Gateway -->|/analytics/**| AuditSvc
    Gateway --> Redis

    WorkflowSvc --> PG
    WorkflowSvc -->|Sync RestClient Snapshot| TemplateSvc
    TemplateSvc --> Mongo
    AuditSvc --> Mongo

    WorkflowSvc -->|Transactional Outbox Poller| Kafka
    Kafka -->|Non-blocking Consumer| AuditSvc

    Gateway -.->|OTLP Spans :4318| Jaeger
    WorkflowSvc -.->|OTLP Spans :4318| Jaeger
    TemplateSvc -.->|OTLP Spans :4318| Jaeger
    AuditSvc -.->|OTLP Spans :4318| Jaeger

    Prometheus -.->|Scrape /actuator/prometheus| Gateway
    Prometheus -.->|Scrape /actuator/prometheus| WorkflowSvc
    Prometheus -.->|Scrape /actuator/prometheus| TemplateSvc
    Prometheus -.->|Scrape /actuator/prometheus| AuditSvc

    Grafana --> Prometheus
    Grafana --> Jaeger
```

---

## 3. Micro-Frontend Architecture (Native Federation)

The client is divided into independent Micro-Frontends (MFEs) running **Angular 22** with **Native Federation** (`@angular-architects/native-federation`), avoiding Webpack and Module Federation runtime bloat by leveraging native browser ES Modules and `importmap`.

```
frontend/
├── projects/
│   ├── shared-theme/         ← Single Source of Truth: ewp-theme.css & Tailwind @theme tokens
│   ├── shell/                ← Host Container & Persona Navigator (Port 4200 / 80)
│   ├── workflow-mfe/         ← Remote: Task Inbox, approvals, stepper, execution modal (Port 4201)
│   ├── analytics-mfe/        ← Remote: SLA monitoring, bottleneck breakdown, audit ledger (Port 4202)
│   └── template-mfe/         ← Remote: Visual workflow & form designer, DAG validation (Port 4203)
```

### 3.1 Key Architectural Principles:
1. **Zoneless Change Detection**: All 4 MFEs use `provideZonelessChangeDetection()`, eliminating `zone.js` monkey-patching and achieving high rendering performance via Angular Signals.
2. **Dynamic Runtime Manifest**: The Shell initializes via `initFederation('federation.manifest.json')`, dynamically resolving remote entry points at runtime without rebuilding the host.
3. **Resilient Error Boundaries**: If a remote MFE is unreachable, `MfeFallbackComponent` captures the failure gracefully and displays an inline recovery banner rather than crashing the Shell.
4. **Cross-MFE State Synchronization (`AuthBridge`)**:
   - Zero-dependency event bus using standard `window.dispatchEvent(new CustomEvent('ewp:persona-changed'))` with `localStorage` fallback.
   - Persona switching in the Shell header propagates instantaneously across all mounted MFEs without page refreshes.
5. **Unified Design System (`ewp-theme.css`)**:
   - Built on Tailwind CSS v4 `@theme` design tokens.
   - Centralizes semantic class utilities (`.ewp-card`, `.ewp-btn`, `.ewp-badge`, `.ewp-input`, `.ewp-page-title`).

```mermaid
sequenceDiagram
    autonumber
    actor User as Corporate User
    participant Shell as Shell Host (:4200)
    participant Bridge as AuthBridge
    participant Workflow as Workflow MFE (:4201)
    participant Analytics as Analytics MFE (:4202)

    User->>Shell: Select Persona (e.g. 'Sarah Manager')
    Shell->>Bridge: dispatchPersonaChanged({ persona: { id, roles } })
    Bridge->>window: dispatchEvent('ewp:persona-changed')
    
    par Instant Reactive Sync
        window-->>Workflow: onPersonaChanged() listener triggers
        Workflow->>Workflow: activeUser.set(newPersona)
        Workflow->>Workflow: Reload Task Inbox matching ROLE_MANAGER
    and
        window-->>Analytics: onPersonaChanged() listener triggers
        Analytics->>Analytics: activeUser.set(newPersona)
        Analytics->>Analytics: Refresh SLA Compliance Dashboard
    end
```

---

## 4. Polyglot Persistence & Data Modeling

The platform isolates domain data stores to match their operational characteristics:

```mermaid
erDiagram
    workflow_instances ||--o{ workflow_tasks : "contains"
    workflow_instances ||--o{ outbox_events : "generates"

    workflow_instances {
        UUID id PK
        VARCHAR template_id
        INT template_version
        VARCHAR requester_id
        VARCHAR title
        VARCHAR current_state
        VARCHAR priority
        BIGINT version "Optimistic Locking @Version"
        JSONB template_snapshot "Frozen blueprint copy"
        JSONB context_data "Accumulated step inputs"
        TIMESTAMPTZ current_step_due_at "Step deadline"
        BOOLEAN sla_breached "SLA breach flag"
        TIMESTAMPTZ created_at
        TIMESTAMPTZ updated_at
    }

    workflow_tasks {
        UUID id PK
        UUID workflow_id FK
        INT step_order
        VARCHAR step_name
        VARCHAR task_type
        VARCHAR assigned_role "Nullable for requester tasks"
        VARCHAR completed_by "Actor who executed step"
        VARCHAR status "PENDING, COMPLETED, REJECTED"
        TEXT comments
        TIMESTAMPTZ acted_at
    }

    outbox_events {
        UUID id PK
        VARCHAR aggregate_type "WORKFLOW"
        VARCHAR aggregate_id "workflowId (UUID)"
        VARCHAR event_type "WorkflowTransitionedEvent"
        JSONB payload
        VARCHAR status "PENDING, PUBLISHED, FAILED"
        INT retry_count
        TIMESTAMPTZ created_at
        TIMESTAMPTZ processed_at
    }

    workflow_templates {
        String id PK "_id"
        String templateKey "Indexed"
        int version "Compound Unique Index"
        String name
        String description
        String status "'DRAFT' or 'PUBLISHED'"
        String initialState
        Map steps "Step DAG definition map"
    }

    audit_logs {
        String eventId PK "_id (Idempotency Key)"
        UUID workflowId "Indexed"
        String templateId
        String previousState
        String newState
        String actorId
        Instant occurredAt
        Instant processedAt
    }

    workflow_analytics_views {
        String workflowId PK "_id"
        String templateId "Indexed"
        String currentState "Indexed"
        int transitionCount
        String lastActorId
        Instant lastUpdatedAt
        List history "Chronological steps array"
    }
```

### 4.1 Storage Selection Matrix

| Domain Store | Technology | Storage Schema | Justification |
|---|---|---|---|
| **Workflow State** | PostgreSQL 16 | Relational Tables (`workflow_instances`, `workflow_tasks`) | ACID compliance, multi-user concurrency control, optimistic locking (`@Version`), and complex relational filtering. |
| **Outbox Events** | PostgreSQL 16 | Relational Table (`outbox_events`) | Enables atomic database transactions combining state updates and event emission in a single commit. |
| **Workflow Templates** | MongoDB 7.0 | Document Collection (`workflow_templates`) | Schema-less flexibility for authoring arbitrary step graphs, form input schemas, and transition rules with compound uniqueness on `{templateKey, version}`. |
| **Audit Logs** | MongoDB 7.0 | Document Collection (`audit_logs`) | High-volume append-only audit trail with `eventId` serving as the immutable idempotency key. |
| **CQRS Read Views** | MongoDB 7.0 | Document Collection (`workflow_analytics_views`) | Denormalized, pre-joined read model optimized for instantaneous dashboard queries without expensive SQL joins. |
| **Distributed Cache** | Redis 7.2 | In-Memory Key-Value | Microsecond session token validation, sliding window expiration, and rate-limiting buckets. |

---

## 5. Event-Driven Architecture & Transactional Outbox Pattern

Simultaneously updating a database and publishing to an event broker creates a **Dual-Write Hazard**: if the broker is unreachable, the database commits while the event is lost; if the broker succeeds but the database fails, ghost events circulate.

The **Transactional Outbox Pattern** eliminates this failure mode:

```mermaid
sequenceDiagram
    autonumber
    actor Approver as Manager / Approver
    participant Gateway as API Gateway
    participant WfSvc as Workflow Service
    participant PG as PostgreSQL (workflow_db)
    participant Poller as OutboxScheduler
    participant Kafka as Apache Kafka Broker
    participant AuditSvc as Audit Analytics Service
    participant Mongo as MongoDB (audit_db)

    Approver->>Gateway: POST /workflows/api/v1/workflows/{id}/transition
    Gateway->>WfSvc: Forward with X-User-Id, X-User-Roles
    
    rect rgb(240, 248, 255)
        Note over WfSvc,PG: Single Database Transaction Boundary (@Transactional)
        WfSvc->>PG: UPDATE workflow_instances (state, version++)
        WfSvc->>PG: UPDATE workflow_tasks (status=COMPLETED, completed_by=actor)
        WfSvc->>PG: INSERT workflow_tasks (next pending step)
        WfSvc->>PG: INSERT outbox_events (status='PENDING', payload=JSON)
        PG-->>WfSvc: Transaction Committed Atomically
    end
    WfSvc-->>Gateway: 200 OK (WorkflowResponse)
    Gateway-->>Approver: 200 OK

    rect rgb(255, 250, 240)
        Note over Poller,Kafka: Async Relay Poller (@Scheduled fixedDelay=2000)
        Poller->>PG: SELECT * FROM outbox_events WHERE status='PENDING' FOR UPDATE SKIP LOCKED
        PG-->>Poller: Batch of up to 50 OutboxEvent entities
        loop For each event
            Poller->>Kafka: send("workflow-events", aggregateId, payload).get(5s)
            alt Kafka ACK Received
                Poller->>PG: UPDATE outbox_events SET status='PUBLISHED', processed_at=now
            else Broker Timeout / Error
                Poller->>PG: UPDATE outbox_events SET retry_count=retry_count+1, status=(retry>=3 ? 'FAILED' : 'PENDING')
            end
        end
    end

    rect rgb(245, 255, 245)
        Note over Kafka,Mongo: Asynchronous Idempotent Consumer
        Kafka->>AuditSvc: Deliver record from 'workflow-events'
        AuditSvc->>Mongo: Check if audit_logs.existsById(eventId)
        alt New Event
            AuditSvc->>Mongo: INSERT audit_logs (eventId, workflowId, states...)
            AuditSvc->>Mongo: UPSERT workflow_analytics_views (increment counter, append history)
        else Duplicate Event
            AuditSvc->>AuditSvc: Discard duplicate safely (Idempotent ACK)
        end
    end
```

### 5.1 Kafka Non-Blocking Multi-Topic Retry & DLT Strategy

Transient database or network errors in consumers must not block the entire partition. The platform implements Spring Kafka's `@RetryableTopic`:

```mermaid
flowchart LR
    Main["Topic: workflow-events"] -->|"Attempt 1 Fails"| Retry1["Topic: workflow-events-retry-1000<br/>(1,000ms Backoff)"]
    Retry1 -->|"Attempt 2 Fails"| Retry2["Topic: workflow-events-retry-2000<br/>(2,000ms Backoff)"]
    Retry2 -->|"Attempt 3 Fails"| DLT["Topic: workflow-events-dlt<br/>(Dead-Letter Topic)"]
    DLT --> Handler["@DltHandler<br/>Alerts Ops & Quarantines Payload"]
```

---

## 6. Observability & Distributed Tracing Architecture

The platform implements unified telemetry across metrics, logs, and distributed tracing.

```mermaid
sequenceDiagram
    autonumber
    participant Browser
    participant Gateway as API Gateway (Netty WebFlux :8080)
    participant Workflow as Workflow Service (Spring MVC :8081)
    participant Kafka as Apache Kafka Broker (:9092)
    participant Audit as Audit Analytics Service (:8082)
    participant Jaeger as Jaeger OTLP Collector (:4318)

    Browser->>Gateway: POST /workflows/api/v1/workflows
    Note over Gateway: Injects W3C TraceContext:<br/>traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
    Gateway->>Workflow: Forward HTTP Request with traceparent header
    Workflow->>Jaeger: Export Span: HTTP POST /workflows
    Workflow->>Kafka: Publish Outbox Event<br/>[Headers: traceparent, b3]
    Kafka->>Audit: Consume Message
    Note over Audit: Spring Kafka extracts traceparent from headers
    Audit->>Audit: Process CQRS update
    Audit->>Jaeger: Export Span: Kafka Consumer Process
    Gateway->>Jaeger: Export Span: Gateway Proxy Route
```

### 6.1 Telemetry Components:
1. **OpenTelemetry SDK & Micrometer Tracing**:
   - Integrated via `spring-boot-starter-opentelemetry`.
   - Exports spans via HTTP Protobuf to `http://jaeger:4318/v1/traces`.
   - Context propagation carries across reactive Netty boundaries (`Hooks.enableAutomaticContextPropagation()`) and asynchronous Kafka message headers.
2. **Jaeger All-in-One (`:16686`)**:
   - Visualizes end-to-end waterfall request spans correlating HTTP Gateway requests, database queries, outbox polling, and Kafka consumer processing under a single unified `traceId`.
3. **Prometheus Scraping (`:9090`)**:
   - Scrapes `/actuator/prometheus` across all microservices at 5-second intervals.
   - Monitors JVM Virtual Threads, GC pauses, HTTP throughput, and latency percentiles (p95/p99).
4. **Grafana Dashboards (`:3000`)**:
   - Pre-provisioned telemetry dashboards (`Platform Overview`) querying Prometheus and Jaeger datasources automatically upon startup.

---

## 7. Advanced Workflow Orchestration Engine

Beyond linear deterministic transitions, the platform supports enterprise-grade workflow orchestration:

### 7.1 Dynamic Conditional Branching (Rules Engine)

Workflows can route dynamically at runtime based on form payloads and context data using **Spring Expression Language (SpEL)**:

- **Sandboxed Evaluation Context**: Uses `SimpleEvaluationContext.forPropertyAccessors(DataBindingPropertyAccessor.forReadOnlyAccess(), new MapAccessor())`.
  - Disables method execution, Java class reflection, and OS process spawning (`ProcessBuilder`, `Runtime`).
  - Restricts operations exclusively to read-only property inspection and dictionary lookups.
- **Flexible Syntax**:
  - `#amount > 10000` or `amount > 10000`
  - `#payload['department'] == 'FINANCE'`
  - `#urgent == true && #amount > 50000`
- **Priority Evaluation & Determinism**:
  - Conditional rules are evaluated in ascending order of `priority`.
  - First matching condition determines the target state.
  - If no conditional rule matches, the engine falls back gracefully to the step's static `transitions` map.

### 7.2 Parallel / Multi-Party Approvals (Fork-Join)

Enterprise governance often demands dual or multi-sign-off steps (e.g., both Legal Counsel and Finance Director must sign off on a contract before onboarding):

```mermaid
flowchart TD
    Init["Step 1: Request Submitted"] -->|"Fork"| Fork["Parallel Approval Step<br/>(PARALLEL_ROLES)"]
    Fork --> TaskLegal["Task 1: ROLE_LEGAL_COUNSEL<br/>(Status: PENDING)"]
    Fork --> TaskFinance["Task 2: ROLE_FINANCE_DIRECTOR<br/>(Status: PENDING)"]
    
    TaskLegal -->|"Approved"| PartialCheck{"Join Check:<br/>All Roles Done?"}
    TaskFinance -->|"Approved"| PartialCheck
    
    PartialCheck -->|"No (1 pending)"| WaitState["Keep State: PARALLEL_REVIEW<br/>Emit Partial Outbox Event"]
    PartialCheck -->|"Yes (0 pending)"| AdvanceState["Join Satisfied:<br/>Advance to APPROVED"]
    
    TaskLegal -.->|"Reject"| RejectionJoin["Cancel Sibling Tasks<br/>Advance immediately to REJECTED"]
    TaskFinance -.->|"Reject"| RejectionJoin
```

1. **Fork (Task Generation)**:
   - When entering a step with multiple `requiredRoles`, the engine spawns an independent `WorkflowTask` for each role with status `PENDING`.
2. **Targeted Role Matching**:
   - When a user logs in, `TaskService` identifies the specific pending task matching the user's role.
   - Once signed off, the user's specific task transitions to `COMPLETED`.
3. **Join Barrier**:
   - The workflow state remains in the parallel step until all sibling tasks are completed.
   - An intermediate `WorkflowTransitionedEvent` is staged with `parallelJoinStatus = "PARTIAL"` to update audit ledgers and analytics without advancing the state machine prematurely.
4. **Fast-Fail Rejection**:
   - If any participant rejects, all other pending tasks for that step are marked `CANCELLED`, and the workflow advances immediately to the rejection target state.
5. **Segregation of Duties Enforcement**:
   - Requesters cannot approve their own requests on parallel steps, even if they hold one of the required approval roles.
