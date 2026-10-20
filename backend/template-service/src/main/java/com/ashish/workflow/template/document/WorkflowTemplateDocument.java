package com.ashish.workflow.template.document;

import com.ashish.workflow.contracts.dto.TemplateDefinitionResponse.StepDefinitionDto;
import java.time.Instant;
import java.util.Map;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

@Document(collection = "workflow_templates")
@CompoundIndex(name = "template_version_idx", def = "{'templateKey': 1, 'version': 1}", unique = true)
public class WorkflowTemplateDocument {

    @Id
    private String id;

    @Indexed
    private String templateKey;

    private int version;
    private String name;
    private String description;
    private String status;
    private String initialState;
    private Instant createdAt;
    private Instant updatedAt;

    private Map<String, StepDefinitionDto> steps;

    public WorkflowTemplateDocument() {}

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getTemplateKey() {
        return templateKey;
    }

    public void setTemplateKey(String templateKey) {
        this.templateKey = templateKey;
    }

    public int getVersion() {
        return version;
    }

    public void setVersion(int version) {
        this.version = version;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getInitialState() {
        return initialState;
    }

    public void setInitialState(String initialState) {
        this.initialState = initialState;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }

    public Map<String, StepDefinitionDto> getSteps() {
        return steps;
    }

    public void setSteps(Map<String, StepDefinitionDto> steps) {
        this.steps = steps;
    }
}
