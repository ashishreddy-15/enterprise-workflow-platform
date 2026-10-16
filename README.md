# Enterprise Workflow Platform

An event-driven microservices platform built with **Java 21** and **Spring Boot 3.x** designed to manage complex, multi-stage enterprise approval workflows with strict transactional integrity, fault-tolerant event streaming, and polyglot persistence.

---

## System Architecture & Design Patterns

This repository implements core distributed systems patterns from [microservices.io](https://microservices.io) to solve real-world data consistency and scalability challenges:

* **Database per Service (Polyglot Persistence):**
  * **PostgreSQL (`workflow_db`):** Owns the core transactional state machine (`workflow_instances`, `approval_tasks`) requiring strict ACID guarantees and optimistic locking (`@Version`).
  * **MongoDB (`audit_db`):** Stores immutable, schema-flexible audit logs and pre-joined analytics views.
  * **Redis:** Provides distributed caching and API Gateway rate limiting.
* **Transactional Outbox Pattern:** Eliminates the dual-write problem between PostgreSQL and Apache Kafka. Workflow state transitions and `outbox_events` records are committed in a single local ACID transaction.
* **Polling Publisher & Partial Indexing:** An asynchronous scheduler polls pending outbox events backed by a PostgreSQL partial index (`WHERE status = 'PENDING'`) to keep read overhead near zero even as historical event volume grows.
* **CQRS (Command Query Responsibility Segregation):** Separates high-integrity transactional writes (`workflow-service`) from denormalized, event-driven read projections and compliance timelines (`audit-analytics-service`).
* **Idempotent Consumer & Dead-Letter Queue (DLQ):** Guarantees safe processing under At-Least-Once Kafka delivery semantics by deduplicating event IDs before persisting to MongoDB.

### Event Flow

```text
[Client] 
   │  POST /api/v1/workflows
   ▼
[workflow-service] (Java 21 + Virtual Threads)
   │  Single @Transactional Commit
   ├──► 1. INSERT/UPDATE workflow_instances & approval_tasks (PostgreSQL)
   └──► 2. INSERT outbox_events [status = PENDING] (PostgreSQL)
              │
              ▼ (Polled every 2s via Partial Index)
      [OutboxScheduler]
              │  Publishes JSON Event (Key = workflowId)
              ▼
       [Apache Kafka] (KRaft Mode - Topic: workflow-events)
              │
              ▼
[audit-analytics-service] (Idempotent Consumer)
              │
              ▼
         [MongoDB] (Immutable Audit Trail & CQRS Read View)
