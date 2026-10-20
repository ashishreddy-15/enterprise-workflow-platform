package com.ashish.workflow.dto;

import java.util.Map;

public record TransitionWorkflowRequest(
        String action, // Any template-defined action: "SUBMIT_DOCS", "APPROVE", "REQUEST_REWORK"
        String actorId, // User performing the action
        String comments, // Optional audit notes
        Map<String, Object> payload // Optional key-value inputs (e.g. {"gstCertUrl": "https://..."})
        ) {}
