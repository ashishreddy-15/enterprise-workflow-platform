# Operations & Production Runbook — Enterprise Workflow Platform

## 1. Prerequisites & Environment Configuration

### 1.1 Host Requirements
| Component | Minimum Version | Verification Command |
|---|---|---|
| **Docker Engine & Compose** | `v26.0+` | `docker --version; docker compose version` |
| **Java JDK** | `21.0+` (Eclipse Adoptium) | `java -version` |
| **Apache Maven** | `3.9+` | `mvn -v` |
| **Node.js & npm** | `v20.0+` (Node 22 recommended) | `node -v; npm -v` |

### 1.2 Environment Variables (`.env`)
Before launching the platform, verify your `.env` file exists (copied from `.env.example`):
```bash
cp .env.example .env
cp .env.example docker/.env
```

Key environment properties:
- `POSTGRES_USER=ewp_user`, `POSTGRES_PASSWORD=ewp_secret_pass_2026`, `POSTGRES_DB=workflow_db`
- `MONGO_INITDB_ROOT_USERNAME=admin`, `MONGO_INITDB_ROOT_PASSWORD=mongo_secret_pass_2026`
- `REDIS_PASSWORD=ewp_redis_pass_2026`
- `KEYCLOAK_ADMIN=admin`, `KEYCLOAK_ADMIN_PASSWORD=admin`
- `JWT_SECRET=super-secret-jwt-key-for-workflow-platform-2026-min-32-chars`
- `SESSION_IDLE_TIMEOUT_MINUTES=60`, `SESSION_MAX_LIFESPAN_HOURS=8`, `SESSION_RENEW_THRESHOLD_MINUTES=15`
- `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID` (Optional: for Microsoft SSO)

---

## 2. Complete Port Allocation Matrix

| Service | Container Name | Host Port | Protocol / Transport | Purpose & Health Check Command |
|---|---|---|---|---|
| **Frontend Nginx** | `ewp-frontend` | `80`, `4200`-`4203` | HTTP | Unified Proxy (`:80`), Shell (`:4200`), Workflow MFE (`:4201`), Analytics MFE (`:4202`), Template MFE (`:4203`) |
| **API Gateway (BFF)** | `ewp-api-gateway` | `8080` | HTTP / WebFlux | Gateway & Session Manager; `curl http://localhost:8080/actuator/health` |
| **Workflow Engine** | `ewp-workflow-service` | `8081` | HTTP / Spring MVC | Core workflow aggregate; `curl http://localhost:8081/workflows/actuator/health` |
| **Audit Analytics** | `ewp-audit-analytics-service` | `8082` | HTTP / Spring MVC | CQRS consumer; `curl http://localhost:8082/analytics/actuator/health` |
| **Template Service** | `ewp-template-service` | `8083` | HTTP / Spring MVC | Form schema catalog; `curl http://localhost:8083/templates/actuator/health` |
| **Keycloak IAM** | `ewp-keycloak` | `8085` | HTTP OIDC | Enterprise IdP; Console at `http://localhost:8085` (`admin`/`admin`) |
| **PostgreSQL 16** | `ewp-postgres` | `5432` | TCP JDBC | Relational store; `pg_isready -U ewp_user -d workflow_db` |
| **MongoDB 7.0** | `ewp-mongodb` | `27017` | TCP MongoDB | Document store; `mongosh --eval "db.adminCommand('ping')"` |
| **Redis 7.2** | `ewp-redis` | `6379` | TCP Redis | Distributed cache; `redis-cli -a ewp_redis_pass_2026 ping` |
| **Apache Kafka 3.8** | `ewp-kafka` | `9092`, `29092` | KRaft PLAINTEXT | Event broker; `9092` (host listener), `29092` (inter-container network) |
| **Prometheus 2.51** | `ewp-prometheus` | `9090` | HTTP | Time-series scraper; Target status at `http://localhost:9090/targets` |
| **Grafana 10.4.1** | `ewp-grafana` | `3000` | HTTP | Telemetry console; `http://localhost:3000` (`admin`/`admin`) |
| **Jaeger All-in-One** | `ewp-jaeger` | `16686`, `4317`, `4318` | HTTP/gRPC | UI (`:16686`), OTLP gRPC (`:4317`), OTLP HTTP span receiver (`:4318`) |

