package com.ashish.workflow.audit.document;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

@Document(collection = "workflow_analytics_views")
public class WorkflowAnalyticsView {

    @Id
    private String workflowId;

    @Indexed
    private String templateId;

    @Indexed
    private String currentState;

    private String lastActorId;
    private int transitionCount = 0;
    private Instant lastUpdatedAt;
    private List<TransitionEntry> history = new ArrayList<>();

    public record TransitionEntry(
            String eventId, String fromState, String toState, String actorId, Instant occurredAt) {}

    public String getWorkflowId() {
        return workflowId;
    }

    public void setWorkflowId(String workflowId) {
        this.workflowId = workflowId;
    }

    public String getTemplateId() {
        return templateId;
    }

    public void setTemplateId(String templateId) {
        this.templateId = templateId;
    }

    public String getCurrentState() {
        return currentState;
    }

    public void setCurrentState(String currentState) {
        this.currentState = currentState;
    }

    public String getLastActorId() {
        return lastActorId;
    }

    public void setLastActorId(String lastActorId) {
        this.lastActorId = lastActorId;
    }

    public int getTransitionCount() {
        return transitionCount;
    }

    public void setTransitionCount(int transitionCount) {
        this.transitionCount = transitionCount;
    }

    public Instant getLastUpdatedAt() {
        return lastUpdatedAt;
    }

    public void setLastUpdatedAt(Instant lastUpdatedAt) {
        this.lastUpdatedAt = lastUpdatedAt;
    }

    public List<TransitionEntry> getHistory() {
        return history;
    }

    public void setHistory(List<TransitionEntry> history) {
        this.history = history;
    }
}
