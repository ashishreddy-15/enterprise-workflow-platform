package com.ashish.workflow.repository;

import com.ashish.workflow.domain.entity.WorkflowInstance;
import jakarta.persistence.LockModeType;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface WorkflowRepository
        extends JpaRepository<WorkflowInstance, UUID>, JpaSpecificationExecutor<WorkflowInstance> {

    @Query(
            "SELECT DISTINCT w FROM WorkflowInstance w LEFT JOIN FETCH w.tasks WHERE w.currentState NOT IN ('ONBOARDED', 'REJECTED', 'CANCELLED') ORDER BY w.updatedAt DESC")
    List<WorkflowInstance> findAllActiveWorkflows();

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query(
            """
        SELECT w FROM WorkflowInstance w
        WHERE w.slaBreached = false
          AND w.currentStepDueAt IS NOT NULL
          AND w.currentStepDueAt < :now
          AND w.currentState NOT IN ('ONBOARDED', 'REJECTED', 'CANCELLED')
        ORDER BY w.currentStepDueAt ASC
    """)
    List<WorkflowInstance> findBreachedWorkflowsForUpdate(@Param("now") OffsetDateTime now, Pageable pageable);
}