---

## 3. Deployment Modes

### Mode A: Full Containerized Stack (Single Command) ⭐
Builds and starts all 10 containers in the isolated Docker bridge network `ewp-network`:

```powershell
# Build and launch all services in background
docker compose -f docker/docker-compose.full.yml up -d --build

# Verify all containers are Up and Healthy
docker compose -f docker/docker-compose.full.yml ps

# Tail aggregated logs
docker compose -f docker/docker-compose.full.yml logs -f
```

### Mode B: Hybrid Local Development Mode
Runs databases, Kafka, and telemetry in Docker while running Spring Boot microservices and Angular dev servers directly on your host machine:

#### 1. Start Backing Infrastructure:
```powershell
docker compose -f docker/docker-compose.infra.yml up -d
```

#### 2. Start Backend Microservices (Separate Terminals):
```powershell
cd backend
mvn -pl template-service spring-boot:run        # Port 8083
mvn -pl workflow-service spring-boot:run        # Port 8081
mvn -pl audit-analytics-service spring-boot:run # Port 8082
mvn -pl api-gateway spring-boot:run             # Port 8080
```

#### 3. Start Frontend MFEs (Separate Terminals from `frontend/`):
```powershell
cd frontend
npm run start:shell       # Port 4200
npm run start:workflow    # Port 4201
npm run start:analytics   # Port 4202
npm run start:template    # Port 4203
```

---

## 4. Observability & Distributed Tracing Operations

### 4.1 Prometheus Metric Verification (`http://localhost:9090`)
- Navigate to **Status $\rightarrow$ Targets** (`http://localhost:9090/targets`).
- All 4 scrape endpoints must display state **UP (1/1)**:
  - `api-gateway` (`api-gateway:8080/actuator/prometheus`)
  - `workflow-service` (`workflow-service:8081/workflows/actuator/prometheus`)
  - `template-service` (`template-service:8083/templates/actuator/prometheus`)
  - `audit-analytics-service` (`audit-analytics-service:8082/analytics/actuator/prometheus`)

### 4.2 Grafana Pre-Provisioned Dashboards (`http://localhost:3000`)
Log in with credentials `admin` / `admin`. Open the **Platform Overview** dashboard under the **Platform** folder to monitor:
1. **Throughput (RPS by Application)**: Real-time request velocity per microservice.
2. **p95 / p99 Latency**: Detects tail latency spikes and slow downstream database queries.
3. **HTTP 4xx / 5xx Error Rates**: Identifies authentication failures or server errors.
4. **Active JVM Virtual Threads**: Tracks Project Loom carrier thread mounting and concurrency utilization.
5. **JVM Heap Utilization %**: Monitors GC pressure across all Spring Boot containers.

