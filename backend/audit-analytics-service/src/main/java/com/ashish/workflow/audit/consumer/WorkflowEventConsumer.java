package com.ashish.workflow.audit.consumer;

import com.ashish.workflow.audit.document.AuditLogDocument;
import com.ashish.workflow.audit.document.WorkflowAnalyticsView;
import com.ashish.workflow.audit.repository.AuditLogRepository;
import com.ashish.workflow.audit.repository.WorkflowAnalyticsRepository;
import com.ashish.workflow.contracts.events.WorkflowTransitionedEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.BackOff;
import org.springframework.kafka.annotation.DltHandler;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.annotation.RetryableTopic;
import org.springframework.kafka.support.KafkaHeaders;
import org.springframework.messaging.handler.annotation.Header;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

import java.time.Instant;

@Component
public class WorkflowEventConsumer {

    private static final Logger log = LoggerFactory.getLogger(WorkflowEventConsumer.class);

    private final AuditLogRepository auditLogRepository;
    private final WorkflowAnalyticsRepository analyticsRepository;
    private final ObjectMapper objectMapper;

    public WorkflowEventConsumer(AuditLogRepository auditLogRepository,
                                 WorkflowAnalyticsRepository analyticsRepository,
                                 ObjectMapper objectMapper) {
        this.auditLogRepository = auditLogRepository;
        this.analyticsRepository = analyticsRepository;
        this.objectMapper = objectMapper;
    }

    /**
     * Non-blocking retry with exponential backoff (1s -> 2s -> 4s).
     * If all 3 attempts fail, Spring Kafka automatically forwards the message to 'workflow-events-dlt'.
     */
    @RetryableTopic(
            attempts = "3",
            backOff = @BackOff(delay = 1000, multiplier = 2.0),
            dltTopicSuffix = "-dlt"
    )
    @KafkaListener(topics = "workflow-events", groupId = "audit-analytics-group")
    public void consumeWorkflowEvent(String rawJsonPayload) throws Exception {
        // Handle case where JsonSerializer wrapped the string in quotes
        String cleanJson = rawJsonPayload;
        if (rawJsonPayload.startsWith("\"") && rawJsonPayload.endsWith("\"")) {
            cleanJson = objectMapper.readValue(rawJsonPayload, String.class);
        }

        WorkflowTransitionedEvent event = objectMapper.readValue(cleanJson, WorkflowTransitionedEvent.class);
        String eventIdStr = event.eventId().toString();

        // 1. IDEMPOTENCY CHECK (Microservices.io Idempotent Consumer Pattern)
        if (auditLogRepository.existsById(eventIdStr)) {
            log.warn("Duplicate event detected! Skipping already processed eventId={}", eventIdStr);
            return;
        }

        // 2. Save Immutable Audit Log
        AuditLogDocument auditDoc = new AuditLogDocument(
                eventIdStr,
                event.workflowId(),
                event.templateId(),
                event.previousState(),
                event.newState(),
                event.actorId(),
                event.occurredAt(),
                Instant.now()
        );
        auditLogRepository.save(auditDoc);

        // 3. Update Pre-Joined CQRS View
        String workflowIdStr = event.workflowId().toString();
        WorkflowAnalyticsView view = analyticsRepository.findById(workflowIdStr)
                .orElseGet(() -> {
                    WorkflowAnalyticsView newView = new WorkflowAnalyticsView();
                    newView.setWorkflowId(workflowIdStr);
                    newView.setTemplateId(event.templateId());
                    return newView;
                });

        view.setCurrentState(event.newState());
        view.setLastActorId(event.actorId());
        view.setTransitionCount(view.getTransitionCount() + 1);
        view.setLastUpdatedAt(event.occurredAt());
        view.getHistory().add(new WorkflowAnalyticsView.TransitionEntry(
                eventIdStr,
                event.previousState(),
                event.newState(),
                event.actorId(),
                event.occurredAt()
        ));

        analyticsRepository.save(view);
        log.info("Processed workflow eventId={} for workflowId={} -> state={}",
                eventIdStr, workflowIdStr, event.newState());
    }

    @DltHandler
    public void handleDeadLetterMessage(String payload, @Header(KafkaHeaders.RECEIVED_TOPIC) String topic) {
        log.error("CRITICAL: Message landed in Dead-Letter Topic [{}]: {}", topic, payload);
    }
}