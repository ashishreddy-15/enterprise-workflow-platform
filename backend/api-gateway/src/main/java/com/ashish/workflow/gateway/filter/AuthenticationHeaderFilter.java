package com.ashish.workflow.gateway.filter;

import java.util.Collection;
import java.util.List;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.security.core.context.ReactiveSecurityContextHolder;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

@Component
public class AuthenticationHeaderFilter implements GlobalFilter, Ordered {

    private static final Logger log = LoggerFactory.getLogger(AuthenticationHeaderFilter.class);

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        // Always strip client-supplied identity headers first to prevent spoofing
        ServerHttpRequest sanitizedRequest = exchange.getRequest()
                .mutate()
                .headers(httpHeaders -> {
                    httpHeaders.remove("X-User-Id");
                    httpHeaders.remove("X-User-Roles");
                })
                .build();

        ServerWebExchange sanitizedExchange =
                exchange.mutate().request(sanitizedRequest).build();

        return ReactiveSecurityContextHolder.getContext()
                .map(SecurityContext::getAuthentication)
                .filter(auth -> auth instanceof JwtAuthenticationToken)
                .cast(JwtAuthenticationToken.class)
                .map(JwtAuthenticationToken::getToken)
                .map(jwt -> injectClaimsIntoHeaders(sanitizedExchange, jwt))
                .defaultIfEmpty(sanitizedExchange)
                .flatMap(chain::filter);
    }

    private ServerWebExchange injectClaimsIntoHeaders(ServerWebExchange exchange, Jwt jwt) {
        // Support standard 'sub' or Azure AD 'oid' / 'preferred_username'
        String userId = jwt.getSubject();
        if (userId == null || userId.isBlank()) {
            userId = jwt.getClaimAsString("preferred_username");
        }
        if (userId == null || userId.isBlank()) {
            userId = jwt.getClaimAsString("oid");
        }

        // Extract roles from 'roles' or 'scp'/'scope' claim
        List<String> rolesList = extractRoles(jwt);
        String rolesHeader = String.join(",", rolesList);

        ServerHttpRequest mutatedRequest = exchange.getRequest()
                .mutate()
                .header("X-User-Id", userId)
                .header("X-User-Roles", rolesHeader)
                .build();

        log.debug(
                "Verified JWT -> Injected X-User-Id='{}', X-User-Roles='{}' for path={}",
                userId,
                rolesHeader,
                exchange.getRequest().getURI().getPath());

        return exchange.mutate().request(mutatedRequest).build();
    }

    private List<String> extractRoles(Jwt jwt) {
        // 1. Direct 'roles' collection
        Object rolesClaim = jwt.getClaims().get("roles");
        if (rolesClaim instanceof Collection<?> collection) {
            return collection.stream().map(Object::toString).collect(Collectors.toList());
        }

        // 2. Direct 'scope' or 'scp' claim
        String scopeClaim = jwt.getClaimAsString("scope");
        if (scopeClaim == null) {
            scopeClaim = jwt.getClaimAsString("scp");
        }
        if (scopeClaim != null && !scopeClaim.isBlank()) {
            return List.of(scopeClaim.split(" "));
        }

        return List.of("ROLE_EMPLOYEE");
    }

    @Override
    public int getOrder() {
        // Run after Spring Security WebFilterChain populates ReactiveSecurityContextHolder
        return 1;
    }
}
