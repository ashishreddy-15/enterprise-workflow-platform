package com.ashish.workflow.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import com.ashish.workflow.client.TemplateServiceClient;
import com.ashish.workflow.contracts.dto.TemplateDefinitionResponse;
import com.ashish.workflow.contracts.dto.TemplateDefinitionResponse.ConditionalTransitionDto;
import com.ashish.workflow.contracts.dto.TemplateDefinitionResponse.StepDefinitionDto;
import com.ashish.workflow.domain.entity.WorkflowInstance;
import com.ashish.workflow.domain.entity.WorkflowTask;
import com.ashish.workflow.repository.OutboxRepository;
import com.ashish.workflow.repository.WorkflowRepository;
import com.ashish.workflow.security.UserContext;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

class WorkflowServiceEngineTest {

    private WorkflowRepository workflowRepository;
    private OutboxRepository outboxRepository;
    private TemplateServiceClient templateServiceClient;
    private ObjectMapper objectMapper;
    private SpelRuleEvaluator spelRuleEvaluator;
    private WorkflowService workflowService;

    @BeforeEach
    void setUp() {
        workflowRepository = mock(WorkflowRepository.class);
        outboxRepository = mock(OutboxRepository.class);
        templateServiceClient = mock(TemplateServiceClient.class);
        objectMapper = new ObjectMapper();
        spelRuleEvaluator = new SpelRuleEvaluator();
        workflowService = new WorkflowService(
                workflowRepository, outboxRepository, templateServiceClient, objectMapper, spelRuleEvaluator);
    }

    private TemplateDefinitionResponse buildDynamicBranchingTemplate() {
        StepDefinitionDto submissionStep = new StepDefinitionDto(
                1,
                "Purchase Submission",
                "DOCUMENT_SUBMISSION",
                "REQUESTER",
                null,
                List.of("amount"),
                false,
                24,
                Map.of("SUBMIT", "PENDING_APPROVAL"),
                List.of(
                        new ConditionalTransitionDto("SUBMIT", "#amount > 10000", "PENDING_VP_APPROVAL", 1),
                        new ConditionalTransitionDto("SUBMIT", "#amount <= 10000", "PENDING_MANAGER_APPROVAL", 2)),
                List.of());

        StepDefinitionDto vpStep = new StepDefinitionDto(
                2,
                "VP Approval",
                "APPROVAL",
                "ROLE",
                "ROLE_VP",
                List.of(),
                false,
                48,
                Map.of("APPROVE", "APPROVED", "REJECT", "REJECTED"),
                List.of(),
                List.of());

        StepDefinitionDto mgrStep = new StepDefinitionDto(
                2,
                "Manager Approval",
                "APPROVAL",
                "ROLE",
                "ROLE_MANAGER",
                List.of(),
                false,
                24,
                Map.of("APPROVE", "APPROVED", "REJECT", "REJECTED"),
                List.of(),
                List.of());

        StepDefinitionDto approvedStep =
                new StepDefinitionDto(3, "Approved", "TERMINAL", "ANY", null, List.of(), true, null, Map.of());

        StepDefinitionDto rejectedStep =
                new StepDefinitionDto(3, "Rejected", "TERMINAL", "ANY", null, List.of(), true, null, Map.of());

        return new TemplateDefinitionResponse(
                "tpl-1",
                "CAPEX_REQUEST",
                1,
                "CapEx Approval",
                "Test capEx workflow",
                "PUBLISHED",
                "DRAFT_SUBMISSION",
                Map.of(
                        "DRAFT_SUBMISSION", submissionStep,
                        "PENDING_VP_APPROVAL", vpStep,
                        "PENDING_MANAGER_APPROVAL", mgrStep,
                        "APPROVED", approvedStep,
                        "REJECTED", rejectedStep));
    }

