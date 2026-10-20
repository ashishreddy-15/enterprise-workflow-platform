package com.ashish.workflow.client;

import com.ashish.workflow.contracts.dto.TemplateDefinitionResponse;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class TemplateServiceClient {

    private static final Logger log = LoggerFactory.getLogger(TemplateServiceClient.class);

    private final RestClient restClient;

    public TemplateServiceClient(@Value("${services.template-service.url}") String templateServiceUrl) {
        this.restClient = RestClient.builder().baseUrl(templateServiceUrl).build();
    }

    /**
     * Calls template-service to retrieve the current active published blueprint.
     * GET http://localhost:8083/api/v1/templates/{templateKey}
     */
    public Optional<TemplateDefinitionResponse> getActivePublishedTemplate(String templateKey) {
        log.debug("Calling template-service to fetch active published template for key: '{}'", templateKey);
        try {
            TemplateDefinitionResponse response = restClient
                    .get()
                    .uri("/api/v1/templates/{templateKey}", templateKey)
                    .retrieve()
                    .onStatus(HttpStatusCode::is4xxClientError, (request, clientResponse) -> {
                        // Returns empty if template key is not found (404)
                    })
                    .body(TemplateDefinitionResponse.class);

            if (response != null) {
                log.debug("Received template '{}' v{} from template-service", templateKey, response.version());
            } else {
                log.warn("Template-service returned null/empty body for template key: '{}'", templateKey);
            }
            return Optional.ofNullable(response);
        } catch (Exception e) {
            log.error("Failed to fetch template '{}' from template-service: {}", templateKey, e.getMessage());
            return Optional.empty();
        }
    }
}
