# API Reference & REST Catalog — Enterprise Workflow Platform

## 1. Overview & Interactive Documentation

The Enterprise Workflow Platform provides standardized, production-ready REST APIs across all microservices with:
- **RFC 7807 Problem Details** for consistent error reporting.
- **W3C TraceContext** header propagation (`traceparent`, `tracestate`).
- **Dual Authentication**: Accepts `HttpOnly` session cookie (`ewp_access_token`) or `Authorization: Bearer <jwt>` header.
- **Embedded Interactive Consoles**: Interactive API exploration via **Scalar** and **Swagger UI**.

---

## 2. Interactive Consoles & OpenAPI 3.1 Specs

### 🌟 Unified Scalar Console (Recommended)
Scalar aggregates the OpenAPI 3.1 specifications of all microservices into an interactive, multi-language documentation console with live request execution and code generators (cURL, JavaScript, TypeScript, Python, Java, Go):

👉 **URL**: **`http://localhost:8080/scalar`** (or **`http://localhost/scalar`** via Nginx)

In the top service selector, switch between:
1. **API Gateway & Auth**: Session introspection, persona minting, and logout.
2. **Workflow Engine**: Instance creation, dynamic task inbox, state transitions, and outbox operations.
3. **Template Service**: Workflow blueprint definitions, version history, and publishing.
4. **Audit & Analytics**: Chronological audit trails and CQRS materialized workflow summaries.

### 📖 Classic Swagger UI Endpoints
- **API Gateway**: `http://localhost:8080/swagger-ui.html`
- **Workflow Service**: `http://localhost:8081/workflows/swagger-ui.html`
- **Template Service**: `http://localhost:8083/templates/swagger-ui.html`
- **Audit Analytics**: `http://localhost:8082/analytics/swagger-ui.html`

### 📄 Raw OpenAPI 3.1 JSON Schemas
- Gateway: `http://localhost:8080/v3/api-docs`
- Workflow Service: `http://localhost:8080/workflows/v3/api-docs`
- Template Service: `http://localhost:8080/templates/v3/api-docs`
- Audit Analytics: `http://localhost:8080/analytics/v3/api-docs`

---

## 3. Standard Error Response Model (RFC 7807)

All microservices return errors formatted according to **RFC 7807 Problem Details**:

```json
{
  "type": "https://api.workflow.enterprise/errors/conflict",
  "title": "Optimistic Lock Conflict",
  "status": 409,
  "detail": "Workflow instance 8f2b1a03-71a4-4f9e-a0e2-6581d9f4e21a was updated by another user. Please refresh and try again.",
  "instance": "/workflows/api/v1/workflows/8f2b1a03-71a4-4f9e-a0e2-6581d9f4e21a/transition",
  "timestamp": "2026-10-23T16:15:02.124Z"
}
```

### Standard Status Codes:
- `200 OK`: Request succeeded.
- `201 Created`: Resource successfully created.
- `400 Bad Request`: Validation failure or malformed payload.
- `401 Unauthorized`: Missing or expired authentication credentials.
- `403 Forbidden`: Insufficient role permissions or Segregation of Duties (SoD) violation.
- `404 Not Found`: Target resource does not exist.
- `409 Conflict`: Concurrency conflict (stale `@Version`) or template draft modification conflict.
- `422 Unprocessable Entity`: Missing required dynamic form payload keys for step advancement.

---

## 4. API Gateway Endpoints (`/auth/**`)

Context Path: `/` | Target Service: `api-gateway:8080`

### `POST /auth/login` (Alias: `/auth/dev-token`)
Mints a signed HMAC-SHA256 JWT and attaches it to an `HttpOnly`, `SameSite=Lax`, `Path=/` cookie named `ewp_access_token`.

**Request Body:**
```json
{
  "userId": "sarah.manager",
  "roles": ["ROLE_MANAGER", "ROLE_APPROVER"]
}
```

**Response (`200 OK`):**
```json
{
  "status": "authenticated",
  "userId": "sarah.manager",
  "roles": "ROLE_MANAGER,ROLE_APPROVER",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```
*Response Header: `Set-Cookie: ewp_access_token=...; Max-Age=3600; Path=/; HttpOnly; SameSite=Lax`*

---

### `GET /auth/me`
Introspects the active session from the `ewp_access_token` cookie or `Authorization: Bearer` header and returns current identity and roles.

