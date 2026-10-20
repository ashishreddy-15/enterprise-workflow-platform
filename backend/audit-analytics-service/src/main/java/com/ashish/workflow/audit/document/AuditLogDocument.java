package com.ashish.workflow.audit.document;

import java.time.Instant;
import java.util.UUID;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

@Document(collection = "audit_logs")
public class AuditLogDocument {

    /**
     * IDEMPOTENCY KEY: We use the Kafka event's unique UUID as the MongoDB _id.
     * Even if OutboxScheduler publishes the same event twice, MongoDB's unique _id index
     * guarantees this event can never be inserted twice.
     */
    @Id
    private String eventId;

    @Indexed
    private UUID workflowId;

    private String templateId;
    private String previousState;
    private String newState;
    private String actorId;
    private Instant occurredAt;
    private Instant processedAt;

    public AuditLogDocument() {}

    public AuditLogDocument(
            String eventId,
            UUID workflowId,
            String templateId,
            String previousState,
            String newState,
            String actorId,
            Instant occurredAt,
            Instant processedAt) {
        this.eventId = eventId;
        this.workflowId = workflowId;
        this.templateId = templateId;
        this.previousState = previousState;
        this.newState = newState;
        this.actorId = actorId;
        this.occurredAt = occurredAt;
        this.processedAt = processedAt;
    }

    public String getEventId() {
        return eventId;
    }

    public void setEventId(String eventId) {
        this.eventId = eventId;
    }

    public UUID getWorkflowId() {
        return workflowId;
    }

    public void setWorkflowId(UUID workflowId) {
        this.workflowId = workflowId;
    }

    public String getTemplateId() {
        return templateId;
    }

    public void setTemplateId(String templateId) {
        this.templateId = templateId;
    }

    public String getPreviousState() {
        return previousState;
    }

    public void setPreviousState(String previousState) {
        this.previousState = previousState;
    }

    public String getNewState() {
        return newState;
    }

    public void setNewState(String newState) {
        this.newState = newState;
    }

    public String getActorId() {
        return actorId;
    }

    public void setActorId(String actorId) {
        this.actorId = actorId;
    }

    public Instant getOccurredAt() {
        return occurredAt;
    }

    public void setOccurredAt(Instant occurredAt) {
        this.occurredAt = occurredAt;
    }

    public Instant getProcessedAt() {
        return processedAt;
    }

    public void setProcessedAt(Instant processedAt) {
        this.processedAt = processedAt;
    }
}
