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
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
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
    private final SpelRuleEvaluator spelRuleEvaluator;

    public WorkflowService(
            WorkflowRepository workflowRepository,
            OutboxRepository outboxRepository,
            TemplateServiceClient templateServiceClient,
            ObjectMapper objectMapper,
            SpelRuleEvaluator spelRuleEvaluator) {
        this.workflowRepository = workflowRepository;
        this.outboxRepository = outboxRepository;
        this.templateServiceClient = templateServiceClient;
        this.objectMapper = objectMapper;
        this.spelRuleEvaluator = spelRuleEvaluator;
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

        // 2. Spawn initial generic or parallel WorkflowTasks
        StepDefinitionDto initialStep = template.steps().get(template.initialState());
        calculateAndApplySla(workflow, initialStep);
        if (initialStep != null && !initialStep.isTerminal()) {
            List<WorkflowTask> initialTasks = spawnTasksForStep(initialStep);
            for (WorkflowTask t : initialTasks) {
                workflow.addTask(t);
                log.debug(
                        "Spawned initial task '{}' (order: {}, assignedRole: {})",
                        t.getStepName(),
                        t.getStepOrder(),
                        t.getAssignedRole());
            }
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
                || (currentStep.transitions().isEmpty()
                        && currentStep.conditionalTransitions().isEmpty())) {
            throw new IllegalStateException("Workflow is already in a terminal state: " + previousState);
        }

        // Active pending tasks check
        List<WorkflowTask> pendingTasks = workflow.getTasks().stream()
                .filter(t -> "PENDING".equalsIgnoreCase(t.getStatus()))
                .toList();

        if (pendingTasks.isEmpty()) {
            throw new IllegalStateException("No pending tasks available for workflow in state: " + previousState);
        }

        // --- STRICT SCOPE, RBAC, FORK-JOIN & SEGREGATION OF DUTIES CHECK ---
        String scope =
                currentStep.actorScope() != null ? currentStep.actorScope().toUpperCase() : "ANY";
        boolean isInitialStep =
                (snapshot.initialState() != null && previousState.equalsIgnoreCase(snapshot.initialState()))
                        || currentStep.stepOrder() == 1;
        boolean isApprovalStep = currentStep.stepType() == null
                || "APPROVAL".equalsIgnoreCase(currentStep.stepType())
                || "PARALLEL_APPROVAL".equalsIgnoreCase(currentStep.stepType());

        WorkflowTask taskToComplete = null;

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
            taskToComplete = pendingTasks.get(0);
        } else if ("PARALLEL_ROLES".equals(scope)
                || (!currentStep.requiredRoles().isEmpty()
                        && currentStep.requiredRoles().size() > 1)) {
            // Segregation of Duties: Requester cannot approve their own request on approval steps
            if (isApprovalStep && !isInitialStep && workflow.getRequesterId().equalsIgnoreCase(actorId)) {
                log.warn(
                        "Segregation of Duties violation on workflow {}: Requester '{}' cannot approve their own request on step '{}'",
                        workflowId,
                        actorId,
                        previousState);
                throw new SecurityException("Segregation of Duties violation: Requester (" + actorId
                        + ") cannot approve their own request on step '" + previousState + "'.");
            }

            // Match pending task with caller's assigned roles
            for (WorkflowTask pending : pendingTasks) {
                if (pending.getAssignedRole() != null && caller.hasRole(pending.getAssignedRole())) {
                    taskToComplete = pending;
                    break;
                }
            }

            if (taskToComplete == null) {
                List<String> remainingRoles = pendingTasks.stream()
                        .map(WorkflowTask::getAssignedRole)
                        .filter(r -> r != null && !r.isBlank())
                        .toList();
                log.warn(
                        "Access Denied on workflow {}: Step '{}' requires sign-off from pending roles {}, but caller '{}' holds {}",
                        workflowId,
                        previousState,
                        remainingRoles,
                        actorId,
                        caller.roles());
                throw new SecurityException("Access Denied: Step '" + previousState
                        + "' requires sign-off from pending roles " + remainingRoles
                        + ", but caller holds " + caller.roles());
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
            if (isApprovalStep && !isInitialStep && workflow.getRequesterId().equalsIgnoreCase(actorId)) {
                log.warn(
                        "Segregation of Duties violation on workflow {}: Requester '{}' cannot approve their own request on step '{}'",
                        workflowId,
                        actorId,
                        previousState);
                throw new SecurityException("Segregation of Duties violation: Requester (" + actorId
                        + ") cannot approve their own request on step '" + previousState + "'.");
            }

            taskToComplete = pendingTasks.get(0);
        } else {
            // "ANY" scope
            taskToComplete = pendingTasks.get(0);
        }
        // -------------------------------------------------------------------

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

        // Variables map for SpEL condition evaluation
        Map<String, Object> evaluationVariables = new HashMap<>();
        if (workflow.getContextData() != null) {
            evaluationVariables.putAll(workflow.getContextData());
        }
        if (payload != null) {
            evaluationVariables.putAll(payload);
        }

        String normalizedAction = action.trim().toUpperCase();
        boolean isRejection = normalizedAction.contains("REJECT")
                || normalizedAction.contains("CANCEL")
                || normalizedAction.contains("DECLINE");

        // Complete caller's assigned task
        taskToComplete.complete(normalizedAction, actorId, comments);
        log.info(
                "Completed task '{}' (order: {}, role: {}) by '{}' with action '{}'",
                taskToComplete.getStepName(),
                taskToComplete.getStepOrder(),
                taskToComplete.getAssignedRole(),
                actorId,
                normalizedAction);

        // CASE 1: REJECTION (Immediately cancels any sibling pending tasks and advances to terminal/rejection state)
        if (isRejection) {
            for (WorkflowTask sibling : pendingTasks) {
                if (sibling != taskToComplete && "PENDING".equalsIgnoreCase(sibling.getStatus())) {
                    sibling.complete("CANCELLED", actorId, "Cancelled due to rejection by " + actorId);
                    log.info("Cancelled sibling task id={} for role '{}'", sibling.getId(), sibling.getAssignedRole());
                }
            }

            String newState = spelRuleEvaluator.resolveNextState(currentStep, normalizedAction, evaluationVariables);
            if (newState == null) {
                throw new IllegalArgumentException(
                        "Action '" + normalizedAction + "' not allowed from '" + previousState + "'. Allowed: "
                                + currentStep.transitions().keySet());
            }

            log.info("Workflow {} rejected from '{}' -> '{}'", workflowId, previousState, newState);
            workflow.setCurrentState(newState);
            workflow.setUpdatedAt(OffsetDateTime.now());
            workflow.setCurrentStepDueAt(null);
            workflow.setSlaBreached(false);

            WorkflowInstance saved = workflowRepository.save(workflow);

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
                    previousState,
                    newState,
                    actorId,
                    comments,
                    Instant.now(),
                    eventMetadata);
            saveOutboxEvent(saved, event);
            return saved;
        }

        // CASE 2: FORK-JOIN CHECK - Check if other parallel tasks are still PENDING for this step
        List<WorkflowTask> remainingPending = workflow.getTasks().stream()
                .filter(t -> "PENDING".equalsIgnoreCase(t.getStatus()))
                .toList();

        if (!remainingPending.isEmpty()) {
            List<String> awaitingRoles = remainingPending.stream()
                    .map(WorkflowTask::getAssignedRole)
                    .filter(r -> r != null && !r.isBlank())
                    .toList();

            log.info(
                    "Workflow {} fork-join step '{}': sign-off recorded by role '{}'. Awaiting remaining roles: {}",
                    workflowId,
                    previousState,
                    taskToComplete.getAssignedRole(),
                    awaitingRoles);

            workflow.setUpdatedAt(OffsetDateTime.now());
            WorkflowInstance saved = workflowRepository.save(workflow);

            Map<String, String> eventMetadata = new HashMap<>();
            eventMetadata.put("action", normalizedAction);
            eventMetadata.put(
                    "role", taskToComplete.getAssignedRole() != null ? taskToComplete.getAssignedRole() : "UNKNOWN");
            eventMetadata.put("parallelJoinStatus", "PARTIAL");
            eventMetadata.put("remainingRoles", String.join(",", awaitingRoles));
            if (payload != null) {
                payload.forEach((k, v) -> eventMetadata.put("payload_" + k, String.valueOf(v)));
            }

            WorkflowTransitionedEvent event = new WorkflowTransitionedEvent(
                    UUID.randomUUID(),
                    saved.getId(),
                    saved.getTemplateId(),
                    previousState,
                    previousState, // Stays in current state awaiting remaining sign-offs
                    actorId,
                    comments != null && !comments.isBlank()
                            ? comments
                            : "Partial sign-off completed by " + taskToComplete.getAssignedRole(),
                    Instant.now(),
                    eventMetadata);
            saveOutboxEvent(saved, event);
            return saved;
        }

        // CASE 3: JOIN SATISFIED (or single-party step) - Resolve next state via SpEL rules or static transitions
        String newState = spelRuleEvaluator.resolveNextState(currentStep, normalizedAction, evaluationVariables);
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

        // Spawn next tasks if non-terminal
        StepDefinitionDto nextStepDef = snapshot.steps().get(newState);
        calculateAndApplySla(workflow, nextStepDef);
        boolean isNextTerminal = nextStepDef == null
                || nextStepDef.isTerminal()
                || (nextStepDef.transitions().isEmpty()
                        && nextStepDef.conditionalTransitions().isEmpty());

        if (!isNextTerminal) {
            List<WorkflowTask> nextTasks = spawnTasksForStep(nextStepDef);
            for (WorkflowTask nextTask : nextTasks) {
                workflow.addTask(nextTask);
                log.debug(
                        "Spawned next task '{}' (order: {}, requiredRole: {}) for workflow {}",
                        nextTask.getStepName(),
                        nextTask.getStepOrder(),
                        nextTask.getAssignedRole(),
                        workflowId);
            }
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
                previousState,
                newState,
                actorId,
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

    private List<WorkflowTask> spawnTasksForStep(StepDefinitionDto step) {
        List<WorkflowTask> tasks = new ArrayList<>();
        List<String> requiredRoles = step.requiredRoles();

        if (requiredRoles != null && requiredRoles.size() > 1) {
            // Fork: Spawn a separate WorkflowTask for each required approver role
            for (String role : requiredRoles) {
                WorkflowTask task = new WorkflowTask();
                task.setStepOrder(step.stepOrder());
                task.setStepName(step.stepName());
                task.setTaskType(step.stepType() != null ? step.stepType() : "PARALLEL_APPROVAL");
                task.setAssignedRole(role);
                task.setStatus("PENDING");
                tasks.add(task);
            }
        } else {
            // Standard single task
            WorkflowTask task = new WorkflowTask();
            task.setStepOrder(step.stepOrder());
            task.setStepName(step.stepName());
            task.setTaskType(step.stepType() != null ? step.stepType() : "APPROVAL");
            String assignedRole = null;
            if (requiredRoles != null && requiredRoles.size() == 1) {
                assignedRole = requiredRoles.get(0);
            } else if ("ROLE".equalsIgnoreCase(step.actorScope())
                    || "PARALLEL_ROLES".equalsIgnoreCase(step.actorScope())) {
                assignedRole = step.requiredRole();
            }
            task.setAssignedRole(assignedRole);
            task.setStatus("PENDING");
            tasks.add(task);
        }

        return tasks;
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
