package com.ashish.workflow.service;

import com.ashish.workflow.contracts.dto.TemplateDefinitionResponse;
import com.ashish.workflow.domain.entity.WorkflowInstance;
import com.ashish.workflow.domain.entity.WorkflowTask;
import com.ashish.workflow.repository.WorkflowRepository;
import com.ashish.workflow.security.UserContext;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

@Service
@Transactional(readOnly = true)
public class TaskService {

    private static final Logger log = LoggerFactory.getLogger(TaskService.class);

    private final WorkflowRepository workflowRepository;
    private final ObjectMapper objectMapper;

    public TaskService(WorkflowRepository workflowRepository, ObjectMapper objectMapper) {
        this.workflowRepository = workflowRepository;
        this.objectMapper = objectMapper;
    }

    public record TaskActivity(
            UUID id,
            int stepOrder,
            String stepName,
            String taskType,
            String completedBy,
            String status,
            String comments,
            OffsetDateTime actedAt) {}

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
            OffsetDateTime updatedAt,
            Map<String, Object> contextData,
            List<TaskActivity> taskHistory) {}

    public List<TaskInboxItem> getTasksForUser(UserContext caller) {
        log.debug("Fetching task inbox for user: '{}', roles: {}", caller.userId(), caller.roles());
        List<WorkflowInstance> activeWorkflows = workflowRepository.findAllActiveWorkflows();
        List<TaskInboxItem> inbox = new ArrayList<>();

        log.debug("Evaluating {} active workflows for user '{}' eligibility", activeWorkflows.size(), caller.userId());
        for (WorkflowInstance workflow : activeWorkflows) {
            TemplateDefinitionResponse snapshot = parseSnapshot(workflow);
            if (snapshot == null) continue;

            String currentState = workflow.getCurrentState();
            TemplateDefinitionResponse.StepDefinitionDto currentStep =
                    snapshot.steps() != null ? snapshot.steps().get(currentState) : null;

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

            boolean isInitialStep =
                    (snapshot.initialState() != null && currentState.equalsIgnoreCase(snapshot.initialState()))
                            || currentStep.stepOrder() == 1;
            boolean isApprovalStep =
                    currentStep.stepType() == null || "APPROVAL".equalsIgnoreCase(currentStep.stepType());

            if ("REQUESTER".equals(scope)) {
                if (workflow.getRequesterId().equalsIgnoreCase(caller.userId())) {
                    isEligible = true;
                }
            } else if ("ROLE".equals(scope)) {
                if (isApprovalStep
                        && !isInitialStep
                        && workflow.getRequesterId().equalsIgnoreCase(caller.userId())) {
                    log.debug(
                            "SoD: user '{}' is the requester of workflow {} and cannot approve role-restricted task",
                            caller.userId(),
                            workflow.getId());
                } else {
                    String requiredRole = currentStep.requiredRole();
                    if (requiredRole == null || requiredRole.isBlank() || caller.hasRole(requiredRole)) {
                        isEligible = true;
                    }
                }
            } else {
                isEligible = true;
            }

            if (isEligible) {
                inbox.add(mapToInboxItem(workflow, currentStep));
            }
        }

        log.debug("Returning {} eligible tasks for user '{}'", inbox.size(), caller.userId());
        return inbox;
    }

    public List<TaskInboxItem> getParticipatedTasks(UserContext caller) {
        log.debug("Fetching participated tasks for user: '{}'", caller.userId());
        List<WorkflowInstance> list = workflowRepository.findParticipatedByUser(caller.userId());
        return list.stream().map(this::mapToInboxItem).toList();
    }

    public List<TaskInboxItem> getInitiatedTasks(UserContext caller) {
        log.debug("Fetching initiated tasks for user: '{}'", caller.userId());
        List<WorkflowInstance> list = workflowRepository.findByRequesterIdOrderByUpdatedAtDesc(caller.userId());
        return list.stream().map(this::mapToInboxItem).toList();
    }

    public List<TaskInboxItem> getAllTasks() {
        log.debug("Fetching all tasks across platform");
        List<WorkflowInstance> list = workflowRepository.findAllWithTasks();
        return list.stream().map(this::mapToInboxItem).toList();
    }

    private TemplateDefinitionResponse parseSnapshot(WorkflowInstance workflow) {
        if (workflow.getTemplateSnapshot() == null
                || workflow.getTemplateSnapshot().isBlank()) {
            return null;
        }
        try {
            return objectMapper.readValue(workflow.getTemplateSnapshot(), TemplateDefinitionResponse.class);
        } catch (Exception e) {
            log.warn("Failed to parse template snapshot for workflow {}: {}", workflow.getId(), e.getMessage());
            return null;
        }
    }

    private TaskInboxItem mapToInboxItem(WorkflowInstance workflow) {
        TemplateDefinitionResponse snapshot = parseSnapshot(workflow);
        TemplateDefinitionResponse.StepDefinitionDto currentStep = null;
        if (snapshot != null && snapshot.steps() != null) {
            currentStep = snapshot.steps().get(workflow.getCurrentState());
        }
        return mapToInboxItem(workflow, currentStep);
    }

    private TaskInboxItem mapToInboxItem(
            WorkflowInstance workflow, TemplateDefinitionResponse.StepDefinitionDto currentStep) {
        String currentState = workflow.getCurrentState();
        String currentStepName =
                currentStep != null && currentStep.stepName() != null ? currentStep.stepName() : currentState;
        String scope = currentStep != null && currentStep.actorScope() != null ? currentStep.actorScope() : "ANY";
        String requiredRole = currentStep != null ? currentStep.requiredRole() : null;

        List<TaskActivity> history = workflow.getTasks() != null
                ? workflow.getTasks().stream()
                        .filter(t -> t.getStatus() != null && !t.getStatus().equalsIgnoreCase("PENDING"))
                        .sorted(Comparator.comparing(WorkflowTask::getStepOrder))
                        .map(t -> new TaskActivity(
                                t.getId(),
                                t.getStepOrder(),
                                t.getStepName(),
                                t.getTaskType(),
                                t.getCompletedBy(),
                                t.getStatus(),
                                t.getComments(),
                                t.getActedAt()))
                        .toList()
                : List.of();

        return new TaskInboxItem(
                workflow.getId(),
                workflow.getTemplateId(),
                workflow.getTitle(),
                workflow.getRequesterId(),
                currentState,
                currentStepName,
                scope,
                requiredRole,
                workflow.getCurrentStepDueAt(),
                workflow.isSlaBreached(),
                workflow.getUpdatedAt(),
                workflow.getContextData() != null ? workflow.getContextData() : Map.of(),
                history);
    }
}