### 4.3 Jaeger Distributed Tracing Walkthrough (`http://localhost:16686`)
To trace an end-to-end request across network and broker boundaries:
1. Open **[http://localhost:16686](http://localhost:16686)**.
2. In the **Service** dropdown, select `api-gateway` or `workflow-service`.
3. Click **Find Traces**.
4. Click on any trace to inspect the waterfall breakdown:
   - **Span 1 (`api-gateway`)**: Spring Cloud Gateway routing filter and auth verification.
   - **Span 2 (`workflow-service`)**: HTTP execution of `transitionWorkflow()` and PostgreSQL transaction commit.
   - **Span 3 (`workflow-service`)**: `OutboxScheduler` Kafka producer send.
   - **Span 4 (`audit-analytics-service`)**: `WorkflowEventConsumer` Kafka consumer execution, MongoDB idempotency check, and CQRS view update.

---

## 5. Kafka Topic & Event Stream Operations

### 5.1 Inspect Active Kafka Topics
```powershell
docker exec -it ewp-kafka /opt/kafka/bin/kafka-topics.sh \
  --bootstrap-server localhost:9092 --list
```
*Expected Topics*: `workflow-events`, `workflow-events-retry-1000`, `workflow-events-retry-2000`, `workflow-events-dlt`, `workflow-sla-alerts`.

### 5.2 Monitor Consumer Group Lag
```powershell
docker exec -it ewp-kafka /opt/kafka/bin/kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 \
  --describe --group audit-analytics-group
```
Verify `LAG` is `0` or near zero during steady-state processing.

### 5.3 Dead-Letter Queue (DLT) Replay & Remediation
When messages land in `workflow-events-dlt`, inspect them via consumer console:
```powershell
docker exec -it ewp-kafka /opt/kafka/bin/kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic workflow-events-dlt \
  --from-beginning
```
To re-queue failed outbox events from the database:
```bash
curl -X POST http://localhost:8080/workflows/api/v1/admin/outbox/replay-failed \
  -H "Authorization: Bearer <ADMIN_JWT>"
```

---

## 6. Keycloak IAM Administration (`http://localhost:8085`)

1. Open **`http://localhost:8085`** and sign in with `admin` / `admin`.
2. Select the **`ewp`** realm from the top-left dropdown.
3. **Users & Credentials**:
   - Navigate to **Users** to inspect existing accounts: `ashish`, `admin.sys`, `meera.legal`, `rahul.finance`.
   - Click any user $\rightarrow$ **Role mapping** to view or modify assigned enterprise roles.
4. **Sessions**:
   - Navigate to **Sessions** to view active user sessions, token life, and revoke access on demand.

---

## 7. Disaster Recovery: Backup & Restore

### 7.1 PostgreSQL Backup & Restore (`workflow_db`)
```powershell
# Create backup
docker exec -t ewp-postgres pg_dump -U ewp_user workflow_db > backup_workflow_db.sql

# Restore from backup
cat backup_workflow_db.sql | docker exec -i ewp-postgres psql -U ewp_user -d workflow_db
```

### 7.2 MongoDB Backup & Restore (`template_db` & `audit_db`)
```powershell
# Create backup archive
docker exec -t ewp-mongodb mongodump -u admin -p mongo_secret_pass_2026 --authenticationDatabase admin --archive=/data/db_backup.archive

# Copy archive to host
docker cp ewp-mongodb:/data/db_backup.archive ./mongo_backup.archive

# Restore archive
docker exec -i ewp-mongodb mongorestore -u admin -p mongo_secret_pass_2026 --authenticationDatabase admin --archive=/data/db_backup.archive --drop
```

---

## 8. Troubleshooting Guide

| Symptom | Probable Cause | Corrective Action |
|---|---|---|
| **No services appear in Jaeger UI** | OpenTelemetry base endpoint misconfigured or missing starter. | Verify `spring-boot-starter-opentelemetry` is in POMs and `OTEL_EXPORTER_OTLP_ENDPOINT: http://jaeger:4318` in `docker-compose.full.yml`. |
| **HTTP 409 Conflict on Step Approval** | Optimistic lock collision (concurrent update) or editing a published template. | In UI, refresh task details to obtain the latest `@Version` and retry. Published templates cannot be modified directly; branch a new draft version. |
| **Kafka Connection Refused in Local Mode** | Microservice attempting to connect to internal container listener `kafka:29092`. | In local dev mode, set `SPRING_KAFKA_BOOTSTRAP_SERVERS: localhost:9092`. |
| **Spotless Check Fails in CI** | Unformatted Java code committed. | Run `mvn spotless:apply` from `backend/` directory, commit changes, and push. |
| **CORS Error on Micro-Frontend Fetch** | Request origin not matched in Gateway `allowedOriginPatterns`. | Ensure caller origin is listed under `spring.cloud.gateway.server.webflux.globalcors` in `api-gateway/src/main/resources/application.yml`. |
| **401 Unauthorized Redirect to Login** | Session expired due to 60-minute idle inactivity or 8-hour max lifespan cutoff. | Re-authenticate via Keycloak SSO or select a developer persona on the login screen. |
