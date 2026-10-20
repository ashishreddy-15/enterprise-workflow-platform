package com.ashish.workflow.repository;

import com.ashish.workflow.domain.entity.WorkflowInstance;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

@Repository
public interface WorkflowRepository
        extends JpaRepository<WorkflowInstance, UUID>, JpaSpecificationExecutor<WorkflowInstance> {
    @Query(
            "SELECT w FROM WorkflowInstance w WHERE w.currentState NOT IN ('ONBOARDED', 'REJECTED', 'CANCELLED') ORDER BY w.updatedAt DESC")
    List<WorkflowInstance> findAllActiveWorkflows();
}
