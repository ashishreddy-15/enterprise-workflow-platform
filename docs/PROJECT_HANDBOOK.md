# Enterprise Event-Driven Workflow & Audit Platform — Master Handbook

## 1. Project Elevator Pitch (For Technical Interviews)
> "I architected and built an enterprise-grade, event-driven workflow automation platform using Java 21 Virtual Threads, Spring Boot 4, Apache Kafka in KRaft mode, and Angular 22 Zoneless Native Federation Micro-Frontends. It implements polyglot persistence isolating transactional approval states in PostgreSQL from dynamic form schemas and immutable audit logs in MongoDB. To solve the distributed dual-write hazard between PostgreSQL and Kafka, I implemented the Transactional Outbox Pattern with guaranteed zero message loss. The edge layer uses a Spring Cloud Gateway Backend-For-Frontend (BFF) enforcing HttpOnly SameSite sliding session cookies, federated with Keycloak 26 and Microsoft Entra ID (Azure AD) SSO, with full-stack observability powered by Prometheus, Grafana, and OpenTelemetry distributed tracing in Jaeger."

---

## 2. Platform Documentation Index
- [**ARCHITECTURE.md**](file:///d:/ashish/enterprise-workflow-platform/docs/ARCHITECTURE.md): C4 container models, Micro-Frontend Native Federation, Outbox pattern, polyglot storage, and distributed tracing.
- [**API_REFERENCE.md**](file:///d:/ashish/enterprise-workflow-platform/docs/API_REFERENCE.md): Interactive Scalar console (`/scalar`), Swagger endpoints, RFC 7807 problem details, and REST API catalog.
- [**SECURITY_GUIDE.md**](file:///d:/ashish/enterprise-workflow-platform/docs/SECURITY_GUIDE.md): BFF architecture, HttpOnly cookies, sliding session window, Keycloak 26 OIDC, and Microsoft Entra ID SSO.
- [**OPERATIONS_RUNBOOK.md**](file:///d:/ashish/enterprise-workflow-platform/docs/OPERATIONS_RUNBOOK.md): Unified Docker Compose, hybrid local dev mode, port matrix, Grafana dashboards, Jaeger tracing walkthrough, and disaster recovery.
- [**TODO.md**](file:///d:/ashish/enterprise-workflow-platform/docs/TODO.md): Historical milestone tracker and upcoming roadmap (Testcontainers, SLA auto-escalation, Kubernetes manifests).

---

## 3. Architecture & Tech Stack Tracker

- [x] **Stage 1: Domain Modeling & Contracts**
  - PostgreSQL Relational Schema (Workflows, Tasks, Outbox)
  - MongoDB Collections (Templates, Audit Logs, CQRS Views)
  - Shared Kafka Event Contracts (`common-contracts` immutable Java records)
- [x] **Stage 2: Local Cloud Infrastructure**
  - Docker Compose (PostgreSQL 16, MongoDB 7.0, Redis 7.2, Kafka 3.8 KRaft mode)
  - Multi-Module Maven Parent Setup with Java 21 Virtual Threads (`Project Loom`)
  - Multi-stage Frontend Dockerfile with Nginx Multi-Virtual Host Reverse Proxy
- [x] **Stage 3: Core Workflow Engine & Outbox**
  - Flyway Migrations (`V1`–`V6`) with JPA Criteria API dynamic search
  - Optimistic Locking (`@Version Long version`) with HTTP 409 conflict handling
  - Transactional Outbox Publisher relaying events to Kafka topic `workflow-events`
- [x] **Stage 4: Audit Consumer, DLQ & Resilience**
  - Idempotent Kafka Consumer using `eventId` as MongoDB `_id`
  - Non-blocking retry topics (`-retry-1000`, `-retry-2000`) and Dead-Letter Topic (`-dlt`)
  - Materialized CQRS view aggregation (`WorkflowAnalyticsView`)
- [x] **Stage 5: Gateway Security & API Documentation**
  - BFF HttpOnly SameSite Cookie Session Management
  - CORS configuration with strict `allowedOriginPatterns`
  - Interactive Scalar API Console (`/scalar`) & Springdoc OpenAPI 3.1 specs
- [x] **Stage 6: Federated Angular Micro-Frontends**
  - Native Federation Host (Shell) + 3 Remotes (Workflow, Template, Analytics)
  - Angular 22 Zoneless change detection (`provideZonelessChangeDetection()`)
  - Centralized Design System (`ewp-theme.css`) with Tailwind v4 `@theme` tokens
  - Cross-MFE Persona Synchronization via `AuthBridge` DOM event bus
- [x] **Stage 7: CI/CD & DevSecOps Automation**
  - GitHub Actions Path-Filtered Matrix CI (`ci.yml` for Java 21 & Angular MFEs)
  - Gitleaks Secret Scanning & Aqua Trivy Dependency Vulnerability Scanner (`security.yml`)
  - Automated OCI Container Publishing to GitHub Container Registry (`docker-publish.yml` to `ghcr.io`)
- [x] **Stage 8: Observability, Metrics & Distributed Tracing**
  - Prometheus fine-grained 5-second scraping (`/actuator/prometheus`) across all services
  - Pre-provisioned Grafana dashboards (`:3000`) for p95 latency, throughput, and JVM Virtual Threads
  - OpenTelemetry (OTel) + Micrometer Tracing with Jaeger (`:16686`) for end-to-end distributed waterfall traces across Gateway, HTTP downstream, and Kafka broker

---

## 4. Architectural Decision Log (ADR)

### ADR-001: Polyglot Persistence (PostgreSQL + MongoDB)
- **Problem:** Approval states require strict ACID transactions, while dynamic form templates and high-volume audit logs vary in structure and are write-heavy.
- **Simpler Alternative:** Put everything in PostgreSQL using `JSONB` columns.
- **Why We Chose This:** Isolates transactional locking and referential integrity (PostgreSQL) from high-volume append-only audit writes and schema-less form definitions (MongoDB).

### ADR-002: Optimistic Locking (`@Version` column)
- **Problem:** Two managers approving/rejecting the same workflow at the exact same millisecond can overwrite each other's decision.
- **Simpler Alternative:** Last-write-wins (data loss) or Pessimistic Locking (`SELECT FOR UPDATE`, which creates DB bottlenecks).
- **Why We Chose This:** Optimistic locking checks the row `version` at commit time with zero lock overhead, failing fast (`HTTP 409 Conflict`) if another user modified the record.

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

### ADR-011: Enterprise Keycloak 26 OIDC & Microsoft Entra ID SSO
- **Problem:** Managing passwords and custom credential databases creates immense security and compliance risk.
- **Simpler Alternative:** Hardcoded database username/password table.
- **Why We Chose This:** Integrated Keycloak 26 as the standard OIDC identity broker with a custom branded theme, federated with Microsoft Entra ID (Azure AD), establishing enterprise identity governance.

### ADR-012: Dual-Timeout Sliding Window Session Management
- **Problem:** Fixed token expiration forcibly disconnects active users in the middle of long approval workflows, while static non-expiring tokens leave inactive workstations vulnerable.
- **Simpler Alternative:** Static 8-hour access token.
- **Why We Chose This:** Implemented a 60-minute idle inactivity timeout paired with an 8-hour absolute maximum lifespan ceiling. If a user is active within $\le 15$ minutes of the idle window, the session slides forward automatically.

### ADR-013: DevSecOps Shift-Left Security Scanning
- **Problem:** Vulnerabilities and leaked credentials are often caught only after production deployment or security audits.
- **Simpler Alternative:** Manual quarterly penetration testing.
- **Why We Chose This:** Integrated automated Gitleaks secret scanning and Aqua Trivy CVE scanning directly into GitHub Actions, blocking pull requests with leaked secrets or critical vulnerabilities.

### ADR-014: OpenTelemetry Distributed Tracing & W3C TraceContext
- **Problem:** Tracking an asynchronous workflow action through the Gateway, database, outbox poller, Kafka topic, and audit consumer is impossible with standard log aggregation.
- **Simpler Alternative:** Logging timestamp strings across microservices.
- **Why We Chose This:** Implemented OpenTelemetry with W3C `traceparent` context propagation across WebFlux HTTP calls and Kafka record headers, rendering end-to-end waterfall request spans in Jaeger.

---

## 5. Revision Flashcards (Q&A for Technical Interviews)

1. **Q: What happens in your platform if Kafka crashes right when a manager clicks Approve?**
   - *A:* The approval succeeds without data loss! The state transition and outbox record are saved atomically in the same PostgreSQL ACID transaction. The event remains in `outbox_events` with status `PENDING`. Once Kafka recovers, the background poller automatically publishes it.

2. **Q: How does the platform prevent duplicate messages if Kafka delivers an event twice?**
   - *A:* The `audit-analytics-service` implements the Idempotent Consumer pattern. The event's unique UUID (`eventId`) is stored as the MongoDB document `_id`. Before processing, it checks if `existsById(eventId)` is true; if so, it acknowledges the message and discards the duplicate without updating analytics.

3. **Q: How are authentication tokens protected against XSS and token exfiltration?**
   - *A:* The platform implements the BFF pattern. Tokens are stored in an `HttpOnly`, `SameSite=Lax` cookie (`ewp_access_token`). JavaScript in the Angular frontend cannot read or access the cookie bytes. The browser attaches the cookie automatically to all same-site requests.

4. **Q: How do you prevent identity header spoofing on downstream microservices?**
   - *A:* The API Gateway includes an `AuthenticationHeaderFilter` that explicitly strips client-supplied `X-User-Id` and `X-User-Roles` headers from incoming requests. It then cryptographically extracts verified claims from the validated JWT and injects sanitized headers downstream.

5. **Q: Why did you choose Angular Native Federation over traditional Webpack Module Federation?**
   - *A:* Native Federation runs on native browser ES Modules and `importmap` via Vite and esbuild. It removes Webpack build tooling overhead, provides faster compilation, and operates with modern Angular 22 Zoneless change detection.

6. **Q: How does distributed tracing work across an asynchronous Kafka boundary?**
   - *A:* When the outbox poller publishes an event, Spring Kafka injects the current W3C `traceparent` into the Kafka record headers. When `audit-analytics-service` consumes the message, it extracts the header and resumes the span, producing a single unified waterfall trace in Jaeger spanning HTTP and Kafka.