    private TemplateDefinitionResponse buildForkJoinParallelTemplate() {
        StepDefinitionDto initStep = new StepDefinitionDto(
                1,
                "Initiate Vendor",
                "DOCUMENT_SUBMISSION",
                "REQUESTER",
                null,
                List.of(),
                false,
                24,
                Map.of("SUBMIT", "PARALLEL_REVIEW"),
                List.of(),
                List.of());

        // Step 2 is a Fork-Join Parallel Approval requiring both LEGAL and FINANCE
        StepDefinitionDto parallelStep = new StepDefinitionDto(
                2,
                "Joint Legal and Finance Sign-off",
                "PARALLEL_APPROVAL",
                "PARALLEL_ROLES",
                null,
                List.of(),
                false,
                48,
                Map.of("APPROVE", "APPROVED", "REJECT", "REJECTED"),
                List.of(),
                List.of("ROLE_LEGAL_COUNSEL", "ROLE_FINANCE_DIRECTOR"));

        StepDefinitionDto approvedStep =
                new StepDefinitionDto(3, "Approved", "TERMINAL", "ANY", null, List.of(), true, null, Map.of());

        StepDefinitionDto rejectedStep =
                new StepDefinitionDto(3, "Rejected", "TERMINAL", "ANY", null, List.of(), true, null, Map.of());

        return new TemplateDefinitionResponse(
                "tpl-2",
                "VENDOR_ONBOARDING",
                1,
                "Vendor Onboarding",
                "Vendor onboarding with parallel sign-offs",
                "PUBLISHED",
                "INITIATE",
                Map.of(
                        "INITIATE", initStep,
                        "PARALLEL_REVIEW", parallelStep,
                        "APPROVED", approvedStep,
                        "REJECTED", rejectedStep));
    }

    @Test
    @DisplayName("Dynamic Conditional Branching: SpEL routes amount > 10,000 to PENDING_VP_APPROVAL")
    void testDynamicConditionalBranchingHighAmount() {
        TemplateDefinitionResponse template = buildDynamicBranchingTemplate();
        when(templateServiceClient.getActivePublishedTemplate("CAPEX_REQUEST")).thenReturn(Optional.of(template));
        when(workflowRepository.save(any(WorkflowInstance.class))).thenAnswer(i -> i.getArgument(0));

        // Create workflow
        WorkflowInstance workflow =
                workflowService.createAndTransitWorkflow("CAPEX_REQUEST", "david.employee", "New Laptop Purchase");
        assertThat(workflow.getCurrentState()).isEqualTo("DRAFT_SUBMISSION");

        when(workflowRepository.findById(workflow.getId())).thenReturn(Optional.of(workflow));

        // Transition with amount = 25000 (exceeds 10,000 threshold)
        UserContext requester = new UserContext("david.employee", Set.of("ROLE_EMPLOYEE"));
        WorkflowInstance transitioned = workflowService.transitionWorkflow(
                workflow.getId(), "SUBMIT", requester, "High value purchase", Map.of("amount", 25000));

        // Assert routed to VP Approval due to condition #amount > 10000
        assertThat(transitioned.getCurrentState()).isEqualTo("PENDING_VP_APPROVAL");
        assertThat(transitioned.getTasks()).hasSize(2);
        WorkflowTask vpTask = transitioned.getTasks().get(1);
        assertThat(vpTask.getAssignedRole()).isEqualTo("ROLE_VP");
        assertThat(vpTask.getStatus()).isEqualTo("PENDING");
    }

