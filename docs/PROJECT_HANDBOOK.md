# Enterprise Event-Driven Workflow & Audit Platform — Master Handbook

## 1. Project Elevator Pitch (For Interviews)
"I built an enterprise-grade, event-driven workflow and approval engine using Java 21, Spring Boot 3, Apache Kafka, and Angular 19 Micro Frontends. It uses PostgreSQL for ACID-compliant multi-tier approvals, MongoDB for schema-less form templates and immutable audit logs, Redis for caching, and the Transactional Outbox Pattern to guarantee zero message loss between PostgreSQL and Kafka."

---

## 2. Architecture & Tech Stack Tracker
- [ ] **Stage 1: Domain Modeling & Contracts** (In Progress)
  - PostgreSQL Schema (Workflows, Approvals, Outbox)
  - MongoDB Collections (Templates, Audit Logs)
  - Shared Kafka Event Contracts
- [ ] **Stage 2: Local Cloud Infrastructure**
  - Docker Compose (Postgres, Mongo, Redis, Kafka KRaft)
  - Multi-Module Maven Parent Setup (Java 21 Virtual Threads)
- [ ] **Stage 3: Core Workflow Service & Outbox**
  - Flyway Migrations & JPA Specifications Dynamic Search
  - Redis Distributed Caching
  - Transactional Outbox Publisher to Kafka
- [ ] **Stage 4: Audit Consumer, DLQ & Resilience**
  - Idempotent Kafka Consumer + Dead-Letter Topic (DLT)
  - Resilience4j Circuit Breakers
- [ ] **Stage 5: Gateway Security, Tracing & CI/CD**
  - OAuth2/JWT Gateway Security
  - OpenTelemetry + Prometheus + Grafana
  - Testcontainers + GitHub Actions + SonarQube
- [ ] **Stage 6: Angular 19 Micro Frontends**
  - Module Federation Host + Remotes
  - Angular Signals & Live Server-Sent Events (SSE)

---

## 3. Architectural Decision Log (Why This Way?)

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

---

## 4. Revision Flashcards (Q&A for Interviews)
1. **Q: What happens in your project if Kafka crashes right when a manager clicks Approve?**
   - *A:* The approval still succeeds! The event is saved safely in the PostgreSQL `outbox_events` table as `PENDING`. Once Kafka comes back online, the scheduler automatically publishes it.
2. **Q: What happens if the same Kafka message is consumed twice by the Audit Service?**
   - *A:* Nothing breaks. The consumer is idempotent because it uses the Kafka event's `eventId` as the primary key in MongoDB.

### ADR-005: Apache Kafka in KRaft Mode & Alpine Containers
- **Problem:** Legacy Kafka setups require an external Apache Zookeeper cluster, doubling operational overhead and memory usage.
- **Simpler/Older Alternative:** Run separate Zookeeper and Kafka containers with standard Debian base images.
- **Why We Chose This:** Configured Kafka 3.8 in KRaft mode (acting as both broker and controller) to eliminate Zookeeper dependencies, and used hardened `-alpine` images with Docker healthchecks to minimize memory footprint and security attack surface.

### ADR-006: Multi-Module Maven Monorepo vs. Polyrepo
- **Problem:** Managing distributed microservices requires sharing data contracts and DTOs without causing version drift or breaking changes across repositories.
- **Simpler/Alternative Approach (Polyrepo):** Create a separate GitHub repository for every microservice (`workflow-service`, `audit-service`, `common-contracts`, etc.).
- **What Breaks with Polyrepos:** Updating an event contract requires publishing a JAR to a private package manager (like Nexus/Artifactory) and updating version numbers across multiple independent repositories, frequently leading to version mismatch bugs.
- **Why We Chose a Multi-Module Monorepo:** 
  1. **Zero Dependency Drift:** Shared contracts (`common-contracts`) live in the same repository tree, ensuring atomic updates and compile-time type safety across all producer and consumer services simultaneously.
  2. **Atomic Refactoring:** Changes to database entities or shared code automatically flag and compile across every affected microservice in a single Pull Request.
  3. **Portfolio Visibility:** Allows recruiters and engineering managers to review the entire platform layout in a single, cohesive GitHub repository.

### ADR-007: Centralized Parent Maven POM (`<parent>`)
- **Problem:** Duplicate plugin configurations, scattered library versions, and inconsistent Java compiler flags across different microservices lead to inconsistent builds.
- **Simpler Alternative:** Copy-pasting dependency versions and build plugins into each microservice's individual `pom.xml`.
- **Why We Chose a Centralized Parent POM:** 
  1. **Single Source of Truth:** Centralizes Java version definitions (`Java 21`), Spring Boot BOMs, and Spring Cloud dependency management train versions.
  2. **Cleaner Sub-Modules:** Keeps individual microservice `pom.xml` files lightweight, containing only the specific starters they need.

### ADR-008: Apache Kafka in KRaft Mode & Alpine Containers
- **Problem:** Legacy Kafka architectures require a separate Apache Zookeeper cluster, doubling operational complexity and memory consumption.
- **Simpler Alternative:** Run separate Zookeeper and Kafka containers using standard Debian base images.
- **Why We Chose This:** Configured Kafka in KRaft mode (embedding consensus directly into the broker) to eliminate Zookeeper overhead, and used lightweight `-alpine` container images with healthchecks to minimize memory footprint and attack surface.

### ADR-009: JPA Specifications Over Custom JPQL Query Methods
- **Problem:** Dynamic filtering requirements on workflows lead to combinatorial explosion if handled via static repository query methods.
- **Simpler Alternative:** Write multiple `@Query` JPQL methods for every filter combination.
- **Why We Chose This:** JPA Specifications and `JpaSpecificationExecutor` enable composable, type-safe runtime predicate generation, keeping repositories clean and maintainable.