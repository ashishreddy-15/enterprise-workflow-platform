package com.ashish.workflow.template.repository;

import com.ashish.workflow.template.document.WorkflowTemplateDocument;
import java.util.List;
import java.util.Optional;
import org.springframework.data.mongodb.repository.MongoRepository;

public interface WorkflowTemplateRepository extends MongoRepository<WorkflowTemplateDocument, String> {
    Optional<WorkflowTemplateDocument> findByTemplateKeyAndVersion(String templateKey, int version);

    Optional<WorkflowTemplateDocument> findFirstByTemplateKeyAndStatusOrderByVersionDesc(
            String templateKey, String status);

    List<WorkflowTemplateDocument> findByTemplateKeyOrderByVersionDesc(String templateKey);
}
