package com.ashish.workflow.contracts.dto;

import java.util.List;
import java.util.Map;

public record TemplateDefinitionResponse(
        String id,
        String templateKey,
        int version,
        String name,
        String description,
        String status,
        String initialState,
        Map<String, StepDefinitionDto> steps) {
    public record StepDefinitionDto(
            int stepOrder,
            String stepName,
            String stepType, // e.g. "DOCUMENT_SUBMISSION", "APPROVAL", "MANUAL_TASK"
            String actorScope, // "REQUESTER" (only creator), "ROLE" (enforces SoD), or "ANY"
            String requiredRole, // Checked when actorScope == "ROLE"
            List<String> requiredPayloadKeys, // e.g. ["panCardUrl", "gstCertificateUrl"]
            boolean isTerminal, // true if workflow ends upon entering this state
            Integer slaHours, // Nullable: null or 0 means no SLA deadline
            Map<String, String> transitions // Action -> Target State (e.g. "SUBMIT_DOCS" -> "PENDING_LEGAL")
            ) {}
}
