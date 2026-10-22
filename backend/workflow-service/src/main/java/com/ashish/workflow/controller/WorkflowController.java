package com.ashish.workflow.controller;

import com.ashish.workflow.api.WorkflowApi;
import com.ashish.workflow.domain.entity.WorkflowInstance;
import com.ashish.workflow.dto.CreateWorkflowRequest;
import com.ashish.workflow.dto.TransitionWorkflowRequest;
import com.ashish.workflow.dto.WorkflowResponse;
import com.ashish.workflow.repository.WorkflowRepository;
import com.ashish.workflow.repository.WorkflowSpecifications;
import com.ashish.workflow.security.UserContext;
import com.ashish.workflow.security.UserContextHolder;
import com.ashish.workflow.service.WorkflowService;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/workflows")
public class WorkflowController implements WorkflowApi {

    private static final Logger log = LoggerFactory.getLogger(WorkflowController.class);

    private final WorkflowService workflowService;
    private final WorkflowRepository workflowRepository;

    public WorkflowController(WorkflowService workflowService, WorkflowRepository workflowRepository) {
        this.workflowService = workflowService;
        this.workflowRepository = workflowRepository;
    }

    @Override
    @PostMapping
    public ResponseEntity<WorkflowResponse> createWorkflow(@RequestBody CreateWorkflowRequest request)
            throws Exception {
        UserContext caller = UserContextHolder.getRequiredContext();
        log.info(
                "REST: Create workflow request - templateId: '{}', requesterId: '{}', title: '{}'",
                request.templateId(),
                caller.userId(),
                request.title());
        WorkflowInstance instance =
                workflowService.createAndTransitWorkflow(request.templateId(), caller.userId(), request.title());
        log.info(
                "REST: Workflow created successfully - id: {}, state: {}",
                instance.getId(),
                instance.getCurrentState());
        return ResponseEntity.status(HttpStatus.CREATED).body(WorkflowResponse.from(instance));
    }

    @Override
    @GetMapping
    public ResponseEntity<List<WorkflowInstance>> searchWorkflows(
            @RequestParam(required = false) String state,
            @RequestParam(required = false) String priority,
            @RequestParam(required = false) String requesterId) {

        log.debug("REST: Search workflows - state: {}, priority: {}, requesterId: {}", state, priority, requesterId);
        Specification<WorkflowInstance> spec = Specification.<WorkflowInstance>unrestricted()
                .and(WorkflowSpecifications.hasState(state))
                .and(WorkflowSpecifications.hasPriority(priority))
                .and(WorkflowSpecifications.requesterEquals(requesterId));

        List<WorkflowInstance> results = workflowRepository.findAll(spec);
        log.debug("REST: Found {} workflows matching criteria", results.size());
        return ResponseEntity.ok(results);
    }

    @Override
    @GetMapping("/{id}")
    public ResponseEntity<WorkflowResponse> getWorkflowById(@PathVariable UUID id) {
        log.debug("REST: Get workflow instance by id: {}", id);
        return workflowRepository
                .findById(id)
                .map(WorkflowResponse::from)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @Override
    @PostMapping("/{id}/transition")
    public ResponseEntity<WorkflowResponse> transitionWorkflow(
            @PathVariable UUID id, @RequestBody TransitionWorkflowRequest request) throws Exception {
        UserContext caller = UserContextHolder.getRequiredContext();
        log.info(
                "REST: Transition workflow request - workflowId: {}, action: '{}', caller: '{}', roles: {}",
                id,
                request.action(),
                caller.userId(),
                caller.roles());
        WorkflowInstance instance =
                workflowService.transitionWorkflow(id, request.action(), caller, request.comments(), request.payload());
        log.info(
                "REST: Workflow {} transitioned successfully to state: '{}'",
                instance.getId(),
                instance.getCurrentState());
        return ResponseEntity.ok(WorkflowResponse.from(instance));
    }
}