**Response (`200 OK`):**
```json
{
  "authenticated": true,
  "userId": "sarah.manager",
  "roles": ["ROLE_MANAGER", "ROLE_APPROVER"]
}
```

---

### `POST /auth/logout`
Invalidates the current session by emitting an expired cookie (`Max-Age=0`).

**Response (`200 OK`):**
```json
{
  "status": "logged_out"
}
```

---

## 5. Workflow Engine Endpoints (`/workflows/api/v1/**`)

Context Path: `/workflows` | Target Service: `workflow-service:8081`

### `POST /workflows/api/v1/workflows`
Initiates a new workflow instance from a published blueprint. Automatically freezes a template snapshot, creates the initial workflow task, calculates the step SLA deadline, and commits a transactional outbox event.

**Request Body:**
```json
{
  "templateId": "IT_HARDWARE_PROCUREMENT_V1",
  "title": "MacBook Pro M3 Max for Senior Staff Engineer"
}
```

**Response (`201 Created`):**
```json
{
  "id": "8f2b1a03-71a4-4f9e-a0e2-6581d9f4e21a",
  "templateId": "IT_HARDWARE_PROCUREMENT_V1",
  "templateVersion": 1,
  "requesterId": "david.employee",
  "title": "MacBook Pro M3 Max for Senior Staff Engineer",
  "currentState": "SUBMIT_SPECS",
  "priority": "MEDIUM",
  "version": 0,
  "currentStepDueAt": "2026-10-24T16:15:00Z",
  "slaBreached": false,
  "createdAt": "2026-10-23T16:15:00Z",
  "updatedAt": "2026-10-23T16:15:00Z"
}
```

---

### `GET /workflows/api/v1/workflows`
Dynamic search endpoint leveraging type-safe Spring Data JPA Specifications.

**Query Parameters:**
| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `state` | String | No | Filter by current state (e.g. `PENDING_APPROVAL`, `COMPLETED`). |
| `priority` | String | No | Filter by priority (`LOW`, `MEDIUM`, `HIGH`, `URGENT`). |
| `requesterId` | String | No | Filter by the user who initiated the workflow. |

**Response (`200 OK`):** `List<WorkflowInstance>`

---

### `GET /workflows/api/v1/workflows/{id}`
Retrieves complete workflow instance details, including accumulated context data and the frozen template snapshot.

**Path Parameters:**
- `id` (UUID, Required): Workflow Instance aggregate ID.

**Response (`200 OK`):** `WorkflowResponse`

---

### `POST /workflows/api/v1/workflows/{id}/transition`
Advances a workflow instance through a state transition. Validates caller authority, actor scope, Segregation of Duties (SoD), and required form payload keys.

**Path Parameters:**
- `id` (UUID, Required): Workflow Instance aggregate ID.

**Request Body:**
```json
{
  "action": "APPROVE",
  "comments": "Approved hardware specifications within department Q4 budget allocation.",
  "payload": {
    "equipmentSku": "MBP-M3-MAX-64GB",
    "budgetCode": "ENG-INFRA-2026"
  }
}
```

**Response (`200 OK`):** Updated `WorkflowResponse`  
**Error Codes:**
- `403 Forbidden`: User lacks the required role or attempted to self-approve own request (SoD violation).
- `409 Conflict`: Optimistic locking conflict (another user modified the instance concurrently).
- `422 Unprocessable Entity`: Missing one or more required keys specified in `requiredPayloadKeys`.

---

### `GET /workflows/api/v1/tasks/inbox`
Returns actionable human tasks tailored to the authenticated user.

**Query Parameters:**
| Parameter | Type | Required | Values | Description |
|---|---|:---:|---|---|
| `filter` | String | No | `inbox` (default), `participated`, `initiated`, `all` | `inbox`: Tasks awaiting caller's role approval.<br/>`participated`: Tasks previously acted upon by caller.<br/>`initiated`: Workflows initiated by caller. |

**Response (`200 OK`):**
```json
[
  {
    "taskId": "3e9b11a2-51bc-4011-9a72-f123456789ab",
    "workflowId": "8f2b1a03-71a4-4f9e-a0e2-6581d9f4e21a",
    "workflowTitle": "MacBook Pro M3 Max for Senior Staff Engineer",
    "templateId": "IT_HARDWARE_PROCUREMENT_V1",
    "stepOrder": 2,
    "stepName": "IT Operations Approval",
    "taskType": "APPROVAL",
    "assignedRole": "ROLE_MANAGER",
    "status": "PENDING",
    "priority": "MEDIUM",
    "requesterId": "david.employee",
    "currentStepDueAt": "2026-10-24T16:15:00Z",
    "slaBreached": false,
    "createdAt": "2026-10-23T16:15:00Z"
  }
]
```

