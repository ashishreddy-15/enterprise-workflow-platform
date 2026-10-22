package com.ashish.workflow.api;

import com.ashish.workflow.service.TaskService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestParam;

@Tag(
        name = "Task Inbox & Decisions",
        description = "Human workflow task management, approvals, rejections, and dynamic role-based inbox queries")
public interface TaskApi {

    @Operation(
            summary = "Get actionable task inbox for authenticated user",
            description = "Returns tasks actionable by the caller's role authorities or user identity. "
                    + "Supports dynamic views: `inbox` (assigned to user/roles), `participated` (previously completed), "
                    + "`initiated` / `my-requests` (created by caller), and `all` (for admins).")
    @ApiResponses({@ApiResponse(responseCode = "200", description = "Tasks retrieved successfully")})
    ResponseEntity<List<TaskService.TaskInboxItem>> getInbox(
            @Parameter(description = "Inbox filter category: inbox, participated, initiated, or all", example = "inbox")
                    @RequestParam(required = false, defaultValue = "inbox")
                    String filter)
            throws Exception;
}
