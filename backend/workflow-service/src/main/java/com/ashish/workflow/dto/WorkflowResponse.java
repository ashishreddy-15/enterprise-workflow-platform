package com.ashish.workflow.dto;

import com.ashish.workflow.domain.entity.WorkflowInstance;
import com.ashish.workflow.domain.entity.WorkflowTask;
import java.time.OffsetDateTime;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public record WorkflowResponse(
        UUID id,
        String templateId,
        int templateVersion,
        String requesterId,
        String title,
        String currentState,
        Long version,
        Map<String, Object> contextData,
        List<TaskResponse> tasks,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt) {
    public record TaskResponse(
            UUID id,
            int stepOrder,
            String stepName,
            String taskType,
            String assignedRole,
            String completedBy,
            String status,
            String comments,
            OffsetDateTime actedAt) {
        public static TaskResponse from(WorkflowTask task) {
            return new TaskResponse(
                    task.getId(),
                    task.getStepOrder(),
                    task.getStepName(),
                    task.getTaskType(),
                    task.getAssignedRole(),
                    task.getCompletedBy(),
                    task.getStatus(),
                    task.getComments(),
                    task.getActedAt());
        }
    }

    /**
     * Static Factory Helper: encapsulates mapping logic and protects
     * against null collections without leaking raw JPA proxies.
     */
    public static WorkflowResponse from(WorkflowInstance entity) {
        if (entity == null) {
            return null;
        }

        List<TaskResponse> taskResponses = entity.getTasks() != null
                ? entity.getTasks().stream().map(TaskResponse::from).toList()
                : Collections.emptyList();

        Map<String, Object> context = entity.getContextData() != null
                ? Collections.unmodifiableMap(entity.getContextData())
                : Collections.emptyMap();

        return new WorkflowResponse(
                entity.getId(),
                entity.getTemplateId(),
                entity.getTemplateVersion(),
                entity.getRequesterId(),
                entity.getTitle(),
                entity.getCurrentState(),
                entity.getVersion(),
                context,
                taskResponses,
                entity.getCreatedAt(),
                entity.getUpdatedAt());
    }
}
