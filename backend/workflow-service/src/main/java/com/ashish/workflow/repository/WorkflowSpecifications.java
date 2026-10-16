package com.ashish.workflow.repository;

import com.ashish.workflow.domain.entity.WorkflowInstance;
import org.springframework.data.jpa.domain.Specification;

public class WorkflowSpecifications {

    public static Specification<WorkflowInstance> hasState(String state) {
        return (root, query, cb) -> 
            state == null ? cb.conjunction() : cb.equal(root.get("currentState"), state);
    }

    public static Specification<WorkflowInstance> hasPriority(String priority) {
        return (root, query, cb) -> 
            priority == null ? cb.conjunction() : cb.equal(root.get("priority"), priority);
    }

    public static Specification<WorkflowInstance> requesterEquals(String requesterId) {
        return (root, query, cb) -> 
            requesterId == null ? cb.conjunction() : cb.equal(root.get("requesterId"), requesterId);
    }
}