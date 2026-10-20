package com.ashish.workflow.template.service;

import com.ashish.workflow.template.document.WorkflowTemplateDocument;
import com.ashish.workflow.template.repository.WorkflowTemplateRepository;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Service
public class TemplateService {

    private final WorkflowTemplateRepository templateRepository;

    public TemplateService(WorkflowTemplateRepository templateRepository) {
        this.templateRepository = templateRepository;
    }

    public WorkflowTemplateDocument createDraft(WorkflowTemplateDocument template) {
        int nextVersion = templateRepository.findByTemplateKeyOrderByVersionDesc(template.getTemplateKey())
                .stream()
                .mapToInt(WorkflowTemplateDocument::getVersion)
                .max()
                .orElse(0) + 1;

        template.setVersion(nextVersion);
        template.setStatus("DRAFT");
        template.setCreatedAt(Instant.now());
        template.setUpdatedAt(Instant.now());
        return templateRepository.save(template);
    }

    public WorkflowTemplateDocument publishTemplate(String templateKey, int version) {
        WorkflowTemplateDocument doc = templateRepository.findByTemplateKeyAndVersion(templateKey, version)
                .orElseThrow(() -> new IllegalArgumentException("Template version not found: " + templateKey + " v" + version));

        doc.setStatus("PUBLISHED");
        doc.setUpdatedAt(Instant.now());
        return templateRepository.save(doc);
    }

    public Optional<WorkflowTemplateDocument> getActivePublishedTemplate(String templateKey) {
        return templateRepository.findFirstByTemplateKeyAndStatusOrderByVersionDesc(templateKey, "PUBLISHED");
    }

    public List<WorkflowTemplateDocument> getAllVersions(String templateKey) {
        return templateRepository.findByTemplateKeyOrderByVersionDesc(templateKey);
    }
}