    @Test
    @DisplayName("Dynamic Conditional Branching: SpEL routes amount <= 10,000 to PENDING_MANAGER_APPROVAL")
    void testDynamicConditionalBranchingLowAmount() {
        TemplateDefinitionResponse template = buildDynamicBranchingTemplate();
        when(templateServiceClient.getActivePublishedTemplate("CAPEX_REQUEST")).thenReturn(Optional.of(template));
        when(workflowRepository.save(any(WorkflowInstance.class))).thenAnswer(i -> i.getArgument(0));

        WorkflowInstance workflow =
                workflowService.createAndTransitWorkflow("CAPEX_REQUEST", "david.employee", "Office Supplies Purchase");

        when(workflowRepository.findById(workflow.getId())).thenReturn(Optional.of(workflow));

        // Transition with amount = 4500 (<= 10,000)
        UserContext requester = new UserContext("david.employee", Set.of("ROLE_EMPLOYEE"));
        WorkflowInstance transitioned = workflowService.transitionWorkflow(
                workflow.getId(), "SUBMIT", requester, "Low value purchase", Map.of("amount", 4500));

        // Assert routed to Manager Approval
        assertThat(transitioned.getCurrentState()).isEqualTo("PENDING_MANAGER_APPROVAL");
        assertThat(transitioned.getTasks()).hasSize(2);
        WorkflowTask mgrTask = transitioned.getTasks().get(1);
        assertThat(mgrTask.getAssignedRole()).isEqualTo("ROLE_MANAGER");
        assertThat(mgrTask.getStatus()).isEqualTo("PENDING");
    }

    @Test
    @DisplayName("Parallel Fork-Join: Spawns independent tasks and requires all roles before advancing")
    void testForkJoinParallelApprovals() {
        TemplateDefinitionResponse template = buildForkJoinParallelTemplate();
        when(templateServiceClient.getActivePublishedTemplate("VENDOR_ONBOARDING"))
                .thenReturn(Optional.of(template));
        when(workflowRepository.save(any(WorkflowInstance.class))).thenAnswer(i -> i.getArgument(0));

        WorkflowInstance workflow =
                workflowService.createAndTransitWorkflow("VENDOR_ONBOARDING", "david.employee", "Acme Vendor");

        when(workflowRepository.findById(workflow.getId())).thenReturn(Optional.of(workflow));

        // Requester submits initial form -> forks into PARALLEL_REVIEW
        UserContext requester = new UserContext("david.employee", Set.of("ROLE_EMPLOYEE"));
        workflowService.transitionWorkflow(workflow.getId(), "SUBMIT", requester, "Submitted vendor docs", Map.of());

        assertThat(workflow.getCurrentState()).isEqualTo("PARALLEL_REVIEW");
        // Verify fork: 2 parallel pending tasks spawned (Legal + Finance)
        List<WorkflowTask> pending = workflow.getTasks().stream()
                .filter(t -> "PENDING".equalsIgnoreCase(t.getStatus()))
                .toList();
        assertThat(pending).hasSize(2);
        List<String> assignedRoles =
                pending.stream().map(WorkflowTask::getAssignedRole).toList();
        assertThat(assignedRoles).containsExactlyInAnyOrder("ROLE_LEGAL_COUNSEL", "ROLE_FINANCE_DIRECTOR");

        // Step 2a: Elena (Legal) signs off
        UserContext elenaLegal = new UserContext("elena.legal", Set.of("ROLE_LEGAL_COUNSEL"));
        WorkflowInstance partial = workflowService.transitionWorkflow(
                workflow.getId(), "APPROVE", elenaLegal, "Legal contracts verified", Map.of());

        // Join is partial: state MUST stay PARALLEL_REVIEW
        assertThat(partial.getCurrentState()).isEqualTo("PARALLEL_REVIEW");
        List<WorkflowTask> remaining = partial.getTasks().stream()
                .filter(t -> "PENDING".equalsIgnoreCase(t.getStatus()))
                .toList();
        assertThat(remaining).hasSize(1);
        assertThat(remaining.get(0).getAssignedRole()).isEqualTo("ROLE_FINANCE_DIRECTOR");

        // Step 2b: Alex (Finance) signs off
        UserContext alexFinance = new UserContext("alex.finance", Set.of("ROLE_FINANCE_DIRECTOR"));
        WorkflowInstance completed = workflowService.transitionWorkflow(
                workflow.getId(), "APPROVE", alexFinance, "Financial stability confirmed", Map.of());

        // Join satisfied: state MUST advance to APPROVED!
        assertThat(completed.getCurrentState()).isEqualTo("APPROVED");
        List<WorkflowTask> finalPending = completed.getTasks().stream()
                .filter(t -> "PENDING".equalsIgnoreCase(t.getStatus()))
                .toList();
        assertThat(finalPending).isEmpty();
    }

