package com.ashish.workflow.audit.repository;

import com.ashish.workflow.audit.document.AuditLogDocument;
import org.springframework.data.mongodb.repository.MongoRepository;
import java.util.List;
import java.util.UUID;

public interface AuditLogRepository extends MongoRepository<AuditLogDocument, String> {
    List<AuditLogDocument> findByWorkflowIdOrderByOccurredAtAsc(UUID workflowId);
}