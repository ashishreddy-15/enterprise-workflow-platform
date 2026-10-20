package com.ashish.workflow.audit.repository;

import com.ashish.workflow.audit.document.WorkflowAnalyticsView;
import java.util.List;
import org.springframework.data.mongodb.repository.MongoRepository;

public interface WorkflowAnalyticsRepository extends MongoRepository<WorkflowAnalyticsView, String> {
    List<WorkflowAnalyticsView> findByCurrentState(String currentState);
}
