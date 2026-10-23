package com.ashish.workflow.service;

import com.ashish.workflow.contracts.dto.TemplateDefinitionResponse.ConditionalTransitionDto;
import com.ashish.workflow.contracts.dto.TemplateDefinitionResponse.StepDefinitionDto;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.expression.MapAccessor;
import org.springframework.expression.Expression;
import org.springframework.expression.ExpressionParser;
import org.springframework.expression.spel.standard.SpelExpressionParser;
import org.springframework.expression.spel.support.DataBindingPropertyAccessor;
import org.springframework.expression.spel.support.SimpleEvaluationContext;
import org.springframework.stereotype.Service;

@Service
public class SpelRuleEvaluator {

    private static final Logger log = LoggerFactory.getLogger(SpelRuleEvaluator.class);
    private final ExpressionParser parser = new SpelExpressionParser();

    /**
     * Resolves the target state for a given action from the current step definition.
     * Evaluates dynamic SpEL conditional transitions in priority order (lowest priority integer first).
     * If no condition evaluates to true (or none exist for this action), falls back to the static transitions map.
     *
     * @param currentStep Step definition
     * @param normalizedAction Normalized uppercase action name (e.g. "APPROVE", "SUBMIT")
     * @param contextVariables Form payload and accumulated workflow context variables
     * @return Target state name, or null if no transition matches
     */
    public String resolveNextState(
            StepDefinitionDto currentStep, String normalizedAction, Map<String, Object> contextVariables) {
        if (currentStep == null || normalizedAction == null) {
            return null;
        }

        List<ConditionalTransitionDto> conditionals = currentStep.conditionalTransitions();
        if (conditionals != null && !conditionals.isEmpty()) {
            List<ConditionalTransitionDto> matchingActionConditionals = conditionals.stream()
                    .filter(c -> c.action() != null && c.action().equalsIgnoreCase(normalizedAction))
                    .sorted(Comparator.comparingInt(ConditionalTransitionDto::priority))
                    .toList();

            for (ConditionalTransitionDto candidate : matchingActionConditionals) {
                if (evaluateCondition(candidate.condition(), contextVariables)) {
                    log.info(
                            "Dynamic conditional rule satisfied: '{}' -> routing to target state '{}' (action: '{}', priority: {})",
                            candidate.condition(),
                            candidate.targetState(),
                            normalizedAction,
                            candidate.priority());
                    return candidate.targetState();
                }
            }
        }

        // Fallback to static transitions map
        if (currentStep.transitions() != null) {
            return currentStep.transitions().get(normalizedAction);
        }

        return null;
    }

    /**
     * Evaluates a boolean SpEL condition securely using SimpleEvaluationContext.
     * Read-only data binding prevents code execution, reflection, or OS process spawning.
     */
    public boolean evaluateCondition(String conditionExpression, Map<String, Object> variables) {
        if (conditionExpression == null || conditionExpression.isBlank()) {
            return true;
        }

        try {
            Map<String, Object> sanitized = sanitizeVariables(variables);

            SimpleEvaluationContext context = SimpleEvaluationContext.forPropertyAccessors(
                            DataBindingPropertyAccessor.forReadOnlyAccess(), new MapAccessor())
                    .withRootObject(sanitized)
                    .build();

            // Register individual variables for #variable access
            for (Map.Entry<String, Object> entry : sanitized.entrySet()) {
                context.setVariable(entry.getKey(), entry.getValue());
            }
            context.setVariable("payload", sanitized);
            context.setVariable("context", sanitized);

            Expression expr = parser.parseExpression(conditionExpression);
            Boolean result = expr.getValue(context, sanitized, Boolean.class);
            log.debug(
                    "SpEL condition '{}' evaluated with variables {} -> {}",
                    conditionExpression,
                    sanitized.keySet(),
                    result);
            return Boolean.TRUE.equals(result);
        } catch (Exception e) {
            log.warn(
                    "Failed to evaluate SpEL condition '{}' with context {}: {}",
                    conditionExpression,
                    variables,
                    e.getMessage());
            return false;
        }
    }

    private Map<String, Object> sanitizeVariables(Map<String, Object> raw) {
        if (raw == null || raw.isEmpty()) {
            return Collections.emptyMap();
        }
        Map<String, Object> sanitized = new HashMap<>();
        for (Map.Entry<String, Object> entry : raw.entrySet()) {
            String key = entry.getKey();
            Object val = entry.getValue();
            if (val instanceof String str) {
                String trimmed = str.trim();
                if (isNumeric(trimmed)) {
                    try {
                        if (trimmed.contains(".")) {
                            val = Double.parseDouble(trimmed);
                        } else {
                            val = Long.parseLong(trimmed);
                        }
                    } catch (NumberFormatException ignored) {
                    }
                } else if ("true".equalsIgnoreCase(trimmed) || "false".equalsIgnoreCase(trimmed)) {
                    val = Boolean.parseBoolean(trimmed);
                }
            }
            sanitized.put(key, val);
        }
        return sanitized;
    }

    private boolean isNumeric(String str) {
        if (str == null || str.isBlank()) return false;
        return str.matches("^-?\\d+(\\.\\d+)?$");
    }
}
