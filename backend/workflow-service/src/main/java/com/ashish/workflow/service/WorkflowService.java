package com.ashish.workflow.service;

import com.ashish.workflow.client.TemplateServiceClient;
import com.ashish.workflow.contracts.dto.TemplateDefinitionResponse;
import com.ashish.workflow.contracts.dto.TemplateDefinitionResponse.StepDefinitionDto;
import com.ashish.workflow.contracts.events.WorkflowTransitionedEvent;
import com.ashish.workflow.domain.entity.OutboxEvent;
import com.ashish.workflow.domain.entity.WorkflowInstance;
import com.ashish.workflow.domain.entity.WorkflowTask;
import com.ashish.workflow.repository.OutboxRepository;
import com.ashish.workflow.repository.WorkflowRepository;
import com.ashish.workflow.security.UserContext;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

@Service
public class WorkflowService {

    private static final Logger log = LoggerFactory.getLogger(WorkflowService.class);

    private final WorkflowRepository workflowRepository;
    private final OutboxRepository outboxRepository;
    private final TemplateServiceClient templateServiceClient;
    private final ObjectMapper objectMapper;

    public WorkflowService(
            WorkflowRepository workflowRepository,
            OutboxRepository outboxRepository,
            TemplateServiceClient templateServiceClient,
            ObjectMapper objectMapper) {
        this.workflowRepository = workflowRepository;
        this.outboxRepository = outboxRepository;
        this.templateServiceClient = templateServiceClient;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public WorkflowInstance createAndTransitWorkflow(String templateKey, String requesterId, String title) {
        log.info(
                "Creating workflow instance - templateKey: '{}', requesterId: '{}', title: '{}'",
                templateKey,
                requesterId,
                title);

        // 1. Fetch active published blueprint from template-service
        TemplateDefinitionResponse template = templateServiceClient
                .getActivePublishedTemplate(templateKey)
                .orElseThrow(
                        () -> new IllegalArgumentException("No active published template found for: " + templateKey));

        log.debug(
                "Loaded template definition '{}' v{} with initial state '{}'",
                templateKey,
                template.version(),
                template.initialState());

        String serializedSnapshot = objectMapper.writeValueAsString(template);

        WorkflowInstance workflow = new WorkflowInstance();
        workflow.setTemplateId(templateKey);
        workflow.setTemplateVersion(template.version());
        workflow.setTemplateSnapshot(serializedSnapshot);
        workflow.setRequesterId(requesterId);
        workflow.setTitle(title);
        workflow.setCurrentState(template.initialState());
        workflow.setCreatedAt(OffsetDateTime.now());
        workflow.setUpdatedAt(OffsetDateTime.now());

        // 2. Spawn initial generic WorkflowTask
        StepDefinitionDto initialStep = template.steps().get(template.initialState());
        calculateAndApplySla(workflow, initialStep);
        if (initialStep != null && !initialStep.isTerminal()) {
            WorkflowTask initialTask = buildTaskFromStep(initialStep);
            workflow.addTask(initialTask);
            log.debug(
                    "Spawned initial task '{}' (scope: {}, requiredRole: {})",
                    initialStep.stepName(),
                    initialStep.actorScope(),
                    initialStep.requiredRole());
        }

        WorkflowInstance saved = workflowRepository.save(workflow);
        log.info(
                "Workflow instance created successfully - workflowId: {}, state: '{}'",
                saved.getId(),
                saved.getCurrentState());

        // 3. Stage Outbox Event
        WorkflowTransitionedEvent event = new WorkflowTransitionedEvent(
                UUID.randomUUID(),
                saved.getId(),
                templateKey,
                "INITIAL", // previousState
                saved.getCurrentState(), // nextState (e.g. "AWAITING_KYC_DOCS")
                requesterId, // actorId
                "Workflow created from template v" + template.version(),
                Instant.now(),
                Map.of("templateName", template.name(), "templateVersion", String.valueOf(template.version())));

        saveOutboxEvent(saved, event);

        return saved;
    }

    private void saveOutboxEvent(WorkflowInstance saved, WorkflowTransitionedEvent event) {
        OutboxEvent outbox = new OutboxEvent();
        outbox.setAggregateType("WORKFLOW");
        outbox.setAggregateId(saved.getId().toString());
        outbox.setEventType("WorkflowTransitionedEvent");
        outbox.setPayload(objectMapper.writeValueAsString(event));
        outbox.setStatus("PENDING");
        outbox.setCreatedAt(OffsetDateTime.now());
        outboxRepository.save(outbox);
        log.debug(
                "Staged outbox event id={} for aggregateId={} (event: {})",
                outbox.getId(),
                saved.getId(),
                outbox.getEventType());
    }

    @Transactional
    public WorkflowInstance transitionWorkflow(
            UUID workflowId, String action, UserContext caller, String comments, Map<String, Object> payload) {

        String actorId = caller.userId();
        log.info(
                "Processing workflow transition - workflowId: {}, action: '{}', actorId: '{}'",
                workflowId,
                action,
                actorId);

        WorkflowInstance workflow = workflowRepository
                .findById(workflowId)
                .orElseThrow(() -> new IllegalArgumentException("Workflow not found: " + workflowId));

        TemplateDefinitionResponse snapshot =
                objectMapper.readValue(workflow.getTemplateSnapshot(), TemplateDefinitionResponse.class);

        String previousState = workflow.getCurrentState();
        StepDefinitionDto currentStep = snapshot.steps().get(previousState);

        if (currentStep == null) {
            throw new IllegalStateException("Current state '" + previousState + "' not found in snapshot.");
        }

        if (currentStep.isTerminal()
                || currentStep.transitions() == null
                || currentStep.transitions().isEmpty()) {
            throw new IllegalStateException("Workflow is already in a terminal state: " + previousState);
        }

        // --- STRICT SCOPE, RBAC & SEGREGATION OF DUTIES CHECK ---
        String scope =
                currentStep.actorScope() != null ? currentStep.actorScope().toUpperCase() : "ANY";

        if ("REQUESTER".equals(scope)) {
            if (!workflow.getRequesterId().equalsIgnoreCase(actorId)) {
                log.warn(
                        "Access Denied: Workflow {} step '{}' can only be performed by requester '{}', but caller is '{}'",
                        workflowId,
                        previousState,
                        workflow.getRequesterId(),
                        actorId);
                throw new SecurityException("Access Denied: Step '" + previousState
                        + "' can only be performed by the requester (" + workflow.getRequesterId() + ").");
            }
        } else if ("ROLE".equals(scope)) {
            // 1. Role Enforcement: Caller must hold the step's requiredRole
            String requiredRole = currentStep.requiredRole();
            if (requiredRole != null && !requiredRole.isBlank() && !caller.hasRole(requiredRole)) {
                log.warn(
                        "Access Denied on workflow {}: Step '{}' requires role '{}', but caller '{}' holds roles {}",
                        workflowId,
                        previousState,
                        requiredRole,
                        actorId,
                        caller.roles());
                throw new SecurityException("Access Denied: Step '" + previousState + "' requires role '" + requiredRole
                        + "', but caller holds " + caller.roles());
            }

            // 2. Segregation of Duties: Requester cannot approve their own request on approval steps
            boolean isInitialStep = (snapshot.initialState() != null
                            && previousState.equalsIgnoreCase(snapshot.initialState()))
                    || currentStep.stepOrder() == 1;
            boolean isApprovalStep = currentStep.stepType() == null
                    || "APPROVAL".equalsIgnoreCase(currentStep.stepType());

            if (isApprovalStep && !isInitialStep && workflow.getRequesterId().equalsIgnoreCase(actorId)) {
                log.warn(
                        "Segregation of Duties violation on workflow {}: Requester '{}' cannot approve their own request on step '{}'",
                        workflowId,
                        actorId,
                        previousState);
                throw new SecurityException("Segregation of Duties violation: Requester (" + actorId
                        + ") cannot approve their own request on step '" + previousState + "'.");
            }
        }
        // --------------------------------------------------------

        // Required Payload Validation
        if (currentStep.requiredPayloadKeys() != null
                && !currentStep.requiredPayloadKeys().isEmpty()) {
            if (payload == null) {
                throw new IllegalArgumentException(
                        "Missing required payload keys: " + currentStep.requiredPayloadKeys());
            }
            for (String requiredKey : currentStep.requiredPayloadKeys()) {
                Object val = payload.get(requiredKey);
                if (val == null || val.toString().isBlank()) {
                    throw new IllegalArgumentException(
                            "Missing required key '" + requiredKey + "' for step '" + previousState + "'.");
                }
            }
        }

        // Merge payload into contextData
        if (payload != null && !payload.isEmpty()) {
            if (workflow.getContextData() == null) {
                workflow.setContextData(new HashMap<>());
            }
            workflow.getContextData().putAll(payload);
        }

        // Resolve next state
        String normalizedAction = action.trim().toUpperCase();
        String newState = currentStep.transitions().get(normalizedAction);
        if (newState == null) {
            throw new IllegalArgumentException("Action '" + normalizedAction + "' not allowed from '" + previousState
                    + "'. Allowed: " + currentStep.transitions().keySet());
        }

        log.info(
                "Transitioning workflow {} from '{}' -> '{}' via action '{}'",
                workflowId,
                previousState,
                newState,
                normalizedAction);

        // Complete the active pending task
        workflow.getTasks().stream()
                .filter(t -> "PENDING".equals(t.getStatus()))
                .findFirst()
                .ifPresent(task -> {
                    task.complete(normalizedAction, actorId, comments);
                    log.debug(
                            "Completed task '{}' (order: {}) for workflow {}",
                            task.getStepName(),
                            task.getStepOrder(),
                            workflowId);
                });

        // Spawn next task if non-terminal
        StepDefinitionDto nextStepDef = snapshot.steps().get(newState);
        calculateAndApplySla(workflow, nextStepDef);
        boolean isNextTerminal = nextStepDef == null
                || nextStepDef.isTerminal()
                || nextStepDef.transitions() == null
                || nextStepDef.transitions().isEmpty();

        if (!isNextTerminal) {
            WorkflowTask nextTask = buildTaskFromStep(nextStepDef);
            workflow.addTask(nextTask);
            log.debug(
                    "Spawned next task '{}' (order: {}, requiredRole: {}) for workflow {}",
                    nextStepDef.stepName(),
                    nextStepDef.stepOrder(),
                    nextStepDef.requiredRole(),
                    workflowId);
        } else {
            log.info("Workflow {} has reached terminal state '{}'", workflowId, newState);
        }

        workflow.setCurrentState(newState);
        workflow.setUpdatedAt(OffsetDateTime.now());
        WorkflowInstance saved = workflowRepository.save(workflow);

        // Stage Outbox Event
        Map<String, String> eventMetadata = new HashMap<>();
        eventMetadata.put("action", normalizedAction);
        eventMetadata.put("stepType", currentStep.stepType() != null ? currentStep.stepType() : "STANDARD");
        eventMetadata.put("version", String.valueOf(saved.getVersion()));
        if (payload != null) {
            payload.forEach((k, v) -> eventMetadata.put("payload_" + k, String.valueOf(v)));
        }

        WorkflowTransitionedEvent event = new WorkflowTransitionedEvent(
                UUID.randomUUID(),
                saved.getId(),
                saved.getTemplateId(),
                previousState, // previousState
                newState, // nextState
                actorId, // actorId
                comments,
                Instant.now(),
                eventMetadata);

        saveOutboxEvent(saved, event);
        log.info(
                "Workflow {} transition successfully persisted. Current state: '{}'",
                saved.getId(),
                saved.getCurrentState());
        return saved;
    }

    private WorkflowTask buildTaskFromStep(StepDefinitionDto step) {
        WorkflowTask task = new WorkflowTask();
        task.setStepOrder(step.stepOrder());
        task.setStepName(step.stepName());
        task.setTaskType(step.stepType() != null ? step.stepType() : "APPROVAL");
        task.setAssignedRole("ROLE".equalsIgnoreCase(step.actorScope()) ? step.requiredRole() : null);
        task.setStatus("PENDING");
        return task;
    }

    private void calculateAndApplySla(WorkflowInstance instance, StepDefinitionDto nextStep) {
        instance.setSlaBreached(false);
        if (nextStep != null && nextStep.slaHours() != null && nextStep.slaHours() > 0 && !nextStep.isTerminal()) {
            instance.setCurrentStepDueAt(OffsetDateTime.now().plusHours(nextStep.slaHours()));
        } else {
            instance.setCurrentStepDueAt(null);
        }
    }
}
