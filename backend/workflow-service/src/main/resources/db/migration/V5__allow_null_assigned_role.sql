-- Allow assigned_role to be NULL for requester/user tasks
ALTER TABLE workflow_tasks
ALTER COLUMN assigned_role DROP NOT NULL;