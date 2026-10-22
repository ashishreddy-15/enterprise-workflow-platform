# API Reference & Documentation Guide

The Enterprise Workflow Platform provides interactive documentation, OpenAPI 3 specifications, and standardized REST endpoints across all microservices.

---

## 1. Interactive API Consoles

### 🌟 Unified Scalar Console (Recommended)
You can explore and test every API interactively with live request execution, automatic schema validation, and multi-language code snippets (curl, JavaScript, Python, Java, Go) using the unified Scalar console:

👉 **URL**: **`http://localhost:8080/scalar`** (or **`http://localhost/scalar`** when running via Nginx)

In the top header dropdown, you can switch between services:
- **API Gateway & Auth**: Authentication sessions, persona minting, token verification
- **Workflow Service**: State transitions, approvals/rejections, and dynamic task inbox
- **Template Service**: Step DAG schemas, workflow authoring, validation, and publishing
- **Audit & Analytics Service**: Chronological event logs and SLA compliance metrics

### 📖 Classic Swagger UI (Alternative)
For traditional Swagger UI:
- **API Gateway**: `http://localhost:8080/swagger-ui.html`
- **Template Service**: `http://localhost:8083/templates/swagger-ui.html`
- **Workflow Service**: `http://localhost:8081/workflows/swagger-ui.html`
- **Audit Service**: `http://localhost:8082/analytics/swagger-ui.html`

### 📄 Raw OpenAPI 3 JSON Specs
- Gateway Spec: `http://localhost:8080/v3/api-docs`
- Template Spec: `http://localhost:8080/templates/v3/api-docs`
- Workflow Spec: `http://localhost:8080/workflows/v3/api-docs`
- Analytics Spec: `http://localhost:8080/analytics/v3/api-docs`

---

## 2. Authentication & Session APIs (`/auth/**`)

All endpoints support authentication via either **`Authorization: Bearer <jwt>`** header or the **`ewp_access_token`** `HttpOnly` cookie.

### `POST /auth/dev-token`
Generates a signed JWT session cookie for the specified persona.

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
*Note: Sets an `HttpOnly`, `SameSite=Lax` cookie named `ewp_access_token`.*

---

### `GET /auth/me`
Returns the current authenticated user's identity and authorities.

**Response (`200 OK`):**
```json
{
  "userId": "sarah.manager",
  "roles": ["ROLE_MANAGER", "ROLE_APPROVER"]
}
```

---

### `POST /auth/logout`
Invalidates the current session by expiring the `ewp_access_token` cookie.

**Response (`200 OK`):**
```json
{
  "status": "logged_out"
}
```

---

## 3. Template Service APIs (`/templates/api/v1/templates/**`)

### `POST /templates/api/v1/templates`
Creates a new draft workflow template with step DAG validation.

**Request Body:**
```json
{
  "templateKey": "PURCHASE_ORDER_V1",
  "name": "Purchase Order Approval",
  "description": "Standard corporate procurement workflow",
  "initialState": "SUBMIT_PO",
  "states": {
    "SUBMIT_PO": {
      "type": "DOCUMENT_SUBMISSION",
      "assignedTo": "SUBMITTER",
      "timeLimitHours": 24,
      "transitions": ["MANAGER_REVIEW"]
    },
    "MANAGER_REVIEW": {
      "type": "APPROVAL",
      "assignedTo": "ROLE_MANAGER",
      "timeLimitHours": 48,
      "transitions": ["APPROVED", "REJECTED"]
    },
    "APPROVED": {
      "type": "TERMINAL",
      "isTerminal": true
    },
    "REJECTED": {
      "type": "TERMINAL",
      "isTerminal": true
    }
  }
}
```

---

### `PUT /templates/api/v1/templates/{key}/versions/{ver}/publish`
Publishes a draft template, making it active for initiating new workflow instances.

**Response (`200 OK`):**
```json
{
  "templateKey": "PURCHASE_ORDER_V1",
  "version": 1,
  "status": "PUBLISHED"
}
```

---

### `GET /templates/api/v1/templates`
Retrieves all template blueprints.

**Query Parameters:**
- `status` (*optional*): `ALL` (default), `PUBLISHED`, `DRAFT`.

---

## 4. Workflow Service APIs (`/workflows/api/v1/**`)

### `POST /workflows/api/v1/workflows`
Starts a new instance of a published workflow template.

**Request Body:**
```json
{
  "templateKey": "PURCHASE_ORDER_V1",
  "templateVersion": 1,
  "businessKey": "PO-2026-0091",
  "initiatedBy": "alex.submitter",
  "payload": {
    "vendor": "Acme Supplies",
    "amount": 15000.00,
    "currency": "USD"
  }
}
```

**Response (`201 Created`):**
```json
{
  "workflowId": "c8d41a7e-4091-4e78-9844-32b781a7db90",
  "currentState": "SUBMIT_PO",
  "status": "RUNNING",
  "createdAt": "2026-10-22T10:00:00Z"
}
```

---

### `POST /workflows/api/v1/tasks/{taskId}/approve`
Approves the current task and advances the workflow state machine.

**Request Body:**
```json
{
  "decision": "APPROVED",
  "comments": "Budget approved for Q4 equipment replenishment.",
  "decidedBy": "sarah.manager"
}
```

---

### `POST /workflows/api/v1/tasks/{taskId}/reject`
Rejects the workflow task, transitioning to the defined rejection state.

---

### `GET /workflows/api/v1/tasks/inbox`
Retrieves pending tasks assigned to the current user or user's roles with dynamic filtering.

**Query Parameters:**
- `status`: `PENDING`, `COMPLETED`, `OVERDUE`
- `role`: Filter by authority role (e.g., `ROLE_MANAGER`)
- `page`: Page index (default: `0`)
- `size`: Page size (default: `20`)

---

## 5. Audit & Analytics APIs (`/analytics/api/v1/analytics/**`)

### `GET /analytics/api/v1/analytics/workflows/{id}/timeline`
Returns the immutable chronological history of all state transitions and decisions for a workflow instance.

---

### `GET /analytics/api/v1/analytics/sla-metrics`
Returns aggregated SLA compliance metrics across all workflow templates.

**Response (`200 OK`):**
```json
{
  "totalWorkflows": 142,
  "withinSlaCount": 138,
  "breachedSlaCount": 4,
  "complianceRate": 97.18,
  "avgCompletionHours": 14.6
}
```

---

## 6. Standard Error Format (RFC 7807 Problem Details)

All errors returned by the platform follow RFC 7807:

```json
{
  "type": "https://api.ewp.ashish.com/errors/sla-breached",
  "title": "Invalid State Transition",
  "status": 409,
  "detail": "Workflow 'PO-2026-0091' cannot transition from 'MANAGER_REVIEW' to 'ARCHIVED'.",
  "instance": "/workflows/api/v1/tasks/402/approve",
  "timestamp": "2026-10-22T10:14:22Z"
}
```
