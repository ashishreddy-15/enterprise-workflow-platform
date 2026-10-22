package com.ashish.workflow.gateway.config;

import org.springframework.http.HttpCookie;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.server.resource.authentication.BearerTokenAuthenticationToken;
import org.springframework.security.oauth2.server.resource.web.server.authentication.ServerBearerTokenAuthenticationConverter;
import org.springframework.security.web.server.authentication.ServerAuthenticationConverter;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

/**
 * Resolves Bearer tokens either from the standard Authorization header (Bearer &lt;token&gt;)
 * or from a secure HttpOnly cookie (ewp_access_token).
 * This enables production-grade secure cookie authentication for browsers while preserving
 * standard header authorization for external API clients.
 */
@Component
public class CookieOrHeaderBearerTokenConverter implements ServerAuthenticationConverter {

    public static final String COOKIE_NAME = "ewp_access_token";
    private final ServerBearerTokenAuthenticationConverter headerConverter =
            new ServerBearerTokenAuthenticationConverter();

    @Override
    public Mono<Authentication> convert(ServerWebExchange exchange) {
        // 1. Try standard Authorization: Bearer <token> header first
        return headerConverter.convert(exchange).switchIfEmpty(Mono.defer(() -> {
            // 2. Fall back to secure HttpOnly cookie
            HttpCookie cookie = exchange.getRequest().getCookies().getFirst(COOKIE_NAME);
            if (cookie != null && !cookie.getValue().isBlank()) {
                return Mono.just(new BearerTokenAuthenticationToken(cookie.getValue()));
            }
            return Mono.empty();
        }));
    }
}