---

### `POST /workflows/api/v1/admin/outbox/replay-failed`
Admin endpoint to re-queue all quarantined outbox events (`status = 'FAILED'`) by resetting their status to `PENDING` and `retry_count = 0`.

**Response (`200 OK`):**
```json
{
  "status": "success",
  "requeuedCount": 3,
  "message": "All failed outbox events re-queued for processing"
}
```

---

### `POST /workflows/api/v1/admin/outbox/events/{eventId}/replay`
Admin endpoint to replay a specific failed outbox event.

**Path Parameters:**
- `eventId` (UUID, Required): ID of the target outbox record.

**Response (`200 OK`):**
```json
{
  "status": "success",
  "eventId": "c81d4e2e-bcf2-11e6-869b-7c04d0d1e234",
  "message": "Event re-queued for publishing"
}
```

---

## 6. Template Service Endpoints (`/templates/api/v1/templates/**`)

Context Path: `/templates` | Target Service: `template-service:8083`

### `POST /templates/api/v1/templates`
Creates a new workflow template draft with auto-incremented version number.

**Request Body:**
```json
{
  "templateKey": "IT_HARDWARE_PROCUREMENT_V1",
  "name": "IT Hardware Procurement",
  "description": "Standard procurement workflow for developer hardware",
  "initialState": "SUBMIT_REQUEST",
  "steps": {
    "SUBMIT_REQUEST": {
      "stepOrder": 1,
      "stepName": "Submit Hardware Request",
      "stepType": "DOCUMENT_SUBMISSION",
      "actorScope": "REQUESTER",
      "requiredPayloadKeys": ["hardwareModel", "businessJustification"],
      "isTerminal": false,
      "slaHours": 24,
      "transitions": {
        "SUBMIT": "PENDING_IT_APPROVAL"
      }
    },
    "PENDING_IT_APPROVAL": {
      "stepOrder": 2,
      "stepName": "IT Operations Approval",
      "stepType": "APPROVAL",
      "actorScope": "ROLE",
      "requiredRole": "ROLE_MANAGER",
      "requiredPayloadKeys": [],
      "isTerminal": false,
      "slaHours": 48,
      "transitions": {
        "APPROVE": "COMPLETED",
        "REJECT": "REJECTED"
      }
    },
    "COMPLETED": {
      "stepOrder": 3,
      "stepName": "Procurement Fulfilled",
      "stepType": "TERMINAL",
      "actorScope": "ANY",
      "isTerminal": true,
      "transitions": {}
    },
    "REJECTED": {
      "stepOrder": 4,
      "stepName": "Request Rejected",
      "stepType": "TERMINAL",
      "actorScope": "ANY",
      "isTerminal": true,
      "transitions": {}
    }
  }
}
```

**Response (`201 Created`):** `WorkflowTemplateDocument` (status: `"DRAFT"`, version: `1`)

---

### `PUT /templates/api/v1/templates/{templateKey}/versions/{version}`
Updates a draft template definition. Throws HTTP `409 Conflict` if the specified version is already `PUBLISHED`.

**Path Parameters:**
- `templateKey` (String, Required)
- `version` (int, Required)

**Response (`200 OK`):** Updated `WorkflowTemplateDocument`

---

### `PUT /templates/api/v1/templates/{templateKey}/versions/{version}/publish`
Promotes a template version from `DRAFT` to `PUBLISHED`, freezing it for production usage.

**Path Parameters:**
- `templateKey` (String, Required)
- `version` (int, Required)

**Response (`200 OK`):** Updated `WorkflowTemplateDocument` (status: `"PUBLISHED"`)

---

### `GET /templates/api/v1/templates`
Retrieves templates matching the status filter.

**Query Parameters:**
| Parameter | Type | Required | Values |
|---|---|:---:|---|
| `status` | String | No | `ALL` (default), `DRAFT`, `PUBLISHED` |

**Response (`200 OK`):** `List<WorkflowTemplateDocument>`

---

### `GET /templates/api/v1/templates/{templateKey}`
Fetches the active blueprint for a template key.

