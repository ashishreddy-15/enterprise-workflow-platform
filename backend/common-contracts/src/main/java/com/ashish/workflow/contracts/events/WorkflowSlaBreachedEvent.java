package com.ashish.workflow.contracts.events;

import java.time.OffsetDateTime;
import java.util.UUID;

public record WorkflowSlaBreachedEvent(
        UUID eventId,
        UUID workflowId,
        String templateId,
        String stepName,
        String requiredRole,
        String requesterId,
        OffsetDateTime dueAt,
        OffsetDateTime breachedAt) {}
