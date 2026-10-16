# Enterprise Event-Driven Workflow Platform — Learning & Implementation TODO

## Phase 1: Architecture & Concepts Review
- [ ] **Review Microservices Patterns**
  - **Source:** [microservices.io](https://microservices.io/)
  - **Key Focus:** Study the *Transactional Outbox*, *Saga*, and *API Gateway* pattern catalogs to map them against our project design.
- [ ] **Review Apache Kafka & KRaft Mode**
  - **Key Focus:** Understand event-driven brokers, partition distribution, at-least-once delivery, and how KRaft eliminates Zookeeper metadata overhead.
- [ ] **Review Spring Data JPA Specifications**
  - **Key Focus:** Understand how the Criteria API generates dynamic runtime SQL predicates without combinatorial JPQL repository methods.

---

## Phase 2: Infrastructure & Core Setup (Current Status)
- [x] Create monorepo folder structure (`backend/`, `frontend/`, `docker/`, `docs/`)
- [x] Configure `docker-compose.infra.yml` (PostgreSQL 16, MongoDB 7, Redis 7.2, Kafka KRaft with healthchecks)
- [x] Set up Parent Maven `pom.xml` with Java 21 Virtual Threads and Spring Cloud BOM
- [x] Create `common-contracts` module with shared `WorkflowTransitionedEvent` record

---

## Phase 3: Workflow Service & Database Layer
- [ ] Configure `workflow-service` `application.yml` and Flyway migration (`V1__init_workflow_schema.sql`)
- [ ] Implement JPA Entities (`WorkflowInstance`, `ApprovalTask`) with Optimistic Locking (`@Version`)
- [ ] Build JPA Specifications and Repository interfaces for dynamic filtering
- [ ] Implement the Transactional Outbox pattern service logic