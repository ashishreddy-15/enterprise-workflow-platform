package com.ashish.workflow.controller;

import com.ashish.workflow.domain.entity.WorkflowInstance;
import com.ashish.workflow.dto.CreateWorkflowRequest;
import com.ashish.workflow.dto.TransitionWorkflowRequest;
import com.ashish.workflow.dto.WorkflowResponse;
import com.ashish.workflow.repository.WorkflowRepository;
import com.ashish.workflow.repository.WorkflowSpecifications;
import com.ashish.workflow.service.WorkflowService;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/workflows")
public class WorkflowController {

    private final WorkflowService workflowService;
    private final WorkflowRepository workflowRepository;

    public WorkflowController(WorkflowService workflowService, WorkflowRepository workflowRepository) {
        this.workflowService = workflowService;
        this.workflowRepository = workflowRepository;
    }

    @PostMapping
    public ResponseEntity<WorkflowResponse> createWorkflow(@RequestBody CreateWorkflowRequest request) {
        WorkflowInstance instance = workflowService.createAndTransitWorkflow(
                request.templateId(),
                request.requesterId(),
                request.title()
        );
        return ResponseEntity.status(HttpStatus.CREATED).body(WorkflowResponse.from(instance));
    }

    @GetMapping
    public ResponseEntity<List<WorkflowInstance>> searchWorkflows(
            @RequestParam(required = false) String state,
            @RequestParam(required = false) String priority,
            @RequestParam(required = false) String requesterId) {

        Specification<WorkflowInstance> spec = Specification.<WorkflowInstance>unrestricted()
                .and(WorkflowSpecifications.hasState(state))
                .and(WorkflowSpecifications.hasPriority(priority))
                .and(WorkflowSpecifications.requesterEquals(requesterId));

        return ResponseEntity.ok(workflowRepository.findAll(spec));
    }

    @PostMapping("/{id}/transition")
    public ResponseEntity<WorkflowResponse> transitionWorkflow(
            @PathVariable UUID id,
            @RequestBody TransitionWorkflowRequest request) {
        WorkflowInstance instance = workflowService.transitionWorkflow(
                id,
                request.action(),
                request.actorId(),
                request.comments(),
                request.payload()
        );
        return ResponseEntity.ok(WorkflowResponse.from(instance));
    }

}