package com.ashish.workflow.template.controller;

import com.ashish.workflow.template.api.TemplateApi;
import com.ashish.workflow.template.document.WorkflowTemplateDocument;
import com.ashish.workflow.template.service.TemplateService;
import java.util.List;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/templates")
public class TemplateController implements TemplateApi {

    private static final Logger log = LoggerFactory.getLogger(TemplateController.class);

    private final TemplateService templateService;

    public TemplateController(TemplateService templateService) {
        this.templateService = templateService;
    }

    @Override
    @PostMapping
    public ResponseEntity<WorkflowTemplateDocument> createDraft(@RequestBody WorkflowTemplateDocument doc) {
        log.info("REST: Create draft template - key: '{}', name: '{}'", doc.getTemplateKey(), doc.getName());
        return ResponseEntity.status(HttpStatus.CREATED).body(templateService.createDraft(doc));
    }

    @Override
    @PutMapping("/{templateKey}/versions/{version}")
    public ResponseEntity<WorkflowTemplateDocument> updateDraft(
            @PathVariable String templateKey, @PathVariable int version, @RequestBody WorkflowTemplateDocument doc) {
        log.info("REST: Update draft template - key: '{}', version: {}", templateKey, version);
        return ResponseEntity.ok(templateService.updateDraft(templateKey, version, doc));
    }

    @Override
    @PutMapping("/{templateKey}/versions/{version}/publish")
    public ResponseEntity<WorkflowTemplateDocument> publish(
            @PathVariable String templateKey, @PathVariable int version) {
        log.info("REST: Publish template - key: '{}', version: {}", templateKey, version);
        return ResponseEntity.ok(templateService.publishTemplate(templateKey, version));
    }

    @Override
    @GetMapping
    public ResponseEntity<List<WorkflowTemplateDocument>> getAll(
            @RequestParam(required = false, defaultValue = "ALL") String status) {
        log.debug("REST: Get templates with status filter: '{}'", status);
        return ResponseEntity.ok(templateService.getAllLatestTemplates(status));
    }

    @Override
    @GetMapping("/{templateKey}")
    public ResponseEntity<WorkflowTemplateDocument> getTemplate(
            @PathVariable String templateKey,
            @RequestParam(required = false, defaultValue = "false") boolean publishedOnly) {
        log.debug("REST: Get template - key: '{}', publishedOnly: {}", templateKey, publishedOnly);
        Optional<WorkflowTemplateDocument> doc = publishedOnly
                ? templateService.getActivePublishedTemplate(templateKey)
                : templateService.getLatestTemplate(templateKey);
        return doc.map(ResponseEntity::ok).orElse(ResponseEntity.notFound().build());
    }

    @Override
    @GetMapping("/{templateKey}/versions")
    public ResponseEntity<List<WorkflowTemplateDocument>> getAllVersions(@PathVariable String templateKey) {
        log.debug("REST: Get all versions - templateKey: '{}'", templateKey);
        return ResponseEntity.ok(templateService.getAllVersions(templateKey));
    }
}
