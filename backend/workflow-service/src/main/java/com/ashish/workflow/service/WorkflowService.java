package com.ashish.workflow.service;

import com.ashish.workflow.contracts.events.WorkflowTransitionedEvent;
import com.ashish.workflow.domain.entity.OutboxEvent;
import com.ashish.workflow.domain.entity.WorkflowInstance;
import com.ashish.workflow.repository.OutboxRepository;
import com.ashish.workflow.repository.WorkflowRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Service
public class WorkflowService {

    private final WorkflowRepository workflowRepository;
    private final OutboxRepository outboxRepository;
    private final ObjectMapper objectMapper;

    public WorkflowService(WorkflowRepository workflowRepository, 
                           OutboxRepository outboxRepository, 
                           ObjectMapper objectMapper) {
        this.workflowRepository = workflowRepository;
        this.outboxRepository = outboxRepository;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public WorkflowInstance createAndTransitWorkflow(String templateId, String requesterId, String title) throws Exception {
        // 1. Save Workflow Instance
        WorkflowInstance workflow = new WorkflowInstance();
        workflow.setTemplateId(templateId);
        workflow.setRequesterId(requesterId);
        workflow.setTitle(title);
        workflow.setCurrentState("PENDING_L1");
        
        WorkflowInstance savedWorkflow = workflowRepository.save(workflow);

        // 2. Create the Domain Event Payload
        UUID eventId = UUID.randomUUID();
        WorkflowTransitionedEvent event = new WorkflowTransitionedEvent(
            eventId,
            savedWorkflow.getId(),
            templateId,
            requesterId,
            "INITIAL",
            "PENDING_L1",
            "Workflow submitted successfully.",
            Map.of("priority", "MEDIUM"),
            Instant.now()
        );

        // 3. Save to Outbox Table IN THE SAME TRANSACTION (Atomic Guarantee)
        OutboxEvent outboxEvent = new OutboxEvent();
        outboxEvent.setAggregateType("WORKFLOW_INSTANCE");
        outboxEvent.setAggregateId(savedWorkflow.getId().toString());
        outboxEvent.setEventType("WorkflowTransitionedEvent");
        outboxEvent.setPayload(objectMapper.writeValueAsString(event));
        outboxEvent.setStatus("PENDING");

        outboxRepository.save(outboxEvent);

        return savedWorkflow;
    }
}