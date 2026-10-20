package com.ashish.workflow.service;

import com.ashish.workflow.contracts.dto.TemplateDefinitionResponse;
import com.ashish.workflow.domain.entity.WorkflowInstance;
import com.ashish.workflow.repository.WorkflowRepository;
import com.ashish.workflow.security.UserContext;
import tools.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
public class TaskService {

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
            OffsetDateTime updatedAt
    ) {}

    public List<TaskInboxItem> getTasksForUser(UserContext caller) {
        List<WorkflowInstance> activeWorkflows = workflowRepository.findAllActiveWorkflows();
        List<TaskInboxItem> inbox = new ArrayList<>();

        for (WorkflowInstance workflow : activeWorkflows) {
            TemplateDefinitionResponse snapshot = objectMapper.readValue(
                    workflow.getTemplateSnapshot(),
                    TemplateDefinitionResponse.class
            );

            String currentState = workflow.getCurrentState();
            TemplateDefinitionResponse.StepDefinitionDto currentStep = snapshot.steps().get(currentState);

            if (currentStep == null || currentStep.isTerminal()) {
                continue;
            }

            String scope = currentStep.actorScope() != null ? currentStep.actorScope().toUpperCase() : "ANY";
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
                }
            } else {
                // "ANY" scope
                isEligible = true;
            }

            if (isEligible) {
                inbox.add(new TaskInboxItem(
                        workflow.getId(),
                        workflow.getTemplateId(),
                        workflow.getTitle(),
                        workflow.getRequesterId(),
                        currentState,
                        currentStep.stepName(),
                        scope,
                        currentStep.requiredRole(),
                        workflow.getUpdatedAt()
                ));
            }
        }

        return inbox;
    }
}