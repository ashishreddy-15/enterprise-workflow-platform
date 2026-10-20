package com.ashish.workflow.gateway.controller;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

@RestController
@RequestMapping("/auth")
@ConditionalOnProperty(name = "jwt.dev-token.enabled", matchIfMissing = true, havingValue = "true")
public class DevAuthController {

    private final JwtEncoder jwtEncoder;

    public DevAuthController(JwtEncoder jwtEncoder) {
        this.jwtEncoder = jwtEncoder;
    }

    public record TokenRequest(String userId, List<String> roles) {}

    @PostMapping("/dev-token")
    public Mono<Map<String, String>> generateToken(@RequestBody TokenRequest request) {
        Instant now = Instant.now();

        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer("https://auth.ewp.ashish.com")
                .issuedAt(now)
                .expiresAt(now.plus(8, ChronoUnit.HOURS))
                .subject(request.userId() != null ? request.userId() : "anonymous_user")
                .claim("roles", request.roles() != null ? request.roles() : List.of("ROLE_EMPLOYEE"))
                .build();

        JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).build();
        String token =
                jwtEncoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();

        return Mono.just(Map.of(
                "access_token", token,
                "token_type", "Bearer",
                "expires_in", "28800"));
    }
}
