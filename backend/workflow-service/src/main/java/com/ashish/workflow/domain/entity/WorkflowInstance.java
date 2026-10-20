package com.ashish.workflow.domain.entity;

import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "workflow_instances")
public class WorkflowInstance {

    @Id
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id = UUID.randomUUID();

    @Column(name = "template_id", nullable = false, length = 100)
    private String templateId;

    @Column(name = "template_version", nullable = false)
    private int templateVersion = 1;

    @Column(name = "requester_id", nullable = false, length = 100)
    private String requesterId;

    @Column(name = "title", nullable = false)
    private String title;

    @Column(name = "current_state", nullable = false, length = 50)
    private String currentState;

    @Version
    @Column(name = "version", nullable = false)
    private Long version;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "template_snapshot", columnDefinition = "jsonb")
    private String templateSnapshot;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "context_data", columnDefinition = "jsonb")
    private Map<String, Object> contextData = new HashMap<>();

    @OneToMany(mappedBy = "workflowInstance", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<WorkflowTask> tasks = new ArrayList<>();

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    public WorkflowInstance() {}

    public void addTask(WorkflowTask task) {
        tasks.add(task);
        task.setWorkflowInstance(this);
    }

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public String getTemplateId() {
        return templateId;
    }

    public void setTemplateId(String templateId) {
        this.templateId = templateId;
    }

    public int getTemplateVersion() {
        return templateVersion;
    }

    public void setTemplateVersion(int templateVersion) {
        this.templateVersion = templateVersion;
    }

    public String getRequesterId() {
        return requesterId;
    }

    public void setRequesterId(String requesterId) {
        this.requesterId = requesterId;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getCurrentState() {
        return currentState;
    }

    public void setCurrentState(String currentState) {
        this.currentState = currentState;
    }

    public Long getVersion() {
        return version;
    }

    public void setVersion(Long version) {
        this.version = version;
    }

    public String getTemplateSnapshot() {
        return templateSnapshot;
    }

    public void setTemplateSnapshot(String templateSnapshot) {
        this.templateSnapshot = templateSnapshot;
    }

    public Map<String, Object> getContextData() {
        return contextData;
    }

    public void setContextData(Map<String, Object> contextData) {
        this.contextData = contextData;
    }

    public List<WorkflowTask> getTasks() {
        return tasks;
    }

    public void setTasks(List<WorkflowTask> tasks) {
        this.tasks = tasks;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(OffsetDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public OffsetDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(OffsetDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }
}
