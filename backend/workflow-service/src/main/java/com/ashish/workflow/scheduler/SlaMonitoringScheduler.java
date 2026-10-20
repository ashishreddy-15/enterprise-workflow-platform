package com.ashish.workflow.scheduler;

import com.ashish.workflow.contracts.dto.TemplateDefinitionResponse;
import com.ashish.workflow.contracts.events.WorkflowSlaBreachedEvent;
import com.ashish.workflow.domain.entity.OutboxEvent;
import com.ashish.workflow.domain.entity.WorkflowInstance;
import com.ashish.workflow.repository.OutboxRepository;
import com.ashish.workflow.repository.WorkflowRepository;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

@Component
public class SlaMonitoringScheduler {

    private static final Logger log = LoggerFactory.getLogger(SlaMonitoringScheduler.class);

    private final WorkflowRepository workflowRepository;
    private final OutboxRepository outboxRepository;
    private final ObjectMapper objectMapper;

    public SlaMonitoringScheduler(
            WorkflowRepository workflowRepository, OutboxRepository outboxRepository, ObjectMapper objectMapper) {
        this.workflowRepository = workflowRepository;
        this.outboxRepository = outboxRepository;
        this.objectMapper = objectMapper;
    }

    /**
     * Runs every 30 seconds to detect breached SLAs.
     * Uses DB-independent JPQL pessimistic locking to prevent duplicate processing across distributed instances.
     */
    @Scheduled(fixedDelay = 30000)
    @Transactional
    public void scanAndEscalateSlaBreaches() {
        OffsetDateTime now = OffsetDateTime.now();
        List<WorkflowInstance> breachedWorkflows =
                workflowRepository.findBreachedWorkflowsForUpdate(now, PageRequest.of(0, 50));

        if (breachedWorkflows.isEmpty()) {
            return;
        }

        log.warn("Detected {} workflow instance(s) breaching step SLA deadlines.", breachedWorkflows.size());

        for (WorkflowInstance workflow : breachedWorkflows) {
            try {
                TemplateDefinitionResponse snapshot =
                        objectMapper.readValue(workflow.getTemplateSnapshot(), TemplateDefinitionResponse.class);

                TemplateDefinitionResponse.StepDefinitionDto currentStep =
                        snapshot.steps().get(workflow.getCurrentState());
                String role = currentStep != null ? currentStep.requiredRole() : null;

                // 1. Mark workflow as breached to avoid duplicate notifications
                workflow.setSlaBreached(true);
                workflowRepository.save(workflow);

                // 2. Build the SLA breached domain event
                WorkflowSlaBreachedEvent event = new WorkflowSlaBreachedEvent(
                        UUID.randomUUID(),
                        workflow.getId(),
                        workflow.getTemplateId(),
                        workflow.getCurrentState(),
                        role,
                        workflow.getRequesterId(),
                        workflow.getCurrentStepDueAt(),
                        now);

                // 3. Stage into transactional outbox
                OutboxEvent outboxEvent = new OutboxEvent();
                outboxEvent.setAggregateType("WORKFLOW");
                outboxEvent.setAggregateId(workflow.getId().toString());
                outboxEvent.setEventType("WorkflowSlaBreachedEvent");
                outboxEvent.setPayload(objectMapper.writeValueAsString(event));
                outboxEvent.setStatus("PENDING");
                outboxEvent.setCreatedAt(OffsetDateTime.now());

                outboxRepository.save(outboxEvent);

                log.info("Staged WorkflowSlaBreachedEvent to outbox for workflowId={}", workflow.getId());
            } catch (Exception e) {
                log.error("Failed to process SLA breach for workflowId={}", workflow.getId(), e);
            }
        }
    }
}
