# Architecture Guide — Enterprise Event-Driven Workflow Platform

## 1. High-Level System Architecture

The platform is designed around the **Polyglot Microservices** and **Federated Micro-Frontends (MFE)** patterns, leveraging event-driven state transitions, distributed outbox patterns, and isolated domain storage.

```mermaid
flowchart TD
    subgraph Client["Browser Client (Single Origin / Multi-MFE)"]
        Shell["Angular Shell (:4200 / :80)<br/>Host Container & Navigation"]
        WF_MFE["Workflow MFE (:4201)<br/>Task Inbox & Stepper"]
        TMPL_MFE["Template MFE (:4203)<br/>Visual Workflow Designer"]
        AUD_MFE["Analytics MFE (:4202)<br/>SLA Dashboard & Audit"]
    end

    subgraph Edge["Edge & Reverse Proxy"]
        Nginx["Nginx Reverse Proxy (:80)<br/>Multi-Port MFE Host"]
        Gateway["Spring Cloud Gateway (:8080)<br/>WebFlux, CORS, JWT Auth & Scalar UI"]
    end

    subgraph Services["Core Application Microservices"]
        TmplSvc["Template Service (:8083)<br/>Spring Boot Web MVC"]
        WfSvc["Workflow Engine (:8081)<br/>Spring Boot Data JPA"]
        AuditSvc["Audit Analytics (:8082)<br/>Spring Boot Kafka Consumer"]
    end

    subgraph Messaging["Distributed Event Bus"]
        Kafka["Apache Kafka 3.8 (KRaft)<br/>Topic: workflow.transitions.v1"]
    end

    subgraph Storage["Polyglot Persistence Layer"]
        PG[("PostgreSQL 16<br/>workflow_db (ACID State)")]
        Mongo[("MongoDB 7.0<br/>template_db & audit_db")]
        Redis[("Redis 7.2<br/>Distributed Cache")]
    end

    Shell --> Nginx
    WF_MFE --> Nginx
    TMPL_MFE --> Nginx
    AUD_MFE --> Nginx

    Nginx --> Gateway
    Shell --> Gateway

    Gateway -->|/templates/**| TmplSvc
    Gateway -->|/workflows/**| WfSvc
    Gateway -->|/analytics/**| AuditSvc

    TmplSvc --> Mongo
    WfSvc --> PG
    WfSvc --> Redis
    WfSvc -->|Publish Outbox| Kafka
    Kafka -->|Idempotent Consume| AuditSvc
    AuditSvc --> Mongo
```

---

## 2. Micro-Frontend Architecture (Native Federation)

The frontend is divided into independent micro-frontends orchestrated using **Native Federation** without Webpack or Module Federation runtime overhead:

```
frontend/
├── projects/
│   ├── shared-theme/         ← Single Source of Truth: ewp-theme.css & Tailwind @theme tokens
│   ├── shell/                ← Host container (Port 4200 / 80)
│   ├── workflow-mfe/         ← Remote: Task Inbox, approvals, stepper (Port 4201)
│   ├── analytics-mfe/        ← Remote: SLA monitoring & metrics (Port 4202)
│   └── template-mfe/         ← Remote: Visual workflow designer (Port 4203)
```

### Key Principles:
1. **Dynamic Manifest Resolution**: The Shell loads `federation.manifest.json` on initialization, resolving remote entry points dynamically at runtime without rebuilds.
2. **Resilient Error Boundaries**: If a remote MFE is unreachable, `MfeFallbackComponent` safely captures the error and displays a recovery banner rather than crashing the application.
3. **Cross-MFE State Synchronization**: Personas and authentication state are broadcast across MFEs using a zero-dependency `BroadcastChannel` with `localStorage` fallback via [`AuthBridge`](file:///d:/ashish/enterprise-workflow-platform/frontend/projects/shell/src/app/core/utils/auth-bridge.util.ts).
4. **Unified Design System**: All MFEs import [`ewp-theme.css`](file:///d:/ashish/enterprise-workflow-platform/frontend/projects/shared-theme/ewp-theme.css) at build-time, guaranteeing identical design tokens (`--color-ewp-primary`, typography, spacing) and semantic utility classes (`.ewp-card`, `.ewp-counter-pill`, `.ewp-task-item`).

---

## 3. Polyglot Persistence & Data Modeling

| Store | Technology | Purpose | Justification |
|---|---|---|---|
| **Workflow State** | PostgreSQL 16 | ACID approval tasks, state transitions | Strict transactional consistency, optimistic locking (`@Version`), and relational referential integrity. |
| **Outbox Events** | PostgreSQL 16 | Transactional Outbox pattern | Atomic writes within the same database transaction as workflow state updates. |
| **Workflow Blueprints** | MongoDB 7.0 | Dynamic step DAGs, JSON schemas | Schema-less document flexibility allowing arbitrary step definitions, transition rules, and input payload schemas. |
| **Audit Log** | MongoDB 7.0 | Immutable chronological audit trail | High-volume append-only write throughput with flexible query capabilities over event payloads. |
| **Distributed Cache** | Redis 7.2 | Template and active session caching | Ultra-low latency access for high-frequency reads. |

---

## 4. Transactional Outbox Pattern (Zero Message Loss)

When a workflow transitions or an approval is processed, writing to the database and sending a message to Kafka simultaneously creates a **Dual-Write Hazard**:

```mermaid
sequenceDiagram
    participant User as Manager / Submitter
    participant WfSvc as Workflow Service
    participant PG as PostgreSQL 16
    participant Poller as Outbox Relay (Scheduler)
    participant Kafka as Apache Kafka 3.8
    participant AuditSvc as Audit Analytics Service
    participant Mongo as MongoDB 7.0

    User->>WfSvc: POST /workflows/{id}/approve
    Note over WfSvc,PG: Single ACID Transaction
    WfSvc->>PG: UPDATE workflow_instances (state, version + 1)
    WfSvc->>PG: INSERT INTO outbox_events (status = PENDING)
    PG-->>WfSvc: Transaction Committed

    loop Scheduled Every 500ms
        Poller->>PG: SELECT * FROM outbox_events WHERE status = 'PENDING'
        Poller->>Kafka: Publish WorkflowTransitionedEvent
        Kafka-->>Poller: ACK
        Poller->>PG: UPDATE outbox_events SET status = 'PUBLISHED'
    end

    Kafka->>AuditSvc: Consume WorkflowTransitionedEvent
    Note over AuditSvc,Mongo: Idempotent Write
    AuditSvc->>Mongo: UPSERT audit_events (_id = eventId)
```

### Guarantees:
1. **At-Least-Once Delivery**: If the network or Kafka fails, the event remains `PENDING` in PostgreSQL and will be re-attempted on the next poll.
2. **Idempotent Consumption**: The Audit Service uses `eventId` as MongoDB's primary key (`_id`), safely dropping duplicate messages without corrupting audit logs.
