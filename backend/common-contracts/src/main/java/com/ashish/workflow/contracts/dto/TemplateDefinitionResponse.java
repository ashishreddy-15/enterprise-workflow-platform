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

    public record ConditionalTransitionDto(String action, String condition, String targetState, int priority) {

        public ConditionalTransitionDto(String action, String condition, String targetState) {
            this(action, condition, targetState, 0);
        }
    }

    public record StepDefinitionDto(
            int stepOrder,
            String stepName,
            String stepType, // e.g. "DOCUMENT_SUBMISSION", "APPROVAL", "MANUAL_TASK", "PARALLEL_APPROVAL"
            String actorScope, // "REQUESTER", "ROLE", "PARALLEL_ROLES", "ANY"
            String requiredRole, // Checked when actorScope == "ROLE"
            List<String> requiredPayloadKeys, // e.g. ["panCardUrl", "gstCertificateUrl"]
            boolean isTerminal, // true if workflow ends upon entering this state
            Integer slaHours, // Nullable: null or 0 means no SLA deadline
            Map<String, String> transitions, // Fallback static Action -> Target State
            List<ConditionalTransitionDto> conditionalTransitions, // SpEL dynamic conditional transitions
            List<String> requiredRoles // For PARALLEL_ROLES multi-party sign-offs
            ) {

        public StepDefinitionDto(
                int stepOrder,
                String stepName,
                String stepType,
                String actorScope,
                String requiredRole,
                List<String> requiredPayloadKeys,
                boolean isTerminal,
                Integer slaHours,
                Map<String, String> transitions) {
            this(
                    stepOrder,
                    stepName,
                    stepType,
                    actorScope,
                    requiredRole,
                    requiredPayloadKeys,
                    isTerminal,
                    slaHours,
                    transitions,
                    List.of(),
                    List.of());
        }

        @Override
        public Map<String, String> transitions() {
            return transitions != null ? transitions : Map.of();
        }

        @Override
        public List<ConditionalTransitionDto> conditionalTransitions() {
            return conditionalTransitions != null ? conditionalTransitions : List.of();
        }

        @Override
        public List<String> requiredRoles() {
            return requiredRoles != null ? requiredRoles : List.of();
        }
    }
}
