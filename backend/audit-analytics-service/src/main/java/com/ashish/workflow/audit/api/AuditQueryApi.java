package com.ashish.workflow.audit.api;

import com.ashish.workflow.audit.document.AuditLogDocument;
import com.ashish.workflow.audit.document.WorkflowAnalyticsView;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;

@Tag(
        name = "Audit Trail & SLA Analytics",
        description =
                "Immutable chronological audit log queries, CQRS materialized read views, and SLA performance metrics")
public interface AuditQueryApi {

    @Operation(
            summary = "Get pre-joined CQRS analytics view for a workflow",
            description = "Retrieves the denormalized read model containing current state, total transitions, "
                    + "and chronological timeline projected from Kafka events into MongoDB.")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Analytics view retrieved successfully"),
        @ApiResponse(responseCode = "404", description = "Workflow analytics view not found")
    })
    ResponseEntity<WorkflowAnalyticsView> getWorkflowAnalytics(
            @Parameter(description = "Workflow instance UUID string") @PathVariable String workflowId);

    @Operation(
            summary = "List all pre-joined workflow analytics views",
            description = "Returns materialized CQRS views across all workflows, optionally filtered by current state.")
    @ApiResponses({@ApiResponse(responseCode = "200", description = "List of analytics views retrieved")})
    ResponseEntity<List<WorkflowAnalyticsView>> getAllViews(
            @Parameter(description = "Filter by workflow current state", example = "RUNNING")
                    @RequestParam(required = false)
                    String state);

    @Operation(
            summary = "Fetch recent immutable audit logs across all workflows",
            description =
                    "Retrieves the global chronological stream of transition events stored in the MongoDB audit collection.")
    @ApiResponses({@ApiResponse(responseCode = "200", description = "Recent audit logs returned successfully")})
    ResponseEntity<List<AuditLogDocument>> getAllAuditLogs(
            @Parameter(description = "Maximum number of audit log records to return", example = "100")
                    @RequestParam(defaultValue = "100")
                    int limit);

    @Operation(
            summary = "Fetch chronological immutable audit trail for a specific workflow",
            description =
                    "Returns every state transition, actor identity, decision comment, and payload diff in ascending order.")
    @ApiResponses({@ApiResponse(responseCode = "200", description = "Workflow audit trail returned successfully")})
    ResponseEntity<List<AuditLogDocument>> getAuditTrail(
            @Parameter(description = "Workflow instance UUID") @PathVariable UUID workflowId);
}
