# Enterprise Workflow Platform

An event-driven microservices platform built with **Java 21**, **Spring Boot**, **Apache Kafka**, and **Angular 22 Federated Micro-Frontends** designed to manage multi-stage, data-driven enterprise approval workflows (e.g. vendor onboarding, procurement, capital expenditure approvals) with transactional integrity, fault-tolerant event streaming, and polyglot persistence.

Workflows are **fully data-driven** — state graphs, required roles, payload requirements, and transition rules are defined in versioned MongoDB templates, allowing new business processes to be modeled without application code changes.

---

## 📚 Platform Documentation

* [**Architecture Deep Dive (`docs/ARCHITECTURE.md`)**](file:///d:/ashish/enterprise-workflow-platform/docs/ARCHITECTURE.md): Complete high/low level architecture, MFE Native Federation, Outbox pattern, and polyglot persistence.
* [**Interactive API Reference (`docs/API_REFERENCE.md`)**](file:///d:/ashish/enterprise-workflow-platform/docs/API_REFERENCE.md): Interactive Scalar API console (`http://localhost:8080/scalar`), Swagger endpoints, and complete REST catalog.
* [**Security & Authentication Guide (`docs/SECURITY_GUIDE.md`)**](file:///d:/ashish/enterprise-workflow-platform/docs/SECURITY_GUIDE.md): BFF architecture, HttpOnly cookies, RBAC persona matrix, and Keycloak/OIDC migration blueprint.
* [**Operations & Runbook (`docs/OPERATIONS_RUNBOOK.md`)**](file:///d:/ashish/enterprise-workflow-platform/docs/OPERATIONS_RUNBOOK.md): Unified Docker Compose, hybrid local dev mode, port matrix, and troubleshooting.
* [**Master Handbook (`docs/PROJECT_HANDBOOK.md`)**](file:///d:/ashish/enterprise-workflow-platform/docs/PROJECT_HANDBOOK.md): Architectural Decision Records (ADR-001 through ADR-010) and interview flashcards.

---

## 🌟 Interactive API Console (Scalar)

Test all microservice endpoints interactively in the browser with live request execution and auto-generated code snippets in 15+ languages:

👉 **`http://localhost:8080/scalar`** (or **`http://localhost/scalar`** via Nginx)

---

## Architecture Overview

```text
                               ┌─────────────────────────┐
                               │     Client / Gateway    │
                               └────────────┬────────────┘
                                            │
               ┌────────────────────────────┼────────────────────────────┐
               │ REST (:8083)               │ REST (:8081)               │ REST (:8082)
               ▼                            ▼                            ▼
    ┌──────────────────────┐     ┌──────────────────────┐     ┌────────────────────────┐
    │   template-service   │◄────┤   workflow-service   │     │ audit-analytics-service│
    └──────────┬───────────┘HTTP └──────────┬───────────┘     └───────────▲────────────┘
               │ (Blueprints)               │ (Core Engine)               │
               │                            │                             │ Kafka Consumer
               ▼                            ▼                             │ (workflow-events)
        ┌─────────────┐            ┌──────────────────┐                   │
        │   MongoDB   │            │    PostgreSQL    │                   │
        │(template_db)│            │  (workflow_db)   │                   │
        └─────────────┘            └────────┬─────────┘                   │
                                            │                             │
                                            ▼ (Outbox Poller every 2s)    │
                                   ┌──────────────────┐                   │
                                   │   Apache Kafka   ├───────────────────┘
                                   │  (KRaft Mode)    │
                                   └──────────────────┘
```

---

## Core Distributed Systems & Design Patterns

* **Transactional Outbox Pattern:** Eliminates the dual-write problem between PostgreSQL and Apache Kafka. Workflow state transitions and `outbox_events` are committed within a single local ACID transaction. A background scheduler polls pending events using `SELECT ... FOR UPDATE SKIP LOCKED` and a partial index (`WHERE status = 'PENDING'`).
* **Data-Driven Dynamic State Machine:** Workflows are orchestrated based on template graphs defined in MongoDB rather than hardcoded logic. Each step configures actor scope (`REQUESTER`, `ROLE`, or `ANY`), permitted actions, and target states.
* **Frozen Template Snapshots:** When an instance is created, a complete JSONB snapshot of the template definition is frozen on the workflow instance (`template_snapshot`). Publishing a new template version never breaks in-flight workflows.
* **Segregation of Duties (SoD) & RBAC:** Enforced in transition logic. A user who initiated a workflow cannot action `ROLE`-scoped approval tasks on their own workflow, preventing unauthorized self-approvals.
* **Optimistic Locking:** Managed via JPA `@Version` on `workflow_instances`. Prevents lost updates under concurrent transitions; concurrent conflicts throw `OptimisticLockException` and return an HTTP `409 Conflict` ProblemDetail response.
* **CQRS (Command Query Responsibility Segregation):** Write operations are handled by `workflow-service` with normalized PostgreSQL storage; read analytics and audit trails are projected into MongoDB by `audit-analytics-service` as pre-aggregated documents (`workflow_analytics_views`).
* **Idempotent Consumer:** Kafka consumer verifies `eventId` in MongoDB before processing. Duplicate deliveries under at-least-once semantics are discarded safely.
* **Non-Blocking Retry & Dead-Letter Topic (DLT):** Configured via Spring Kafka `@RetryableTopic` with exponential backoff (1s -> 2s -> 4s). Unrecoverable messages land on `workflow-events-dlt` and trigger alerting via `@DltHandler`.
* **Java 21 Virtual Threads:** Enabled across all services (`spring.threads.virtual.enabled=true`) for high concurrent I/O throughput.

---

## Project Structure & Modules

The repository is structured as a multi-module Maven project:

```text
enterprise-workflow-platform/
├── backend/
│   ├── pom.xml                        # Root parent POM (Spring Boot 4.1.1, Spotless, Java 21)
│   ├── common-contracts/              # Shared records: events & cross-service DTOs
│   ├── api-gateway/                   # Port 8080: Edge reverse proxy, JWT/BFF auth & unified Scalar UI
│   ├── template-service/              # Port 8083: Workflow blueprint authoring & versioning (MongoDB)
│   ├── workflow-service/              # Port 8081: Core workflow state machine & Outbox (PostgreSQL)
│   └── audit-analytics-service/       # Port 8082: Kafka event consumer & CQRS read views (MongoDB)
├── frontend/
│   ├── projects/shared-theme/         # Single source of truth: ewp-theme.css & Tailwind @theme
│   ├── projects/shell/                # Port 4200: Host container & persona switcher
│   ├── projects/workflow-mfe/         # Port 4201: Task Inbox, approvals, stepper
│   ├── projects/analytics-mfe/        # Port 4202: SLA monitoring & metrics
│   └── projects/template-mfe/         # Port 4203: Visual workflow designer
└── docker/
    ├── Dockerfile.frontend            # Multi-stage Node 22 build -> Nginx Alpine runtime
    ├── Dockerfile.jvm                 # Optimized Java 21 container image
    ├── docker-compose.infra.yml       # Backing stores: Postgres 16, Mongo 7, Kafka 3.8, Redis 7
    └── docker-compose.full.yml        # Full-stack orchestrator (Infra + Services + Frontend)
```

| Module / Service | Port | Technology / Storage | Responsibility |
|---|---|---|---|
| [`api-gateway`](file:///d:/ashish/enterprise-workflow-platform/backend/api-gateway) | 8080 | Spring Cloud Gateway WebFlux | Edge reverse proxy, CORS preflight, HttpOnly cookie auth, and unified Scalar API console (`/scalar`). |
| [`template-service`](file:///d:/ashish/enterprise-workflow-platform/backend/template-service) | 8083 | MongoDB (`template_db`) | Template creation, versioning (`DRAFT` → `PUBLISHED`), and step definitions. |
| [`workflow-service`](file:///d:/ashish/enterprise-workflow-platform/backend/workflow-service) | 8081 | PostgreSQL (`workflow_db`) | Instance creation, transitions, RBAC & SoD enforcement, task inbox, transactional outbox scheduler. |
| [`audit-analytics-service`](file:///d:/ashish/enterprise-workflow-platform/backend/audit-analytics-service) | 8082 | MongoDB (`audit_db`) | Consumes `workflow-events`, writes immutable audit logs, maintains pre-joined CQRS analytics views. |
| **Shell Application** | 4200 / 80 | Angular 22 Native Federation | Host container, lazy routing, persona switcher, error boundaries (`MfeFallbackComponent`). |
| **Workflow MFE** | 4201 | Angular 22 Remote | Human task inbox, step execution, approval/rejection, SLA badges. |
| **Template MFE** | 4203 | Angular 22 Remote | Visual workflow blueprint studio, step DAG designer, JSON preview. |
| **Analytics MFE** | 4202 | Angular 22 Remote | Live SLA compliance metrics, throughput graphs, chronological audit trail. |

---

## Database Schemas & Collections

### PostgreSQL (`workflow_db`)

Managed via **Flyway migrations** (`backend/workflow-service/src/main/resources/db/migration/`):

* **`workflow_instances`**: Stores running workflows with optimistic locking (`version`), state (`current_state`), requester metadata, frozen blueprint (`template_snapshot` JSONB), and contextual form payload (`context_data` JSONB).
* **`workflow_tasks`**: Actionable tasks spawned for human actors with `step_name`, `task_type`, `assigned_role`, `completed_by`, `status`, and remarks.
* **`outbox_events`**: Atomic staging buffer for Kafka messages. Indexed with `status = 'PENDING'` for fast polling; tracks retry attempts and quarantine status (`FAILED`).

### MongoDB

* **`template_db.workflow_templates`**: Holds workflow templates with compound unique indexing on `{ templateKey: 1, version: 1 }`. Contains full graph of steps, validation rules, and valid transitions.
* **`audit_db.audit_logs`**: Immutable, append-only chronological log of every transition keyed by `eventId`.
* **`audit_db.workflow_analytics_views`**: Denormalized CQRS read-model containing current state, total transition counts, and complete chronological transition history.

---

## API Reference

### 1. Template Service (`:8083`)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/templates` | Create a draft workflow template (auto-increments version) |
| `PUT` | `/api/v1/templates/{key}/versions/{version}/publish` | Publish a template version |
| `GET` | `/api/v1/templates/{key}` | Fetch latest published blueprint |
| `GET` | `/api/v1/templates/{key}/versions` | List all versions of a template |

### 2. Workflow Service (`:8081`)

*All requests require authentication headers: `X-User-Id` and `X-User-Roles` (comma-separated).*

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/workflows` | Start a new workflow instance from a template key |
| `POST` | `/api/v1/workflows/{id}/transition` | Trigger a state transition (`action`, `comments`, `payload`) |
| `GET` | `/api/v1/workflows` | Search workflows (query params: `state`, `priority`, `requesterId`) |
| `GET` | `/api/v1/tasks/inbox` | List eligible pending tasks for the calling user (evaluated with SoD) |
| `POST` | `/api/v1/admin/outbox/replay-failed` | Bulk re-queue quarantined `FAILED` outbox events |
| `POST` | `/api/v1/admin/outbox/events/{id}/replay` | Re-queue a specific failed event |

### 3. Audit & Analytics Service (`:8082`)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/analytics/workflows/{workflowId}` | Get pre-joined CQRS analytics view and history |
| `GET` | `/api/v1/analytics/workflows?state=...` | List pre-joined workflow analytics views by state |
| `GET` | `/api/v1/analytics/audit-logs/{workflowId}` | Fetch raw immutable audit logs for a workflow |

---

## Code Formatting & Style

The codebase enforces **Palantir Java Format** via the **Spotless Maven Plugin**. Formatting checks are automatically executed during `mvn compile`.

```bash
# Auto-format all Java files across all modules
mvn spotless:apply

# Verify format compliance without modifying files
mvn spotless:check
```

---

## Getting Started Locally

### Prerequisites

* **Java 21** (Eclipse Adoptium JDK recommended)
* **Maven 3.9+**
* **Docker & Docker Compose**

### Option A: Full Containerized Stack (Recommended)

To run the complete platform—databases, Kafka, all backend microservices, and all 4 frontend MFEs with Nginx—in a single command without needing local Java or Node installed:

```bash
docker compose -f docker/docker-compose.full.yml up -d --build
```

Access the platform:
* **Application Portal (Shell)**: `http://localhost:4200` or `http://localhost`
* **API Gateway**: `http://localhost:8080`
* **Workflow MFE**: `http://localhost:4201`
* **Analytics MFE**: `http://localhost:4202`
* **Template MFE**: `http://localhost:4203`

---

### Option B: Local Development Mode

#### 1. Start Infrastructure Services

Launch PostgreSQL, MongoDB, Apache Kafka (KRaft), and Redis:

```bash
docker compose -f docker/docker-compose.infra.yml up -d
```

Verify containers are healthy:

```bash
docker ps
```

### 2. Build the Platform

From the `backend` directory:

```bash
cd backend
mvn clean install -DskipTests
```

### 3. Run Microservices

Start each service in a separate terminal:

```bash
# 1. Template Service (:8083)
mvn -pl template-service spring-boot:run

# 2. Workflow Service (:8081)
mvn -pl workflow-service spring-boot:run

# 3. Audit & Analytics Service (:8082)
mvn -pl audit-analytics-service spring-boot:run
```

---

## Error Handling & Problem Details

All REST APIs conform to **RFC 7807 (Problem Details for HTTP APIs)**:
* `403 Forbidden` (`SecurityException`): Triggered by missing authentication headers, role mismatches, or Segregation of Duties violations.
* `409 Conflict` (`OptimisticLockException` / `ObjectOptimisticLockingFailureException`): Triggered when concurrent requests attempt to mutate the same workflow version simultaneously.
* `400 Bad Request` (`IllegalArgumentException`): Input or payload validation failure.
* `500 Internal Server Error`: Generic unhandled exceptions.
