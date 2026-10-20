package com.ashish.workflow.contracts.events;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

public record WorkflowTransitionedEvent(
        UUID eventId,
        UUID workflowId,
        String templateId,
        String previousState,
        String nextState,
        String actorId,
        String comments,
        Instant occurredAt,
        Map<String, String> metadata
) {}