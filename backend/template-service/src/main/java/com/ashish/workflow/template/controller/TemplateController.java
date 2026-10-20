package com.ashish.workflow.template.controller;

import com.ashish.workflow.template.document.WorkflowTemplateDocument;
import com.ashish.workflow.template.service.TemplateService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/templates")
public class TemplateController {

    private final TemplateService templateService;

    public TemplateController(TemplateService templateService) {
        this.templateService = templateService;
    }

    @PostMapping
    public ResponseEntity<WorkflowTemplateDocument> createDraft(@RequestBody WorkflowTemplateDocument doc) {
        return ResponseEntity.status(HttpStatus.CREATED).body(templateService.createDraft(doc));
    }

    @PutMapping("/{templateKey}/versions/{version}/publish")
    public ResponseEntity<WorkflowTemplateDocument> publish(
            @PathVariable String templateKey,
            @PathVariable int version) {
        return ResponseEntity.ok(templateService.publishTemplate(templateKey, version));
    }

    @GetMapping("/{templateKey}")
    public ResponseEntity<WorkflowTemplateDocument> getActivePublished(@PathVariable String templateKey) {
        return templateService.getActivePublishedTemplate(templateKey)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/{templateKey}/versions")
    public ResponseEntity<List<WorkflowTemplateDocument>> getAllVersions(@PathVariable String templateKey) {
        return ResponseEntity.ok(templateService.getAllVersions(templateKey));
    }
}