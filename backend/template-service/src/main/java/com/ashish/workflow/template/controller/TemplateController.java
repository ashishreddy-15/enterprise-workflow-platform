package com.ashish.workflow.template.controller;

import com.ashish.workflow.template.document.WorkflowTemplateDocument;
import com.ashish.workflow.template.service.TemplateService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/templates")
public class TemplateController {

    private static final Logger log = LoggerFactory.getLogger(TemplateController.class);

    private final TemplateService templateService;

    public TemplateController(TemplateService templateService) {
        this.templateService = templateService;
    }

    @PostMapping
    public ResponseEntity<WorkflowTemplateDocument> createDraft(@RequestBody WorkflowTemplateDocument doc) {
        log.info("REST: Create draft template - key: '{}', name: '{}'", doc.getTemplateKey(), doc.getName());
        return ResponseEntity.status(HttpStatus.CREATED).body(templateService.createDraft(doc));
    }

    @PutMapping("/{templateKey}/versions/{version}/publish")
    public ResponseEntity<WorkflowTemplateDocument> publish(
            @PathVariable String templateKey,
            @PathVariable int version) {
        log.info("REST: Publish template - key: '{}', version: {}", templateKey, version);
        return ResponseEntity.ok(templateService.publishTemplate(templateKey, version));
    }

    @GetMapping("/{templateKey}")
    public ResponseEntity<WorkflowTemplateDocument> getActivePublished(@PathVariable String templateKey) {
        log.debug("REST: Get active published template - key: '{}'", templateKey);
        return templateService.getActivePublishedTemplate(templateKey)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/{templateKey}/versions")
    public ResponseEntity<List<WorkflowTemplateDocument>> getAllVersions(@PathVariable String templateKey) {
        log.debug("REST: Get all versions - templateKey: '{}'", templateKey);
        return ResponseEntity.ok(templateService.getAllVersions(templateKey));
    }
}
