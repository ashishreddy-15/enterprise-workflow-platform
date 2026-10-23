package com.ashish.workflow.gateway.config;

import java.net.URI;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.server.WebFilterExchange;
import org.springframework.security.web.server.authentication.ServerAuthenticationFailureHandler;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

@Component
public class OAuth2AuthenticationFailureHandler implements ServerAuthenticationFailureHandler {

    private static final Logger log = LoggerFactory.getLogger(OAuth2AuthenticationFailureHandler.class);

    @Value("${ewp.auth.frontend-url:http://localhost/}")
    private String defaultFrontendUrl;

    @Override
    public Mono<Void> onAuthenticationFailure(WebFilterExchange webFilterExchange, AuthenticationException exception) {
        log.error("OAuth2 OIDC Authentication Failed: {}", exception.getMessage(), exception);

        ServerWebExchange exchange = webFilterExchange.getExchange();
        URI redirectUri = resolveRedirectUri(exchange);

        log.info("Redirecting unauthenticated user back to frontend: {}", redirectUri);

        exchange.getResponse().setStatusCode(HttpStatus.FOUND);
        exchange.getResponse().getHeaders().setLocation(redirectUri);
        return exchange.getResponse().setComplete();
    }

    private URI resolveRedirectUri(ServerWebExchange exchange) {
        List<String> refererHeaders = exchange.getRequest().getHeaders().get("Referer");
        if (refererHeaders != null && !refererHeaders.isEmpty()) {
            String ref = refererHeaders.get(0);
            if (ref.contains(":4200")) {
                return URI.create("http://localhost:4200/login?error=sso_failed");
            }
        }
        String base = defaultFrontendUrl.endsWith("/") ? defaultFrontendUrl : defaultFrontendUrl + "/";
        return URI.create(base + "login?error=sso_failed");
    }
}
