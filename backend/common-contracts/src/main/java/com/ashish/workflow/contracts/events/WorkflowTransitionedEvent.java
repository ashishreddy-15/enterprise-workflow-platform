package com.ashish.workflow.contracts.events;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

public record WorkflowTransitionedEvent(
    UUID eventId,
    UUID workflowId,
    String templateId,
    String actorId,
    String previousState,
    String newState,
    String comments,
    Map<String, Object> metadata,
    Instant occurredAt
) {}