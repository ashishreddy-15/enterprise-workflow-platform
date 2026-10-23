# Enterprise Workflow Platform

[![Java 21](https://img.shields.io/badge/Java-21-blue?logo=openjdk&logoColor=white)](https://openjdk.org/)
[![Spring Boot](https://img.shields.io/badge/Spring%20Boot-4.1.1-green?logo=springboot&logoColor=white)](https://spring.io/projects/spring-boot)
[![Apache Kafka](https://img.shields.io/badge/Apache%20Kafka-3.8-red?logo=apachekafka&logoColor=white)](https://kafka.apache.org/)
[![Angular](https://img.shields.io/badge/Angular-22-dd0031?logo=angular&logoColor=white)](https://angular.dev/)
[![Keycloak](https://img.shields.io/badge/Keycloak-26.1-blue?logo=keycloak&logoColor=white)](https://www.keycloak.org/)
[![OpenTelemetry](https://img.shields.io/badge/OpenTelemetry-Jaeger-4B5563?logo=opentelemetry&logoColor=white)](https://opentelemetry.io/)

An event-driven microservices platform designed for multi-stage enterprise approval workflows (e.g., procurement, vendor onboarding, and capital expenditure approvals) with transactional guarantees, dynamic form schemas, and full-stack observability.

Workflows are **100% data-driven** — state machines, required approval roles, form schemas, and transition paths are authored as versioned MongoDB templates, enabling new business processes to launch without application code changes.

---

## 🌟 Key Capabilities

- **Data-Driven Workflow Engine**: Define custom approval graphs, step types, dynamic form fields, and SLA deadlines in versioned JSON blueprints.
- **Polyglot Persistence**: PostgreSQL 16 for ACID workflow transitions and MongoDB 7.0 for flexible form definitions and immutable audit logs.
- **Zero-Loss Event Streaming**: Eliminates dual-write bugs using the **Transactional Outbox Pattern** with Apache Kafka 3.8 (KRaft mode) and non-blocking retry topics.
- **Federated Micro-Frontends**: Modern Angular 22 frontend built with **Native Federation**, **Zoneless change detection**, and an event-driven `AuthBridge` state bus.
- **Enterprise Identity & BFF Security**: Backend-For-Frontend architecture using `HttpOnly`, `SameSite=Lax` sliding session cookies federated with **Keycloak 26** and **Microsoft Entra ID (Azure AD)**.
- **Production Observability**: Fine-grained metrics scraped by **Prometheus**, pre-configured **Grafana** dashboards, and end-to-end distributed tracing in **Jaeger**.

---

## 📁 Repository Structure

```
enterprise-workflow-platform/
├── backend/                       # Java 21 / Spring Boot 4 Multi-Module Project
│   ├── common-contracts/          # Shared immutable event records & DTOs
│   ├── api-gateway/               # Port 8080: WebFlux Gateway, BFF auth & Scalar console
│   ├── workflow-service/          # Port 8081: Core workflow aggregate & Outbox poller (Postgres)
│   ├── audit-analytics-service/   # Port 8082: Idempotent Kafka consumer & CQRS read models (Mongo)
│   └── template-service/          # Port 8083: Dynamic workflow schema authoring & versioning (Mongo)
├── frontend/                      # Angular 22 Zoneless Micro-Frontends (Native Federation)
│   ├── projects/shared-theme/     # Centralized design system (Tailwind v4 tokens)
│   ├── projects/shell/            # Port 4200: Host container, navigation & persona switcher
│   ├── projects/workflow-mfe/     # Port 4201: Task Inbox, dynamic stepper & approval modal
│   ├── projects/template-mfe/     # Port 4203: Visual 2D DAG blueprint designer
│   └── projects/analytics-mfe/    # Port 4202: Live audit ledger & SLA compliance metrics
├── docker/                        # Containerization & Infrastructure
│   ├── docker-compose.full.yml    # Full-stack composition (all 10 services & stores)
│   ├── docker-compose.infra.yml   # Lightweight backing stores for local IDE development
│   ├── nginx.conf                 # Multi-server virtual host reverse proxy
│   └── prometheus/ & grafana/     # Provisioned datasources and telemetry dashboards
└── docs/                          # Comprehensive Platform Documentation
```

---

## 🚀 Quick Start (< 2 Minutes)

### 1. Prerequisites
- [Docker Engine & Compose](https://docs.docker.com/get-docker/) (`v26.0+`)

### 2. Configure Environment
```bash
cp .env.example .env
cp .env.example docker/.env
```

### 3. Launch Platform
```bash
docker compose -f docker/docker-compose.full.yml up -d --build
```

---

## 🔗 Live Service URLs

| Service / Tool | URL | Default Credentials | Description |
|---|---|---|---|
| **Platform Web App** | [`http://localhost:4200`](http://localhost:4200) (or `:80`) | Select Persona or SSO | Angular Shell + Micro-Frontends |
| **Interactive API Explorer** | [`http://localhost:8080/scalar`](http://localhost:8080/scalar) | Public / Session Cookie | Scalar OpenAPI 3.1 Console |
| **Grafana Monitoring** | [`http://localhost:3000`](http://localhost:3000) | `admin` / `admin` | Throughput, Latency, JVM Metrics |
| **Jaeger Tracing** | [`http://localhost:16686`](http://localhost:16686) | Open Access | Distributed Waterfall Traces |
| **Keycloak IAM Console** | [`http://localhost:8085`](http://localhost:8085) | `admin` / `admin` | OIDC Realm & User Administration |

---

## 📚 Detailed Documentation

For in-depth architectural diagrams, API schemas, security models, and operational runbooks, refer to the dedicated guides in [`docs/`](docs/):

- **[Architecture Deep Dive (`docs/ARCHITECTURE.md`)](docs/ARCHITECTURE.md)**: C4 container models, Micro-Frontend Native Federation, Outbox pattern, polyglot storage, and distributed tracing.
- **[REST API Reference (`docs/API_REFERENCE.md`)](docs/API_REFERENCE.md)**: Interactive Scalar explorer, Swagger endpoints, RFC 7807 problem details, request/response JSON schemas, and cURL commands.
- **[Security & Identity Guide (`docs/SECURITY_GUIDE.md`)](docs/SECURITY_GUIDE.md)**: BFF pattern, HttpOnly SameSite cookie sessions, Sliding Session window, Keycloak 26 OIDC, Microsoft Entra ID (Azure AD), and RBAC personas.
- **[Operations & Runbook (`docs/OPERATIONS_RUNBOOK.md`)](docs/OPERATIONS_RUNBOOK.md)**: Single-command Docker Compose, hybrid local dev mode, port allocation matrix, Prometheus scraping, Grafana dashboards, Jaeger walkthrough, and disaster recovery.
- **[Master Project Handbook (`docs/PROJECT_HANDBOOK.md`)](docs/PROJECT_HANDBOOK.md)**: Elevator pitch, Stage Tracker (1–8), Architectural Decision Records (ADR-001 through ADR-014), and interview Q&A flashcards.
- **[Implementation Roadmap (`docs/TODO.md`)](docs/TODO.md)**: Completed milestone checklist (Phases 1–11) and future roadmap (Testcontainers, SLA auto-escalation, Kubernetes manifests).

---

## 📄 License
This project is licensed under the [Apache License 2.0](LICENSE).
