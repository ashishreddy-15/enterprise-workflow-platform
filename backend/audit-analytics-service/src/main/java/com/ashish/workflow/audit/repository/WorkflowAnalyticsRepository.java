package com.ashish.workflow.audit.repository;

import com.ashish.workflow.audit.document.WorkflowAnalyticsView;
import org.springframework.data.mongodb.repository.MongoRepository;
import java.util.List;

public interface WorkflowAnalyticsRepository extends MongoRepository<WorkflowAnalyticsView, String> {
    List<WorkflowAnalyticsView> findByCurrentState(String currentState);
}