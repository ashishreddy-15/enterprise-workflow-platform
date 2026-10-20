ALTER TABLE workflow_instances ADD COLUMN IF NOT EXISTS current_step_due_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE workflow_instances ADD COLUMN IF NOT EXISTS sla_breached BOOLEAN DEFAULT FALSE NOT NULL;

CREATE INDEX IF NOT EXISTS idx_workflow_sla_pending ON workflow_instances (current_step_due_at)
WHERE sla_breached = FALSE AND current_step_due_at IS NOT NULL;
