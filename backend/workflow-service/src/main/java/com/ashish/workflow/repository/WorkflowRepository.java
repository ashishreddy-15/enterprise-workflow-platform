package com.ashish.workflow.repository;

import com.ashish.workflow.domain.entity.WorkflowInstance;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface WorkflowRepository extends JpaRepository<WorkflowInstance, UUID>, JpaSpecificationExecutor<WorkflowInstance> {
    @Query("SELECT w FROM WorkflowInstance w WHERE w.currentState NOT IN ('ONBOARDED', 'REJECTED', 'CANCELLED') ORDER BY w.updatedAt DESC")
    List<WorkflowInstance> findAllActiveWorkflows();
}