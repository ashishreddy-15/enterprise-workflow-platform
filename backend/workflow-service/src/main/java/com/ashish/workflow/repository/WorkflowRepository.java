package com.ashish.workflow.repository;

import com.ashish.workflow.domain.entity.WorkflowInstance;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.stereotype.Repository;

import java.util.UUID;

@Repository
public interface WorkflowRepository extends JpaRepository<WorkflowInstance, UUID>, JpaSpecificationExecutor<WorkflowInstance> {
}