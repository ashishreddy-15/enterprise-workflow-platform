ALTER TABLE workflow_instances
    ADD COLUMN template_version INT NOT NULL DEFAULT 1,
    ADD COLUMN template_snapshot JSONB,
    ADD COLUMN context_data JSONB DEFAULT '{}'::jsonb;