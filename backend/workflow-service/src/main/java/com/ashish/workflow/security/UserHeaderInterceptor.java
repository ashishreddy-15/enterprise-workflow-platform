package com.ashish.workflow.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.Arrays;
import java.util.Collections;
import java.util.Set;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

@Component
public class UserHeaderInterceptor implements HandlerInterceptor {

    private static final Logger log = LoggerFactory.getLogger(UserHeaderInterceptor.class);

    public static final String HEADER_USER_ID = "X-User-Id";
    public static final String HEADER_USER_ROLES = "X-User-Roles";

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        String userId = request.getHeader(HEADER_USER_ID);
        String rolesHeader = request.getHeader(HEADER_USER_ROLES);

        if (userId != null && !userId.isBlank()) {
            Set<String> roles = (rolesHeader != null && !rolesHeader.isBlank())
                    ? Arrays.stream(rolesHeader.split(","))
                            .map(String::trim)
                            .filter(s -> !s.isEmpty())
                            .collect(Collectors.toSet())
                    : Collections.emptySet();

            UserContextHolder.set(new UserContext(userId.trim(), roles));
            log.debug(
                    "User context set for request [{} {}] - userId: '{}', roles: {}",
                    request.getMethod(),
                    request.getRequestURI(),
                    userId.trim(),
                    roles);
        } else {
            log.debug(
                    "No X-User-Id header present for [{} {}] - proceeding without user context",
                    request.getMethod(),
                    request.getRequestURI());
        }
        return true;
    }

    @Override
    public void afterCompletion(
            HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) {
        log.debug("Clearing user context after request completion");
        // Always clear ThreadLocal to prevent memory leaks or thread-pool identity bleed
        UserContextHolder.clear();
    }
}
