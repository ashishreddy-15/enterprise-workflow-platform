package com.ashish.workflow.service;

import com.ashish.workflow.contracts.dto.TemplateDefinitionResponse;
import com.ashish.workflow.domain.entity.WorkflowInstance;
import com.ashish.workflow.repository.WorkflowRepository;
import com.ashish.workflow.security.UserContext;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import tools.jackson.databind.ObjectMapper;

@Service
public class TaskService {

    private static final Logger log = LoggerFactory.getLogger(TaskService.class);

    private final WorkflowRepository workflowRepository;
    private final ObjectMapper objectMapper;

    public TaskService(WorkflowRepository workflowRepository, ObjectMapper objectMapper) {
        this.workflowRepository = workflowRepository;
        this.objectMapper = objectMapper;
    }

    public record TaskInboxItem(
            UUID workflowId,
            String templateId,
            String title,
            String requesterId,
            String currentState,
            String currentStepName,
            String actorScope,
            String requiredRole,
            OffsetDateTime currentStepDueAt,
            boolean slaBreached,
            OffsetDateTime updatedAt) {}

    public List<TaskInboxItem> getTasksForUser(UserContext caller) {
        log.debug("Fetching task inbox for user: '{}', roles: {}", caller.userId(), caller.roles());
        List<WorkflowInstance> activeWorkflows = workflowRepository.findAllActiveWorkflows();
        List<TaskInboxItem> inbox = new ArrayList<>();

        log.debug("Evaluating {} active workflows for user '{}' eligibility", activeWorkflows.size(), caller.userId());
        for (WorkflowInstance workflow : activeWorkflows) {
            TemplateDefinitionResponse snapshot =
                    objectMapper.readValue(workflow.getTemplateSnapshot(), TemplateDefinitionResponse.class);

            String currentState = workflow.getCurrentState();
            TemplateDefinitionResponse.StepDefinitionDto currentStep =
                    snapshot.steps().get(currentState);

            if (currentStep == null || currentStep.isTerminal()) {
                log.debug(
                        "Skipping workflow {} - state '{}' is terminal or has no step definition",
                        workflow.getId(),
                        currentState);
                continue;
            }

            String scope =
                    currentStep.actorScope() != null ? currentStep.actorScope().toUpperCase() : "ANY";
            boolean isEligible = false;

            if ("REQUESTER".equals(scope)) {
                // Task is waiting on the original requester
                if (workflow.getRequesterId().equalsIgnoreCase(caller.userId())) {
                    isEligible = true;
                }
            } else if ("ROLE".equals(scope)) {
                // Task is waiting on a specific role, AND the caller is NOT the requester (SoD check)
                if (!workflow.getRequesterId().equalsIgnoreCase(caller.userId())) {
                    String requiredRole = currentStep.requiredRole();
                    if (requiredRole == null || requiredRole.isBlank() || caller.hasRole(requiredRole)) {
                        isEligible = true;
                    }
                } else {
                    log.warn(
                            "SoD violation: user '{}' is the requester of workflow {} and cannot action ROLE-scoped task",
                            caller.userId(),
                            workflow.getId());
                }
            } else {
                // "ANY" scope
                isEligible = true;
            }

            if (isEligible) {
                log.debug(
                        "User '{}' is eligible for workflow {} (scope: {}, role: {})",
                        caller.userId(),
                        workflow.getId(),
                        scope,
                        currentStep.requiredRole());
                inbox.add(new TaskInboxItem(
                        workflow.getId(),
                        workflow.getTemplateId(),
                        workflow.getTitle(),
                        workflow.getRequesterId(),
                        currentState,
                        currentStep.stepName(),
                        scope,
                        currentStep.requiredRole(),
                        workflow.getCurrentStepDueAt(),
                        workflow.isSlaBreached(),
                        workflow.getUpdatedAt()));
            }
        }

        log.debug("Returning {} eligible tasks for user '{}'", inbox.size(), caller.userId());
        return inbox;
    }
}
