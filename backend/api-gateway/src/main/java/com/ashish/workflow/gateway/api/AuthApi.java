package com.ashish.workflow.gateway.api;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import java.util.Map;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

@Tag(
        name = "Authentication & Sessions",
        description = "BFF session management, persona switching, and JWT cookie token minting")
public interface AuthApi {

    record TokenRequest(
            @Schema(description = "User identifier (e.g. sarah.manager, admin.sys)", example = "sarah.manager")
                    String userId,
            @Schema(description = "Assigned security roles", example = "[\"ROLE_MANAGER\", \"ROLE_APPROVER\"]")
                    List<String> roles) {}

    @Operation(
            summary = "Mint dev JWT token and set HttpOnly session cookie",
            description = "Simulates enterprise persona authentication by minting a signed HMAC-SHA256 JWT "
                    + "and attaching it as an HttpOnly, SameSite=Lax cookie (`ewp_access_token`).")
    @ApiResponses({
        @ApiResponse(
                responseCode = "200",
                description = "Successfully authenticated; session cookie set",
                content = @Content(schema = @Schema(implementation = Map.class)))
    })
    Mono<Map<String, String>> generateToken(
            @RequestBody TokenRequest request, @Parameter(hidden = true) ServerWebExchange exchange);

    @Operation(
            summary = "Clear HttpOnly session cookie and log out",
            description = "Invalidates the active browser session by setting cookie max-age to 0.")
    @ApiResponses({@ApiResponse(responseCode = "200", description = "Logged out successfully")})
    Mono<Map<String, String>> logout(@Parameter(hidden = true) ServerWebExchange exchange);

    @Operation(
            summary = "Get current authenticated user identity and authorities",
            description = "Inspects the active JWT cookie or Authorization header and returns subject & roles.")
    @ApiResponses({@ApiResponse(responseCode = "200", description = "Current authenticated identity")})
    Mono<Map<String, Object>> getCurrentUser(@Parameter(hidden = true) Authentication authentication);
}
