package com.ashish.workflow.domain.entity;

import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "approval_tasks")
public class ApprovalTask {

    @Id
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id = UUID.randomUUID();

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "workflow_id", nullable = false)
    private WorkflowInstance workflowInstance;

    @Column(name = "step_order", nullable = false)
    private Integer stepOrder;

    @Column(name = "assigned_role", nullable = false)
    private String assignedRole;

    @Column(name = "approver_id")
    private String approverId;

    @Column(name = "status", nullable = false)
    private String status; // PENDING, APPROVED, REJECTED

    @Column(name = "comments", columnDefinition = "TEXT")
    private String comments;

    @Column(name = "acted_at")
    private OffsetDateTime actedAt;

    // Getters and Setters
    public void setWorkflowInstance(WorkflowInstance workflowInstance) {
        this.workflowInstance = workflowInstance;
    }
}