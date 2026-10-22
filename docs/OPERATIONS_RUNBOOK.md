# Operations & Deployment Runbook

This runbook provides complete operational instructions for running, monitoring, and troubleshooting the Enterprise Workflow Platform.

---

## 1. Prerequisites

| Component | Minimum Version | Verification Command |
|---|---|---|
| **Docker Engine & Compose** | `v26.0+` | `docker --version` |
| **Java JDK** | `21.0+` (Eclipse Adoptium) | `java -version` |
| **Apache Maven** | `3.9+` | `mvn -v` |
| **Node.js & npm** | `v20.0+` (Node 22 recommended) | `node -v; npm -v` |

---

## 2. Deployment Modes

### Mode A: Full Containerized Stack (Single Command) ⭐

Builds and starts all infrastructure, backend microservices, and Nginx frontend MFEs directly in Docker using multi-stage builds (no local Java or Node installation required):

```powershell
docker compose -f docker/docker-compose.full.yml up -d --build
```

To tail live aggregated logs:
```powershell
docker compose -f docker/docker-compose.full.yml logs -f
```

To stop all containers:
```powershell
docker compose -f docker/docker-compose.full.yml down
```

To stop and wipe all persisted databases/volumes:
```powershell
docker compose -f docker/docker-compose.full.yml down -v
```

---

### Mode B: Hybrid Local Development Mode

Runs databases and Kafka in Docker while running Spring Boot microservices and Angular dev servers locally:

#### 1. Start Backing Infrastructure:
```powershell
docker compose -f docker/docker-compose.infra.yml up -d
```

#### 2. Start Microservices:
In 4 separate terminals:
```powershell
# Terminal 1: Template Service (:8083)
cd backend; mvn -pl template-service spring-boot:run

# Terminal 2: Workflow Service (:8081)
cd backend; mvn -pl workflow-service spring-boot:run

# Terminal 3: Audit Analytics Service (:8082)
cd backend; mvn -pl audit-analytics-service spring-boot:run

# Terminal 4: API Gateway (:8080)
cd backend; mvn -pl api-gateway spring-boot:run
```

#### 3. Start Frontend MFEs:
In 4 separate terminals (from `frontend/` directory):
```powershell
npm run start:shell       # Port 4200
npm run start:workflow    # Port 4201
npm run start:analytics   # Port 4202
npm run start:template    # Port 4203
```

---

## 3. Port Allocations & Endpoints

| Service | Port | Endpoint URL | Health Check |
|---|---|---|---|
| **Shell Application** | `4200` / `80` | `http://localhost:4200` or `http://localhost` | Browser HTTP 200 |
| **Workflow MFE** | `4201` | `http://localhost:4201/remoteEntry.json` | JSON Manifest |
| **Analytics MFE** | `4202` | `http://localhost:4202/remoteEntry.json` | JSON Manifest |
| **Template MFE** | `4203` | `http://localhost:4203/remoteEntry.json` | JSON Manifest |
| **API Gateway** | `8080` | `http://localhost:8080` | `http://localhost:8080/actuator/health` |
| **Scalar API Console** | `8080` / `80` | `http://localhost:8080/scalar` | Interactive UI |
| **Workflow Engine** | `8081` | `http://localhost:8081/workflows` | `http://localhost:8081/workflows/actuator/health` |
| **Audit Analytics** | `8082` | `http://localhost:8082/analytics` | `http://localhost:8082/analytics/actuator/health` |
| **Template Service** | `8083` | `http://localhost:8083/templates` | `http://localhost:8083/templates/actuator/health` |
| **PostgreSQL 16** | `5432` | `localhost:5432` | `pg_isready -U ewp_user -d workflow_db` |
| **MongoDB 7.0** | `27017` | `localhost:27017` | `mongosh --eval "db.adminCommand('ping')"` |
| **Redis 7.2** | `6379` | `localhost:6379` | `redis-cli -a ewp_redis_pass ping` |
| **Kafka (KRaft)** | `9092` / `29092` | `localhost:9092` (host) | Native KRaft broker listener |

---

## 4. Troubleshooting & Diagnostics

### Q: Kafka broker connection timeout on startup
* **Symptom**: `Connection to node -1 (localhost/127.0.0.1:9092) could not be established. Broker may not be available.`
* **Solution**: Ensure the Kafka container is healthy via `docker ps`. If the volume metadata was corrupted by an abrupt shutdown, reset the Kafka volume:
  ```powershell
  docker compose -f docker/docker-compose.full.yml stop kafka
  docker volume rm docker_kafka_data
  docker compose -f docker/docker-compose.full.yml up -d kafka
  ```

### Q: CORS error when fetching from `http://localhost`
* **Symptom**: `Access to fetch ... has been blocked by CORS policy: Response to preflight request doesn't pass access control check`
* **Solution**: Ensure `api-gateway` has recompiled with the updated `allowedOriginPatterns` (`http://localhost`, `http://localhost:*`, `http://127.0.0.1:*`). Rebuild the gateway container:
  ```powershell
  docker compose -f docker/docker-compose.full.yml up -d --build api-gateway
  ```

### Q: Spotless formatting failure during Maven build
* **Symptom**: `Execution of spotless failed: The following files had format violations`
* **Solution**: Run Spotless automated formatting before compiling:
  ```powershell
  cd backend; mvn spotless:apply; cd ..
  ```
