package com.ashish.workflow.gateway.controller;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

@RestController
public class ScalarController {

    private static final String SCALAR_HTML =
            """
        <!doctype html>
        <html lang="en">
          <head>
            <title>Enterprise Workflow Platform — API Documentation</title>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236366f1' stroke-width='2'><path d='M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5'/></svg>">
            <style>
              body { margin: 0; padding: 0; background: #09090b; }
            </style>
          </head>
          <body>
            <script
              id="api-reference"
              type="application/json">
              {
                "theme": "purple",
                "layout": "modern",
                "showSidebar": true,
                "defaultHttpClient": {
                  "targetKey": "shell",
                  "clientKey": "curl"
                },
                "spec": {
                  "urls": [
                    { "name": "API Gateway & Auth", "url": "/v3/api-docs" },
                    { "name": "Workflow Service (PostgreSQL & State Engine)", "url": "/workflows/v3/api-docs" },
                    { "name": "Template Service (MongoDB & Step DAG)", "url": "/templates/v3/api-docs" },
                    { "name": "Audit & Analytics (MongoDB & Kafka Consumer)", "url": "/analytics/v3/api-docs" }
                  ]
                }
              }
            </script>
            <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
          </body>
        </html>
        """;

    @GetMapping(value = "/scalar", produces = MediaType.TEXT_HTML_VALUE)
    public Mono<String> scalarUi() {
        return Mono.just(SCALAR_HTML);
    }
}
