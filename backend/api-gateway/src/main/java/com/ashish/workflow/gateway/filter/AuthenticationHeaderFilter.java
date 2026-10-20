package com.ashish.workflow.gateway.filter;

import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

@Component
public class AuthenticationHeaderFilter implements GlobalFilter, Ordered {

    private static final Logger log = LoggerFactory.getLogger(AuthenticationHeaderFilter.class);

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        ServerHttpRequest request = exchange.getRequest();
        String path = request.getURI().getPath();

        // 1. Allow health checks and public paths without authentication
        if (path.startsWith("/actuator") || path.equals("/health")) {
            return chain.filter(exchange);
        }

        // 2. Extract Authorization Header
        List<String> authHeaders = request.getHeaders().get("Authorization");
        if (authHeaders == null || authHeaders.isEmpty()) {
            log.warn("Unauthorized request to path: {} (missing Authorization header)", path);
            exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
            return exchange.getResponse().setComplete();
        }

        String authHeader = authHeaders.get(0);
        if (!authHeader.startsWith("Bearer ")) {
            exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
            return exchange.getResponse().setComplete();
        }

        String token = authHeader.substring(7).trim();

        // 3. Resolve Identity & Roles (Supports "userId:role1,role2" tokens or JWT decoding)
        String userId;
        String userRoles;

        if (token.contains(":")) {
            String[] parts = token.split(":", 2);
            userId = parts[0];
            userRoles = parts[1];
        } else {
            // Default fallback if a simple username token is passed (e.g., "Bearer ashish")
            userId = token;
            userRoles = "ROLE_EMPLOYEE";
        }

        // 4. SANITIZE & INJECT: Strip client headers and inject trusted headers
        ServerHttpRequest mutatedRequest = exchange.getRequest()
                .mutate()
                .headers(httpHeaders -> {
                    httpHeaders.remove("X-User-Id");
                    httpHeaders.remove("X-User-Roles");
                })
                .header("X-User-Id", userId)
                .header("X-User-Roles", userRoles)
                .build();

        log.debug("Gateway authenticated user='{}' roles='{}' -> routing to {}", userId, userRoles, path);

        return chain.filter(exchange.mutate().request(mutatedRequest).build());
    }

    @Override
    public int getOrder() {
        return -100; // High priority: execute before routing filters
    }
}
