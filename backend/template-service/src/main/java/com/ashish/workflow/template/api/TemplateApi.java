package com.ashish.workflow.template.api;

import com.ashish.workflow.template.document.WorkflowTemplateDocument;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;

@Tag(
        name = "Workflow Blueprints",
        description = "Authoring, versioning, DAG validation, and lifecycle publishing of workflow templates")
public interface TemplateApi {

    @Operation(
            summary = "Create a new draft workflow template",
            description = "Validates the step DAG state machine for cycles, orphan nodes, and terminal states, "
                    + "then saves the blueprint in DRAFT status.")
    @ApiResponses({
        @ApiResponse(responseCode = "201", description = "Draft template created successfully"),
        @ApiResponse(responseCode = "400", description = "Invalid step schema or malformed DAG transitions")
    })
    ResponseEntity<WorkflowTemplateDocument> createDraft(@RequestBody WorkflowTemplateDocument doc);

    @Operation(
            summary = "Update an existing draft template version",
            description = "Modifies states, SLA targets, form payloads, or actor permissions of an unpublished draft.")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Draft template updated successfully"),
        @ApiResponse(responseCode = "404", description = "Draft template key or version not found"),
        @ApiResponse(responseCode = "409", description = "Cannot update a template version that is already PUBLISHED")
    })
    ResponseEntity<WorkflowTemplateDocument> updateDraft(
            @Parameter(description = "Unique workflow template identifier", example = "PURCHASE_ORDER_V1") @PathVariable
                    String templateKey,
            @Parameter(description = "Template version number", example = "1") @PathVariable int version,
            @RequestBody WorkflowTemplateDocument doc);

    @Operation(
            summary = "Publish a draft template version",
            description =
                    "Promotes the template from DRAFT to PUBLISHED status, making it live for workflow initiation.")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Template published successfully"),
        @ApiResponse(responseCode = "404", description = "Draft template not found")
    })
    ResponseEntity<WorkflowTemplateDocument> publish(
            @Parameter(description = "Unique workflow template identifier", example = "PURCHASE_ORDER_V1") @PathVariable
                    String templateKey,
            @Parameter(description = "Template version number", example = "1") @PathVariable int version);

    @Operation(
            summary = "Get all workflow templates",
            description =
                    "Returns the latest versions of all registered workflow templates, optionally filtered by status.")
    @ApiResponses({@ApiResponse(responseCode = "200", description = "List of templates retrieved successfully")})
    ResponseEntity<List<WorkflowTemplateDocument>> getAll(
            @Parameter(description = "Status filter: ALL, DRAFT, or PUBLISHED", example = "ALL")
                    @RequestParam(required = false, defaultValue = "ALL")
                    String status);

    @Operation(
            summary = "Get a workflow template by key",
            description =
                    "Fetches a template blueprint by its unique key, optionally restricting to published version.")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Template found and returned"),
        @ApiResponse(responseCode = "404", description = "Template key not found")
    })
    ResponseEntity<WorkflowTemplateDocument> getTemplate(
            @Parameter(description = "Unique workflow template identifier", example = "PURCHASE_ORDER_V1") @PathVariable
                    String templateKey,
            @Parameter(description = "If true, only returns active PUBLISHED version", example = "false")
                    @RequestParam(required = false, defaultValue = "false")
                    boolean publishedOnly);

    @Operation(
            summary = "Get full version history for a workflow template key",
            description = "Returns all draft and published revisions for the specified template key.")
    @ApiResponses({@ApiResponse(responseCode = "200", description = "Version history retrieved successfully")})
    ResponseEntity<List<WorkflowTemplateDocument>> getAllVersions(
            @Parameter(description = "Unique workflow template identifier", example = "PURCHASE_ORDER_V1") @PathVariable
                    String templateKey);
}
