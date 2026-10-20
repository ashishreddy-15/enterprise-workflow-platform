package com.ashish.workflow.domain.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "workflow_tasks")
public class WorkflowTask {

    @Id
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id = UUID.randomUUID();

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "workflow_id", nullable = false)
    private WorkflowInstance workflowInstance;

    @Column(name = "step_order", nullable = false)
    private Integer stepOrder;

    @Column(name = "step_name", nullable = false, length = 128)
    private String stepName;

    @Column(name = "task_type", nullable = false, length = 64)
    private String taskType; // "APPROVAL", "DOCUMENT_SUBMISSION", "MANUAL_ACTION"

    @Column(name = "assigned_role", length = 64)
    private String assignedRole;

    @Column(name = "completed_by", length = 128)
    private String completedBy;

    @Column(name = "status", nullable = false, length = 30)
    private String status; // "PENDING", "COMPLETED", "REJECTED", "SUBMITTED"

    @Column(name = "comments", columnDefinition = "TEXT")
    private String comments;

    @Column(name = "acted_at")
    private OffsetDateTime actedAt;

    public WorkflowTask() {}

    public WorkflowTask(
            UUID id,
            WorkflowInstance workflowInstance,
            Integer stepOrder,
            String stepName,
            String taskType,
            String assignedRole,
            String completedBy,
            String status,
            String comments,
            OffsetDateTime actedAt) {
        this.id = id != null ? id : UUID.randomUUID();
        this.workflowInstance = workflowInstance;
        this.stepOrder = stepOrder;
        this.stepName = stepName;
        this.taskType = taskType;
        this.assignedRole = assignedRole;
        this.completedBy = completedBy;
        this.status = status;
        this.comments = comments;
        this.actedAt = actedAt;
    }

    public void complete(String actionStatus, String actorId, String comments) {
        this.status = actionStatus;
        this.completedBy = actorId;
        this.comments = comments;
        this.actedAt = OffsetDateTime.now();
    }

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public WorkflowInstance getWorkflowInstance() { return workflowInstance; }
    public void setWorkflowInstance(WorkflowInstance workflowInstance) { this.workflowInstance = workflowInstance; }

    public Integer getStepOrder() { return stepOrder; }
    public void setStepOrder(Integer stepOrder) { this.stepOrder = stepOrder; }

    public String getStepName() { return stepName; }
    public void setStepName(String stepName) { this.stepName = stepName; }

    public String getTaskType() { return taskType; }
    public void setTaskType(String taskType) { this.taskType = taskType; }

    public String getAssignedRole() { return assignedRole; }
    public void setAssignedRole(String assignedRole) { this.assignedRole = assignedRole; }

    public String getCompletedBy() { return completedBy; }
    public void setCompletedBy(String completedBy) { this.completedBy = completedBy; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getComments() { return comments; }
    public void setComments(String comments) { this.comments = comments; }

    public OffsetDateTime getActedAt() { return actedAt; }
    public void setActedAt(OffsetDateTime actedAt) { this.actedAt = actedAt; }
}