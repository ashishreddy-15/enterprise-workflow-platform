package com.ashish.workflow.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.ashish.workflow.contracts.dto.TemplateDefinitionResponse.ConditionalTransitionDto;
import com.ashish.workflow.contracts.dto.TemplateDefinitionResponse.StepDefinitionDto;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class SpelRuleEvaluatorTest {

    private SpelRuleEvaluator evaluator;

    @BeforeEach
    void setUp() {
        evaluator = new SpelRuleEvaluator();
    }

    @Test
    @DisplayName("Should evaluate numeric condition with #var format")
    void testNumericConditionWithHashVar() {
        Map<String, Object> vars = Map.of("amount", 25000);
        assertThat(evaluator.evaluateCondition("#amount > 10000", vars)).isTrue();
        assertThat(evaluator.evaluateCondition("#amount < 10000", vars)).isFalse();
    }

    @Test
    @DisplayName("Should evaluate numeric condition with string representation of number")
    void testNumericConditionWithStringNumber() {
        Map<String, Object> vars = Map.of("amount", "15000");
        assertThat(evaluator.evaluateCondition("#amount > 10000", vars)).isTrue();
        assertThat(evaluator.evaluateCondition("#amount <= 5000", vars)).isFalse();
    }

    @Test
    @DisplayName("Should evaluate root property and payload dictionary access")
    void testRootPropertyAndPayloadAccess() {
        Map<String, Object> vars = Map.of("amount", 50000, "department", "LEGAL");
        assertThat(evaluator.evaluateCondition("amount > 20000 && department == 'LEGAL'", vars))
                .isTrue();
        assertThat(evaluator.evaluateCondition("#payload['department'] == 'LEGAL'", vars))
                .isTrue();
    }

    @Test
    @DisplayName("Should resolve next state in priority order")
    void testResolveNextStatePriority() {
        StepDefinitionDto step = new StepDefinitionDto(
                1,
                "Purchase Request Approval",
                "APPROVAL",
                "ROLE",
                "ROLE_MANAGER",
                List.of("amount"),
                false,
                24,
                Map.of("APPROVE", "PENDING_MANAGER_APPROVAL", "REJECT", "REJECTED"),
                List.of(
                        new ConditionalTransitionDto("APPROVE", "#amount > 50000", "PENDING_CFO_APPROVAL", 1),
                        new ConditionalTransitionDto("APPROVE", "#amount > 10000", "PENDING_VP_APPROVAL", 2),
                        new ConditionalTransitionDto("APPROVE", "#amount <= 10000", "APPROVED", 3)),
                List.of());

        // Amount > 50k routes to CFO
        String state1 = evaluator.resolveNextState(step, "APPROVE", Map.of("amount", 75000));
        assertThat(state1).isEqualTo("PENDING_CFO_APPROVAL");

        // Amount = 25k routes to VP
        String state2 = evaluator.resolveNextState(step, "APPROVE", Map.of("amount", 25000));
        assertThat(state2).isEqualTo("PENDING_VP_APPROVAL");

        // Amount = 5k routes to APPROVED
        String state3 = evaluator.resolveNextState(step, "APPROVE", Map.of("amount", 5000));
        assertThat(state3).isEqualTo("APPROVED");

        // REJECT falls back to static transitions map
        String state4 = evaluator.resolveNextState(step, "REJECT", Map.of("amount", 75000));
        assertThat(state4).isEqualTo("REJECTED");
    }

    @Test
    @DisplayName("Should fall back to static transitions when condition does not match")
    void testFallbackToStaticTransitions() {
        StepDefinitionDto step = new StepDefinitionDto(
                1,
                "Standard Review",
                "APPROVAL",
                "ROLE",
                "ROLE_MANAGER",
                List.of(),
                false,
                null,
                Map.of("APPROVE", "PENDING_REGULAR_APPROVAL"),
                List.of(new ConditionalTransitionDto("APPROVE", "#amount > 100000", "PENDING_BOARD_APPROVAL", 1)),
                List.of());

        // Under 100k: conditional rule fails, falls back to static transitions map
        String state = evaluator.resolveNextState(step, "APPROVE", Map.of("amount", 5000));
        assertThat(state).isEqualTo("PENDING_REGULAR_APPROVAL");
    }

    @Test
    @DisplayName("Safe evaluation: arbitrary code execution or invalid syntax safely handled")
    void testSafeEvaluation() {
        Map<String, Object> vars = Map.of("amount", 100);
        // Malicious/invalid expressions should fail safely to false without crashing
        assertThat(evaluator.evaluateCondition("T(java.lang.Runtime).getRuntime().exec('calc')", vars))
                .isFalse();
        assertThat(evaluator.evaluateCondition("some.invalid..syntax", vars)).isFalse();
    }
}
