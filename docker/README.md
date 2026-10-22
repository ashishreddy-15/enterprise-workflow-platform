# Quick Start: Full Platform with Docker Compose

This platform can be spun up completely in containerized mode using Docker Compose.

---

## 1. Prerequisites
- Docker Engine & Docker Compose (v2.20+)

---

## 2. Launching the Entire Platform (Zero Local Setup)

Run the unified compose file with `--build`. Docker will automatically compile all Java backend microservices and Angular MFEs using multi-stage builds with BuildKit caching:

```powershell
docker compose -f docker/docker-compose.full.yml up -d --build
```

To view live aggregated logs:
```powershell
docker compose -f docker/docker-compose.full.yml logs -f
```

---

## 4. Running Infrastructure Only (For Local Java Dev/Debugging)

If you are developing inside an IDE (IntelliJ / VS Code) and want to run the microservices locally against real backing stores:

```powershell
docker compose -f docker/docker-compose.infra.yml up -d
```

This starts:
- **PostgreSQL 16** on `:5432` (`workflow_db`)
- **MongoDB 7.0** on `:27017` (`template_db`, `audit_db`)
- **Redis 7.2** on `:6379`
- **Apache Kafka 3.8 (KRaft mode)** on `:9092` (host) and `:29092` (internal)

---

## 5. Port Allocations & Services

| Service | Port | Healthcheck / Health Endpoint |
|---|---|---|
| **Shell (Host App)** | `4200` / `80` | `http://localhost:4200` or `http://localhost` |
| **Workflow MFE** | `4201` | `http://localhost:4201/remoteEntry.json` |
| **Analytics MFE** | `4202` | `http://localhost:4202/remoteEntry.json` |
| **Template MFE** | `4203` | `http://localhost:4203/remoteEntry.json` |
| **API Gateway** | `8080` | `http://localhost:8080/actuator/health` |
| **Workflow Service** | `8081` | `http://localhost:8081/workflows/actuator/health` |
| **Audit Analytics Service** | `8082` | `http://localhost:8082/analytics/actuator/health` |
| **Template Service** | `8083` | `http://localhost:8083/templates/actuator/health` |
| **PostgreSQL** | `5432` | `pg_isready -U ewp_user -d workflow_db` |
| **MongoDB** | `27017` | `mongosh --eval "db.adminCommand('ping')"` |
| **Redis** | `6379` | `redis-cli ping` |
| **Kafka (KRaft)** | `9092` (host), `29092` (container) | Native broker listener |

---

## 6. Teardown

To stop all services:
```powershell
docker compose -f docker/docker-compose.full.yml down
```

To stop and remove all persisted database volumes:
```powershell
docker compose -f docker/docker-compose.full.yml down -v
```
