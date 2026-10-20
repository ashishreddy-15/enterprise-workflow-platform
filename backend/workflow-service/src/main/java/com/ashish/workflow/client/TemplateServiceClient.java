package com.ashish.workflow.client;

import com.ashish.workflow.contracts.dto.TemplateDefinitionResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.Optional;

@Component
public class TemplateServiceClient {

    private final RestClient restClient;

    public TemplateServiceClient(@Value("${services.template-service.url}") String templateServiceUrl) {
        this.restClient = RestClient.builder()
                .baseUrl(templateServiceUrl)
                .build();
    }

    /**
     * Calls template-service to retrieve the current active published blueprint.
     * GET http://localhost:8083/api/v1/templates/{templateKey}
     */
    public Optional<TemplateDefinitionResponse> getActivePublishedTemplate(String templateKey) {
        try {
            TemplateDefinitionResponse response = restClient.get()
                    .uri("/api/v1/templates/{templateKey}", templateKey)
                    .retrieve()
                    .onStatus(HttpStatusCode::is4xxClientError, (request, clientResponse) -> {
                        // Returns empty if template key is not found (404)
                    })
                    .body(TemplateDefinitionResponse.class);

            return Optional.ofNullable(response);
        } catch (Exception e) {
            return Optional.empty();
        }
    }
}