package com.ashish.workflow.gateway.config;

import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpCookie;
import org.springframework.http.ResponseCookie;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ServerWebExchange;

/**
 * Enterprise Session Token Service implementing Sliding Window Session Management (Rolling Cookie / BFF Pattern).
 * Enforces two industry-standard timeouts:
 * 1. Idle Timeout (Inactivity): Session expires if user sends no requests for `idleTimeoutMinutes`.
 * 2. Absolute Maximum Lifespan: Hard ceiling (`maxLifespanHours`) requiring re-authentication.
 */
@Service
public class SessionTokenService {

    private static final Logger log = LoggerFactory.getLogger(SessionTokenService.class);

    public static final String COOKIE_NAME = "ewp_access_token";
    public static final String CLAIM_ROLES = "roles";
    public static final String CLAIM_SESSION_START = "session_start";
    public static final String CLAIM_MAX_EXP = "max_exp";

    private final JwtEncoder jwtEncoder;

    @Value("${jwt.issuer:enterprise-workflow-platform}")
    private String issuer;

    @Value("${ewp.auth.session.idle-timeout-minutes:60}")
    private long idleTimeoutMinutes;

    @Value("${ewp.auth.session.max-lifespan-hours:8}")
    private long maxLifespanHours;

    @Value("${ewp.auth.session.renew-threshold-minutes:15}")
    private long renewThresholdMinutes;

    public SessionTokenService(JwtEncoder jwtEncoder) {
        this.jwtEncoder = jwtEncoder;
    }

    /**
     * Issues an initial platform JWT and attaches the HttpOnly session cookie to the response.
     */
    public String createSessionToken(String userId, List<String> roles, ServerWebExchange exchange) {
        Instant now = Instant.now();
        Instant sessionStart = now;
        Instant maxExp = now.plus(maxLifespanHours, ChronoUnit.HOURS);
        Instant idleExp = now.plus(idleTimeoutMinutes, ChronoUnit.MINUTES);
        Instant exp = idleExp.isBefore(maxExp) ? idleExp : maxExp;

        List<String> resolvedRoles = (roles != null && !roles.isEmpty()) ? roles : List.of("ROLE_EMPLOYEE");

        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer(issuer)
                .issuedAt(now)
                .expiresAt(exp)
                .subject(userId)
                .claim(CLAIM_ROLES, resolvedRoles)
                .claim(CLAIM_SESSION_START, sessionStart.getEpochSecond())
                .claim(CLAIM_MAX_EXP, maxExp.getEpochSecond())
                .build();

        JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).build();
        String token =
                jwtEncoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();

        attachSessionCookie(exchange, token, Duration.between(now, exp));
        log.info(
                "Issued session token for user='{}', issuer='{}', idle-exp='{}', max-exp='{}'",
                userId,
                issuer,
                exp,
                maxExp);
        return token;
    }

    /**
     * Inspects an authenticated request's token. If it was sent via the session cookie and is nearing
     * its idle expiration, rolls the session forward (sliding window) while respecting the absolute max ceiling.
     *
     * @return true if the session was renewed and a refreshed cookie attached; false otherwise.
     */
    public boolean trySlideSession(Jwt jwt, ServerWebExchange exchange) {
        HttpCookie existingCookie = exchange.getRequest().getCookies().getFirst(COOKIE_NAME);
        if (existingCookie == null || existingCookie.getValue().isBlank()) {
            // Request was authenticated via Authorization Bearer header (e.g. CLI/API) - do not create cookie
            return false;
        }

        Instant now = Instant.now();
        Instant exp = jwt.getExpiresAt();
        if (exp == null || now.isAfter(exp)) {
            return false;
        }

        // 1. Resolve absolute maximum expiration ceiling
        Object maxExpClaim = jwt.getClaim(CLAIM_MAX_EXP);
        Instant maxExp;
        if (maxExpClaim instanceof Number num) {
            maxExp = Instant.ofEpochSecond(num.longValue());
        } else if (jwt.getIssuedAt() != null) {
            maxExp = jwt.getIssuedAt().plus(maxLifespanHours, ChronoUnit.HOURS);
        } else {
            maxExp = now.plus(maxLifespanHours, ChronoUnit.HOURS);
        }

        // If absolute ceiling reached, do not extend
        if (!now.isBefore(maxExp)) {
            log.warn("Session reached absolute maximum lifespan ({}) for user='{}'", maxExp, jwt.getSubject());
            return false;
        }

        // 2. Check remaining idle window
        long remainingMinutes = Duration.between(now, exp).toMinutes();
        if (remainingMinutes > renewThresholdMinutes) {
            // Still within the safe active window; avoid unnecessary token minting
            return false;
        }

        // 3. Compute new candidate expiration
        Instant candidateExp = now.plus(idleTimeoutMinutes, ChronoUnit.MINUTES);
        Instant newExp = candidateExp.isBefore(maxExp) ? candidateExp : maxExp;

        // Ensure we actually extend forward
        if (!newExp.isAfter(exp)) {
            return false;
        }

        // 4. Resolve original session start
        Object sessionStartClaim = jwt.getClaim(CLAIM_SESSION_START);
        long sessionStartEpoch = sessionStartClaim instanceof Number num
                ? num.longValue()
                : (jwt.getIssuedAt() != null ? jwt.getIssuedAt().getEpochSecond() : now.getEpochSecond());

        String userId = jwt.getSubject();
        List<String> roles = jwt.getClaimAsStringList(CLAIM_ROLES);
        if (roles == null || roles.isEmpty()) {
            roles = List.of("ROLE_EMPLOYEE");
        }

        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer(issuer)
                .issuedAt(now)
                .expiresAt(newExp)
                .subject(userId)
                .claim(CLAIM_ROLES, roles)
                .claim(CLAIM_SESSION_START, sessionStartEpoch)
                .claim(CLAIM_MAX_EXP, maxExp.getEpochSecond())
                .build();

        JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).build();
        String newToken =
                jwtEncoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();

        attachSessionCookie(exchange, newToken, Duration.between(now, newExp));
        exchange.getResponse().getHeaders().set("X-Session-Slid", "true");

        log.debug(
                "Sliding window extended for user='{}'. Old expiry='{}', New expiry='{}' (remaining was {}m)",
                userId,
                exp,
                newExp,
                remainingMinutes);
        return true;
    }

    /**
     * Clears the session cookie on logout.
     */
    public void clearSessionCookie(ServerWebExchange exchange) {
        ResponseCookie cookie = ResponseCookie.from(COOKIE_NAME, "")
                .httpOnly(true)
                .secure(false)
                .path("/")
                .sameSite("Lax")
                .maxAge(0)
                .build();
        exchange.getResponse().addCookie(cookie);
    }

    private void attachSessionCookie(ServerWebExchange exchange, String token, Duration maxAge) {
        ResponseCookie cookie = ResponseCookie.from(COOKIE_NAME, token)
                .httpOnly(true)
                .secure(false) // localhost dev; in production HTTPS this is true
                .path("/")
                .sameSite("Lax")
                .maxAge(maxAge)
                .build();
        exchange.getResponse().addCookie(cookie);
    }
}
