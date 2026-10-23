# Enterprise Event-Driven Workflow & Audit Platform — Master Handbook

## 1. Project Elevator Pitch (For Interviews)
"I built an enterprise-grade, event-driven workflow and approval engine using Java 21, Spring Boot 3, Apache Kafka, and Angular 22 Native Federation Micro Frontends. It uses PostgreSQL for ACID-compliant multi-tier approvals, MongoDB for schema-less form templates and immutable audit logs, Redis for caching, and the Transactional Outbox Pattern to guarantee zero message loss between PostgreSQL and Kafka."

---

## 2. Platform Documentation Index
- [**ARCHITECTURE.md**](file:///d:/ashish/enterprise-workflow-platform/docs/ARCHITECTURE.md): Complete high/low level architecture, MFE Native Federation, Outbox pattern, and polyglot persistence.
- [**API_REFERENCE.md**](file:///d:/ashish/enterprise-workflow-platform/docs/API_REFERENCE.md): Interactive Scalar console (`/scalar`), Swagger endpoints, and full REST API catalog with RFC 7807 problem details.
- [**SECURITY_GUIDE.md**](file:///d:/ashish/enterprise-workflow-platform/docs/SECURITY_GUIDE.md): BFF architecture, HttpOnly cookies, RBAC persona matrix, and Keycloak/OIDC migration blueprint.
- [**OPERATIONS_RUNBOOK.md**](file:///d:/ashish/enterprise-workflow-platform/docs/OPERATIONS_RUNBOOK.md): Unified Docker Compose, hybrid local dev mode, port matrix, and troubleshooting.

---

## 3. Architecture & Tech Stack Tracker
- [x] **Stage 1: Domain Modeling & Contracts**
  - PostgreSQL Schema (Workflows, Approvals, Outbox)
  - MongoDB Collections (Templates, Audit Logs)
  - Shared Kafka Event Contracts (`common-contracts`)
- [x] **Stage 2: Local Cloud Infrastructure**
  - Docker Compose (Postgres, Mongo, Redis, Kafka KRaft)
  - Multi-Module Maven Parent Setup (Java 21 Virtual Threads)
  - Multi-stage Frontend Dockerfile with Nginx Multi-Port Reverse Proxy
- [x] **Stage 3: Core Workflow Service & Outbox**
  - Flyway Migrations & JPA Specifications Dynamic Search
  - Optimistic Locking (`@Version`)
  - Transactional Outbox Publisher to Kafka
- [x] **Stage 4: Audit Consumer, DLQ & Resilience**
  - Idempotent Kafka Consumer + Dead-Letter Topic (DLT)
  - SLA Compliance & Metric Aggregation Endpoints
- [x] **Stage 5: Gateway Security & API Documentation**
  - BFF HttpOnly SameSite Cookie Session Management
  - CORS configuration with `allowedOriginPatterns`
  - Interactive Scalar API Console & Springdoc OpenAPI 3
- [x] **Stage 6: Federated Angular Micro-Frontends**
  - Native Federation Host (Shell) + 3 Remotes (Workflow, Template, Analytics)
  - Centralized Design System (`ewp-theme.css`) with Tailwind `@theme` tokens
  - Cross-MFE Persona Synchronization via `AuthBridge` & BroadcastChannel
- [x] **Stage 7: CI/CD & DevSecOps Automation**
  - GitHub Actions Path-Filtered Matrix CI (`ci.yml` for Java 21 & Angular MFEs)
  - Gitleaks Secret Scanning & Aqua Trivy Dependency Vulnerability Scanner (`security.yml`)
  - Automated OCI Container Publishing to GitHub Container Registry (`docker-publish.yml` to `ghcr.io`)
- [x] **Stage 8: Observability, Metrics & Distributed Tracing**
  - Prometheus scraping (`/actuator/prometheus`) across all microservices
  - Pre-provisioned Grafana dashboards (`:3000`) for p95 latency, throughput, and JVM Virtual Threads
  - OpenTelemetry (OTel) + Micrometer Tracing with Jaeger (`:16686`) for distributed trace visualization across Gateway, Kafka, and MongoDB



---

## 4. Architectural Decision Log (Why This Way?)

### ADR-001: Polyglot Persistence (PostgreSQL + MongoDB)
- **Problem:** Approval states require strict ACID transactions, while dynamic form templates and high-volume audit logs vary in structure and are write-heavy.
- **Simpler Alternative:** Put everything in PostgreSQL using `JSONB` columns.
- **Why We Chose This:** Isolates transactional locking (PostgreSQL) from high-volume append-only audit writes and schema-less form definitions (MongoDB).

### ADR-002: Optimistic Locking (`@Version` column)
- **Problem:** Two managers approving/rejecting the same workflow at the exact same millisecond can overwrite each other's decision.
- **Simpler Alternative:** Last-write-wins (unsafe) or Pessimistic Locking (`SELECT FOR UPDATE`, which slows down database throughput).
- **Why We Chose This:** Optimistic locking checks the row `version` at commit time with zero lock overhead, failing fast if another user modified the record.

### ADR-003: Transactional Outbox Pattern
- **Problem:** Saving to PostgreSQL and publishing to Kafka in the same method causes a "Dual-Write Bug" if Kafka fails right after the DB commit.
- **Simpler Alternative:** Call `kafkaTemplate.send()` directly inside the `@Service` method.
- **Why We Chose This:** Saving the state change and the `outbox_events` record in a single PostgreSQL ACID transaction guarantees atomic consistency. A background poller then relays events to Kafka with at-least-once delivery.

### ADR-004: Idempotent Consumer via `eventId`
- **Problem:** Kafka delivers messages "at-least-once," meaning network retries can deliver the same message twice.
- **Simpler Alternative:** Blindly insert every Kafka message into MongoDB.
- **Why We Chose This:** Using the event's unique UUID (`eventId`) as the MongoDB document `_id` ensures duplicate messages are safely rejected without corrupting audit data.

### ADR-005: Apache Kafka in KRaft Mode & Alpine Containers
- **Problem:** Legacy Kafka setups require an external Apache Zookeeper cluster, doubling operational overhead and memory usage.
- **Simpler Alternative:** Run separate Zookeeper and Kafka containers with standard Debian base images.
- **Why We Chose This:** Configured Kafka in KRaft mode (embedding consensus directly into the broker) to eliminate Zookeeper overhead, and used lightweight `-alpine` container images with healthchecks to minimize memory footprint and attack surface.

### ADR-006: Multi-Module Maven Monorepo vs. Polyrepo
- **Problem:** Managing distributed microservices requires sharing data contracts and DTOs without causing version drift or breaking changes across repositories.
- **Simpler Alternative:** Create a separate GitHub repository for every microservice.
- **Why We Chose This:** Zero dependency drift across contracts, atomic refactoring, and portfolio visibility in a single unified Git tree.

### ADR-007: Centralized Parent Maven POM
- **Problem:** Inconsistent library versions and compiler flags across submodules.
- **Why We Chose This:** Centralized Java 21 definitions, Spring Boot BOMs, and Spring Cloud trains in a single root POM.

### ADR-008: JPA Specifications Over Custom JPQL Query Methods
- **Problem:** Dynamic filtering requirements on workflows lead to combinatorial explosion if handled via static repository query methods.
- **Simpler Alternative:** Write multiple `@Query` JPQL methods for every filter combination.
- **Why We Chose This:** JPA Specifications and `JpaSpecificationExecutor` enable composable, type-safe runtime predicate generation, keeping repositories clean and maintainable.

### ADR-009: Backend-For-Frontend (BFF) HttpOnly Cookies Over LocalStorage
- **Problem:** Storing access tokens in browser `localStorage` leaves the platform vulnerable to token exfiltration via Cross-Site Scripting (XSS).
- **Simpler Alternative:** `localStorage.setItem('token', jwt)`.
- **Why We Chose This:** Storing JWTs in encrypted `HttpOnly`, `SameSite=Lax` cookies prevents JavaScript from accessing the token bytes, while API Gateway automatically extracts and verifies tokens.

### ADR-010: Native Federation Over Webpack Module Federation
- **Problem:** Webpack Module Federation requires heavy build tooling and doesn't natively integrate with modern browser ES Modules.
- **Why We Chose This:** Uses native browser ES module imports via `@angular-architects/native-federation` and `importmap`, cutting build time and eliminating Webpack runtime overhead.

---

## 5. Revision Flashcards (Q&A for Interviews)
1. **Q: What happens in your project if Kafka crashes right when a manager clicks Approve?**
   - *A:* The approval still succeeds! The event is saved safely in the PostgreSQL `outbox_events` table as `PENDING`. Once Kafka comes back online, the scheduler automatically publishes it.
2. **Q: What happens if the same Kafka message is consumed twice by the Audit Service?**
   - *A:* Nothing breaks. The consumer is idempotent because it uses the Kafka event's `eventId` as the primary key in MongoDB.
3. **Q: How are authentication tokens protected against XSS in your Angular frontend?**
   - *A:* The frontend never handles raw token storage in `localStorage`. The API Gateway sets an `HttpOnly`, `SameSite=Lax` cookie, which the browser attaches automatically to API calls without exposing token bytes to JavaScript.
