package com.ashish.workflow.template.service;

import com.ashish.workflow.template.document.WorkflowTemplateDocument;
import com.ashish.workflow.template.repository.WorkflowTemplateRepository;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
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

    public WorkflowTemplateDocument updateDraft(String templateKey, int version, WorkflowTemplateDocument updated) {
        log.info("Updating draft template '{}' version {}", templateKey, version);
        WorkflowTemplateDocument doc = templateRepository
                .findByTemplateKeyAndVersion(templateKey, version)
                .orElseThrow(() ->
                        new IllegalArgumentException("Template version not found: " + templateKey + " v" + version));

        if (!"DRAFT".equalsIgnoreCase(doc.getStatus())) {
            throw new IllegalStateException(
                    "Cannot directly edit a published template. Please create a new draft version.");
        }

        doc.setName(updated.getName());
        doc.setDescription(updated.getDescription());
        doc.setInitialState(updated.getInitialState());
        doc.setSteps(updated.getSteps());
        doc.setUpdatedAt(Instant.now());
        WorkflowTemplateDocument saved = templateRepository.save(doc);
        log.info("Draft template '{}' v{} successfully updated", templateKey, version);
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

    public Optional<WorkflowTemplateDocument> getLatestTemplate(String templateKey) {
        log.debug("Fetching latest template (any status) for key: '{}'", templateKey);
        return templateRepository.findByTemplateKeyOrderByVersionDesc(templateKey).stream()
                .findFirst();
    }

    public List<WorkflowTemplateDocument> getAllActivePublishedTemplates() {
        return getAllLatestTemplates("PUBLISHED");
    }

    public List<WorkflowTemplateDocument> getAllLatestTemplates(String statusFilter) {
        log.debug("Fetching latest templates with status filter: '{}'", statusFilter);
        List<WorkflowTemplateDocument> all;
        if (statusFilter != null && !statusFilter.isBlank() && !"ALL".equalsIgnoreCase(statusFilter)) {
            all = templateRepository.findByStatusOrderByTemplateKeyAscVersionDesc(statusFilter.toUpperCase());
        } else {
            all = templateRepository.findAll();
            all.sort((a, b) -> {
                int keyCmp = a.getTemplateKey().compareTo(b.getTemplateKey());
                if (keyCmp != 0) return keyCmp;
                return Integer.compare(b.getVersion(), a.getVersion());
            });
        }
        Map<String, WorkflowTemplateDocument> latestByKey = new LinkedHashMap<>();
        for (WorkflowTemplateDocument doc : all) {
            latestByKey.putIfAbsent(doc.getTemplateKey(), doc);
        }
        return new ArrayList<>(latestByKey.values());
    }

    public List<WorkflowTemplateDocument> getAllVersions(String templateKey) {
        log.debug("Fetching all versions for template key: '{}'", templateKey);
        return templateRepository.findByTemplateKeyOrderByVersionDesc(templateKey);
    }
}
