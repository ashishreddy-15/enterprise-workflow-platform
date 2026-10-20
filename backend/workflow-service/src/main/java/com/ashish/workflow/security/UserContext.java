package com.ashish.workflow.security;

import java.util.Set;

public record UserContext(String userId, Set<String> roles) {
    public boolean hasRole(String requiredRole) {
        if (requiredRole == null || requiredRole.isBlank()) {
            return true;
        }
        return roles != null && roles.stream().anyMatch(r -> r.equalsIgnoreCase(requiredRole.trim()));
    }
}
