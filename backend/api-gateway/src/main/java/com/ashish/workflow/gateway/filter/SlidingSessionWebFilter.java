package com.ashish.workflow.gateway.filter;

import com.ashish.workflow.gateway.config.SessionTokenService;
import org.springframework.core.Ordered;
import org.springframework.security.core.context.ReactiveSecurityContextHolder;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilter;
import org.springframework.web.server.WebFilterChain;
import reactor.core.publisher.Mono;

/**
 * WebFilter that automatically slides the user session cookie on active requests.
 * Evaluates authenticated requests after Spring Security authentication has succeeded.
 */
@Component
public class SlidingSessionWebFilter implements WebFilter, Ordered {

    private final SessionTokenService sessionTokenService;

    public SlidingSessionWebFilter(SessionTokenService sessionTokenService) {
        this.sessionTokenService = sessionTokenService;
    }

    @Override
    public int getOrder() {
        // Runs right after Spring Security authentication filter (order ~0)
        return 10;
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, WebFilterChain chain) {
        return ReactiveSecurityContextHolder.getContext()
                .map(SecurityContext::getAuthentication)
                .filter(auth -> auth != null && auth.isAuthenticated() && auth instanceof JwtAuthenticationToken)
                .cast(JwtAuthenticationToken.class)
                .doOnNext(jwtAuth -> sessionTokenService.trySlideSession(jwtAuth.getToken(), exchange))
                .then(chain.filter(exchange));
    }
}