**Query Parameters:**
| Parameter | Type | Required | Default | Description |
|---|---|:---:|:---:|---|
| `publishedOnly` | Boolean | No | `false` | When `true`, returns the latest version with status `PUBLISHED`. |

**Response (`200 OK`):** `WorkflowTemplateDocument`

---

### `GET /templates/api/v1/templates/{templateKey}/versions`
Returns the complete version history for a given template key, sorted by version descending.

**Response (`200 OK`):** `List<WorkflowTemplateDocument>`

---

## 7. Audit & Analytics Endpoints (`/analytics/api/v1/**`)

Context Path: `/analytics` | Target Service: `audit-analytics-service:8082`

### `GET /analytics/api/v1/analytics/workflows/{workflowId}`
Fetches the pre-aggregated CQRS read view for a specific workflow instance.

**Path Parameters:**
- `workflowId` (UUID, Required)

**Response (`200 OK`):**
```json
{
  "workflowId": "8f2b1a03-71a4-4f9e-a0e2-6581d9f4e21a",
  "templateId": "IT_HARDWARE_PROCUREMENT_V1",
  "currentState": "PENDING_IT_APPROVAL",
  "transitionCount": 2,
  "lastActorId": "david.employee",
  "lastUpdatedAt": "2026-10-23T16:15:30Z",
  "history": [
    {
      "eventId": "a1b2c3d4-e5f6-7890-1234-56789abcdef0",
      "fromState": "INITIAL",
      "toState": "SUBMIT_REQUEST",
      "actorId": "david.employee",
      "occurredAt": "2026-10-23T16:15:00Z"
    },
    {
      "eventId": "b2c3d4e5-f6a7-8901-2345-6789abcdef01",
      "fromState": "SUBMIT_REQUEST",
      "toState": "PENDING_IT_APPROVAL",
      "actorId": "david.employee",
      "occurredAt": "2026-10-23T16:15:30Z"
    }
  ]
}
```

---

### `GET /analytics/api/v1/analytics/workflows`
Returns pre-joined CQRS views across all workflows, with optional state filtering.

**Query Parameters:**
| Parameter | Type | Required | Description |
|---|---|:---:|---|
| `state` | String | No | Filter by workflow state (e.g. `COMPLETED`). |

**Response (`200 OK`):** `List<WorkflowAnalyticsView>`

---

### `GET /analytics/api/v1/analytics/audit-logs`
Returns a chronological stream of immutable audit logs across all workflows.

**Query Parameters:**
| Parameter | Type | Required | Default | Description |
|---|---|:---:|:---:|---|
| `limit` | Integer | No | `100` | Maximum records to return. |

**Response (`200 OK`):** `List<AuditLogDocument>`

---

### `GET /analytics/api/v1/analytics/audit-logs/{workflowId}`
Returns the immutable chronological audit trail for a single workflow instance.

**Path Parameters:**
- `workflowId` (UUID, Required)

**Response (`200 OK`):** `List<AuditLogDocument>`

---

## 8. cURL Command Reference

### 1. Authenticate & Obtain Session Cookie
```bash
curl -X POST http://localhost:8080/auth/login \
  -H "Content-Type: application/json" \
  -d '{"userId": "sarah.manager", "roles": ["ROLE_MANAGER", "ROLE_APPROVER"]}' \
  -c cookies.txt
```

### 2. Verify Session Identity
```bash
curl -X GET http://localhost:8080/auth/me \
  -b cookies.txt
```

### 3. Initiate a New Workflow Instance
```bash
curl -X POST http://localhost:8080/workflows/api/v1/workflows \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"templateId": "IT_HARDWARE_PROCUREMENT_V1", "title": "Developer Laptop PO"}'
```

### 4. Fetch Pending Task Inbox
```bash
curl -X GET "http://localhost:8080/workflows/api/v1/tasks/inbox?filter=inbox" \
  -b cookies.txt
```

### 5. Transition Workflow Task (Approval)
```bash
curl -X POST http://localhost:8080/workflows/api/v1/workflows/<WORKFLOW_ID>/transition \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "action": "APPROVE",
    "comments": "Approved within Q4 hardware allocation",
    "payload": {"equipmentSku": "MBP-M3-64"}
  }'
```

### 6. Inspect Workflow Analytics & CQRS Timeline
```bash
curl -X GET http://localhost:8080/analytics/api/v1/analytics/workflows/<WORKFLOW_ID> \
  -b cookies.txt
```
