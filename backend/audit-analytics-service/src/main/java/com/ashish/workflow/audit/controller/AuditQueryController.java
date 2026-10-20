package com.ashish.workflow.audit.controller;

import com.ashish.workflow.audit.document.AuditLogDocument;
import com.ashish.workflow.audit.document.WorkflowAnalyticsView;
import com.ashish.workflow.audit.repository.AuditLogRepository;
import com.ashish.workflow.audit.repository.WorkflowAnalyticsRepository;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/analytics")
public class AuditQueryController {

    private static final Logger log = LoggerFactory.getLogger(AuditQueryController.class);

    private final WorkflowAnalyticsRepository analyticsRepository;
    private final AuditLogRepository auditLogRepository;

    public AuditQueryController(
            WorkflowAnalyticsRepository analyticsRepository, AuditLogRepository auditLogRepository) {
        this.analyticsRepository = analyticsRepository;
        this.auditLogRepository = auditLogRepository;
    }

    // Query the pre-joined CQRS view for a specific workflow
    @GetMapping("/workflows/{workflowId}")
    public ResponseEntity<WorkflowAnalyticsView> getWorkflowAnalytics(@PathVariable String workflowId) {
        log.debug("REST: Fetching analytics view for workflowId: '{}'", workflowId);
        return analyticsRepository
                .findById(workflowId)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    // List all pre-joined workflow views (optionally filtered by state)
    @GetMapping("/workflows")
    public ResponseEntity<List<WorkflowAnalyticsView>> getAllViews(@RequestParam(required = false) String state) {
        log.debug("REST: Fetching all analytics views, state filter: '{}'", state);
        if (state != null && !state.isBlank()) {
            return ResponseEntity.ok(analyticsRepository.findByCurrentState(state));
        }
        return ResponseEntity.ok(analyticsRepository.findAll());
    }

    // Fetch raw immutable audit logs for a workflow
    @GetMapping("/audit-logs/{workflowId}")
    public ResponseEntity<List<AuditLogDocument>> getAuditTrail(@PathVariable UUID workflowId) {
        log.debug("REST: Fetching audit trail for workflowId: '{}'", workflowId);
        return ResponseEntity.ok(auditLogRepository.findByWorkflowIdOrderByOccurredAtAsc(workflowId));
    }
}
