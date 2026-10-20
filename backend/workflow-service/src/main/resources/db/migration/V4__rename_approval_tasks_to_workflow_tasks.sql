-- Rename the table
ALTER TABLE approval_tasks RENAME TO workflow_tasks;

-- Rename approver_id to completed_by (clearer audit attribution)
ALTER TABLE workflow_tasks RENAME COLUMN approver_id TO completed_by;

-- Add task_type to match the template step definition
ALTER TABLE workflow_tasks ADD COLUMN task_type VARCHAR(64) NOT NULL DEFAULT 'APPROVAL';

-- Update indexes
DROP INDEX IF EXISTS idx_tasks_workflow_id;
DROP INDEX IF EXISTS idx_tasks_status_role;

CREATE INDEX idx_wf_tasks_workflow_id ON workflow_tasks(workflow_id);
CREATE INDEX idx_wf_tasks_status_role ON workflow_tasks(status, assigned_role);