    @Test
    @DisplayName("Parallel Fork-Join: Rejection by any approver immediately cancels sibling tasks and rejects workflow")
    void testForkJoinRejectionCancelsSiblings() {
        TemplateDefinitionResponse template = buildForkJoinParallelTemplate();
        when(templateServiceClient.getActivePublishedTemplate("VENDOR_ONBOARDING"))
                .thenReturn(Optional.of(template));
        when(workflowRepository.save(any(WorkflowInstance.class))).thenAnswer(i -> i.getArgument(0));

        WorkflowInstance workflow =
                workflowService.createAndTransitWorkflow("VENDOR_ONBOARDING", "david.employee", "Acme Vendor");

        when(workflowRepository.findById(workflow.getId())).thenReturn(Optional.of(workflow));

        UserContext requester = new UserContext("david.employee", Set.of("ROLE_EMPLOYEE"));
        workflowService.transitionWorkflow(workflow.getId(), "SUBMIT", requester, "Vendor docs", Map.of());

        // Elena (Legal) rejects the contract
        UserContext elenaLegal = new UserContext("elena.legal", Set.of("ROLE_LEGAL_COUNSEL"));
        WorkflowInstance rejected = workflowService.transitionWorkflow(
                workflow.getId(), "REJECT", elenaLegal, "Non-compliant terms", Map.of());

        assertThat(rejected.getCurrentState()).isEqualTo("REJECTED");

        // Elena's task is REJECTED, and Alex's sibling task was CANCELLED
        WorkflowTask legalTask = rejected.getTasks().stream()
                .filter(t -> "ROLE_LEGAL_COUNSEL".equals(t.getAssignedRole()))
                .findFirst()
                .orElseThrow();
        assertThat(legalTask.getStatus()).isEqualTo("REJECT");

        WorkflowTask financeTask = rejected.getTasks().stream()
                .filter(t -> "ROLE_FINANCE_DIRECTOR".equals(t.getAssignedRole()))
                .findFirst()
                .orElseThrow();
        assertThat(financeTask.getStatus()).isEqualTo("CANCELLED");
    }

    @Test
    @DisplayName("Parallel Fork-Join: Segregation of Duties prevents requester from approving")
    void testForkJoinSegregationOfDuties() {
        TemplateDefinitionResponse template = buildForkJoinParallelTemplate();
        when(templateServiceClient.getActivePublishedTemplate("VENDOR_ONBOARDING"))
                .thenReturn(Optional.of(template));
        when(workflowRepository.save(any(WorkflowInstance.class))).thenAnswer(i -> i.getArgument(0));

        WorkflowInstance workflow =
                workflowService.createAndTransitWorkflow("VENDOR_ONBOARDING", "david.employee", "Acme Vendor");

        when(workflowRepository.findById(workflow.getId())).thenReturn(Optional.of(workflow));

        UserContext requester = new UserContext("david.employee", Set.of("ROLE_EMPLOYEE", "ROLE_LEGAL_COUNSEL"));
        workflowService.transitionWorkflow(workflow.getId(), "SUBMIT", requester, "Vendor docs", Map.of());

        // Requester tries to approve their own request on parallel approval step
        assertThatThrownBy(() -> workflowService.transitionWorkflow(
                        workflow.getId(), "APPROVE", requester, "Trying to approve myself", Map.of()))
                .isInstanceOf(SecurityException.class)
                .hasMessageContaining("Segregation of Duties");
    }
}
