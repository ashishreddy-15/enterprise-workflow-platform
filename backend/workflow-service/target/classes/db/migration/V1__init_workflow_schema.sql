-- V1__init_workflow_schema.sql

CREATE TABLE workflow_instances (
    id UUID PRIMARY KEY,
    template_id VARCHAR(64) NOT NULL,
    requester_id VARCHAR(128) NOT NULL,
    title VARCHAR(255) NOT NULL,
    current_state VARCHAR(50) NOT NULL,
    priority VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
    version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE approval_tasks (
    id UUID PRIMARY KEY,
    workflow_id UUID NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
    step_order INT NOT NULL,
    assigned_role VARCHAR(64) NOT NULL,
    approver_id VARCHAR(128),
    status VARCHAR(30) NOT NULL,
    comments TEXT,
    acted_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE outbox_events (
    id UUID PRIMARY KEY,
    aggregate_type VARCHAR(100) NOT NULL,
    aggregate_id VARCHAR(100) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    retry_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_workflow_state_priority ON workflow_instances(current_state, priority);
CREATE INDEX idx_outbox_pending ON outbox_events(status, created_at) WHERE status = 'PENDING';