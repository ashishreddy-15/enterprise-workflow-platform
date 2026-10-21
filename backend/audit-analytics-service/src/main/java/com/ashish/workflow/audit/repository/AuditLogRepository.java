package com.ashish.workflow.audit.repository;

import com.ashish.workflow.audit.document.AuditLogDocument;
import java.util.List;
import java.util.UUID;
import org.springframework.data.mongodb.repository.MongoRepository;

public interface AuditLogRepository extends MongoRepository<AuditLogDocument, String> {
    List<AuditLogDocument> findByWorkflowIdOrderByOccurredAtAsc(UUID workflowId);

    List<AuditLogDocument> findAllByOrderByOccurredAtDesc();
}
