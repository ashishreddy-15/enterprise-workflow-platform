package com.ashish.workflow.domain.entity;

import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "workflow_instances", indexes = {
        @Index(name = "idx_workflow_state_priority", columnList = "current_state, priority")
})
public class WorkflowInstance {

    @Id
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id = UUID.randomUUID();

    @Column(name = "template_id", nullable = false)
    private String templateId;

    @Column(name = "requester_id", nullable = false)
    private String requesterId;

    @Column(name = "title", nullable = false)
    private String title;

    @Column(name = "current_state", nullable = false)
    private String currentState;

    @Column(name = "priority", nullable = false)
    private String priority = "MEDIUM";

    @Version
    @Column(name = "version", nullable = false)
    private Long version = 0L;

    @OneToMany(mappedBy = "workflowInstance", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<ApprovalTask> approvalTasks = new ArrayList<>();

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt = OffsetDateTime.now();

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt = OffsetDateTime.now();

    public void addApprovalTask(ApprovalTask task) {
        approvalTasks.add(task);
        task.setWorkflowInstance(this);
    }

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public String getTemplateId() { return templateId; }
    public void setTemplateId(String templateId) { this.templateId = templateId; }

    public String getRequesterId() { return requesterId; }
    public void setRequesterId(String requesterId) { this.requesterId = requesterId; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getCurrentState() { return currentState; }
    public void setCurrentState(String currentState) { this.currentState = currentState; }

    public String getPriority() { return priority; }
    public void setPriority(String priority) { this.priority = priority; }

    public Long getVersion() { return version; }
    public void setVersion(Long version) { this.version = version; }

    public List<ApprovalTask> getApprovalTasks() { return approvalTasks; }
    public void setApprovalTasks(List<ApprovalTask> approvalTasks) { this.approvalTasks = approvalTasks; }

    public OffsetDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(OffsetDateTime createdAt) { this.createdAt = createdAt; }

    public OffsetDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(OffsetDateTime updatedAt) { this.updatedAt = updatedAt; }
}