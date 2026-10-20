package com.ashish.workflow.template.service;

import com.ashish.workflow.template.document.WorkflowTemplateDocument;
import com.ashish.workflow.template.repository.WorkflowTemplateRepository;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class TemplateService {

    private static final Logger log = LoggerFactory.getLogger(TemplateService.class);

    private final WorkflowTemplateRepository templateRepository;

    public TemplateService(WorkflowTemplateRepository templateRepository) {
        this.templateRepository = templateRepository;
    }

    public WorkflowTemplateDocument createDraft(WorkflowTemplateDocument template) {
        log.info("Creating draft template for key: '{}' (next version will be computed)", template.getTemplateKey());
        int nextVersion = templateRepository.findByTemplateKeyOrderByVersionDesc(template.getTemplateKey()).stream()
                        .mapToInt(WorkflowTemplateDocument::getVersion)
                        .max()
                        .orElse(0)
                + 1;

        template.setVersion(nextVersion);
        template.setStatus("DRAFT");
        template.setCreatedAt(Instant.now());
        template.setUpdatedAt(Instant.now());
        WorkflowTemplateDocument saved = templateRepository.save(template);
        log.info(
                "Draft template created - key: '{}', version: {}, id: {}",
                template.getTemplateKey(),
                template.getVersion(),
                template.getId());
        return saved;
    }

    public WorkflowTemplateDocument publishTemplate(String templateKey, int version) {
        log.info("Publishing template '{}' version {}", templateKey, version);
        WorkflowTemplateDocument doc = templateRepository
                .findByTemplateKeyAndVersion(templateKey, version)
                .orElseThrow(() ->
                        new IllegalArgumentException("Template version not found: " + templateKey + " v" + version));

        doc.setStatus("PUBLISHED");
        doc.setUpdatedAt(Instant.now());
        WorkflowTemplateDocument saved = templateRepository.save(doc);
        log.info("Template '{}' v{} successfully published", templateKey, version);
        return saved;
    }

    public Optional<WorkflowTemplateDocument> getActivePublishedTemplate(String templateKey) {
        log.debug("Fetching active published template for key: '{}'", templateKey);
        return templateRepository.findFirstByTemplateKeyAndStatusOrderByVersionDesc(templateKey, "PUBLISHED");
    }

    public List<WorkflowTemplateDocument> getAllVersions(String templateKey) {
        log.debug("Fetching all versions for template key: '{}'", templateKey);
        return templateRepository.findByTemplateKeyOrderByVersionDesc(templateKey);
    }
}
