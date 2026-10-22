package com.ashish.workflow.audit.controller;

import com.ashish.workflow.audit.document.AuditLogDocument;
import com.ashish.workflow.audit.document.WorkflowAnalyticsView;
import com.ashish.workflow.audit.repository.AuditLogRepository;
import com.ashish.workflow.audit.repository.WorkflowAnalyticsRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@Tag(
        name = "Audit Trail & SLA Analytics",
        description = "Chronological state transition timeline, immutable audit logs, and CQRS read views")
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

    @Operation(summary = "Get pre-joined CQRS analytics view and chronological timeline for a workflow")
    @GetMapping("/workflows/{workflowId}")
    public ResponseEntity<WorkflowAnalyticsView> getWorkflowAnalytics(@PathVariable String workflowId) {
        log.debug("REST: Fetching analytics view for workflowId: '{}'", workflowId);
        return analyticsRepository
                .findById(workflowId)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @Operation(summary = "List all pre-joined workflow analytics views (optionally filtered by state)")
    @GetMapping("/workflows")
    public ResponseEntity<List<WorkflowAnalyticsView>> getAllViews(@RequestParam(required = false) String state) {
        log.debug("REST: Fetching all analytics views, state filter: '{}'", state);
        if (state != null && !state.isBlank()) {
            return ResponseEntity.ok(analyticsRepository.findByCurrentState(state));
        }
        return ResponseEntity.ok(analyticsRepository.findAll());
    }

    @Operation(summary = "Fetch recent immutable audit logs across all workflows")
    @GetMapping("/audit-logs")
    public ResponseEntity<List<AuditLogDocument>> getAllAuditLogs(@RequestParam(defaultValue = "100") int limit) {
        log.debug("REST: Fetching recent audit logs across all workflows, limit: {}", limit);
        List<AuditLogDocument> logs = auditLogRepository.findAllByOrderByOccurredAtDesc();
        if (logs.size() > limit) {
            return ResponseEntity.ok(logs.subList(0, limit));
        }
        return ResponseEntity.ok(logs);
    }

    @Operation(summary = "Fetch chronological immutable audit trail for a specific workflow UUID")
    @GetMapping("/audit-logs/{workflowId}")
    public ResponseEntity<List<AuditLogDocument>> getAuditTrail(@PathVariable UUID workflowId) {
        log.debug("REST: Fetching audit trail for workflowId: '{}'", workflowId);
        return ResponseEntity.ok(auditLogRepository.findByWorkflowIdOrderByOccurredAtAsc(workflowId));
    }
}
