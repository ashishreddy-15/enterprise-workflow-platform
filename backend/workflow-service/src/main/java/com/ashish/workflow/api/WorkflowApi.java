package com.ashish.workflow.api;

import com.ashish.workflow.domain.entity.WorkflowInstance;
import com.ashish.workflow.dto.CreateWorkflowRequest;
import com.ashish.workflow.dto.TransitionWorkflowRequest;
import com.ashish.workflow.dto.WorkflowResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;

@Tag(
        name = "Workflow Instances",
        description = "Workflow lifecycle execution, state transitions, and dynamic JPA criteria queries")
public interface WorkflowApi {

    @Operation(
            summary = "Start a new workflow instance",
            description = "Freezes a template snapshot, creates a workflow instance in the initial entry state, "
                    + "and commits an atomic outbox event.")
    @ApiResponses({
        @ApiResponse(responseCode = "201", description = "Workflow instance initiated successfully"),
        @ApiResponse(responseCode = "400", description = "Template blueprint not found or invalid initial payload")
    })
    ResponseEntity<WorkflowResponse> createWorkflow(@RequestBody CreateWorkflowRequest request) throws Exception;

    @Operation(
            summary = "Search workflow instances with dynamic filters",
            description =
                    "Executes type-safe composable JPA Specifications filtering by current state, priority, or requester.")
    @ApiResponses({@ApiResponse(responseCode = "200", description = "Matching workflow instances returned")})
    ResponseEntity<List<WorkflowInstance>> searchWorkflows(
            @Parameter(description = "Filter by workflow state (e.g. SUBMITTED, IN_REVIEW, APPROVED)")
                    @RequestParam(required = false)
                    String state,
            @Parameter(description = "Filter by priority (e.g. LOW, MEDIUM, HIGH, CRITICAL)")
                    @RequestParam(required = false)
                    String priority,
            @Parameter(description = "Filter by initiating requester user ID") @RequestParam(required = false)
                    String requesterId);

    @Operation(
            summary = "Get workflow instance details by ID",
            description = "Retrieves workflow state, version, frozen template snapshot, and contextual JSON data.")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Workflow details retrieved successfully"),
        @ApiResponse(responseCode = "404", description = "Workflow ID not found")
    })
    ResponseEntity<WorkflowResponse> getWorkflowById(
            @Parameter(description = "Workflow instance UUID") @PathVariable UUID id);

    @Operation(
            summary = "Transition workflow state by action key",
            description =
                    "Executes a state machine transition. Validates Segregation of Duties (SoD), actor role authority, "
                            + "and mandatory payload schema, updating PostgreSQL with optimistic locking and publishing to Kafka via Outbox.")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Workflow transitioned successfully"),
        @ApiResponse(
                responseCode = "403",
                description = "Caller lacks required authority or violated Segregation of Duties"),
        @ApiResponse(responseCode = "409", description = "Optimistic lock conflict or invalid transition action")
    })
    ResponseEntity<WorkflowResponse> transitionWorkflow(
            @Parameter(description = "Workflow instance UUID") @PathVariable UUID id,
            @RequestBody TransitionWorkflowRequest request)
            throws Exception;
}
