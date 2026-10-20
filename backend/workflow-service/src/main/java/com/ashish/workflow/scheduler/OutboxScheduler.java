package com.ashish.workflow.scheduler;

import com.ashish.workflow.domain.entity.OutboxEvent;
import com.ashish.workflow.service.OutboxService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.concurrent.TimeUnit;

@Component
public class OutboxScheduler {

    private static final Logger log = LoggerFactory.getLogger(OutboxScheduler.class);
    private static final String TOPIC = "workflow-events";

    private final OutboxService outboxService;
    private final KafkaTemplate<String, Object> kafkaTemplate;

    public OutboxScheduler(OutboxService outboxService, KafkaTemplate<String, Object> kafkaTemplate) {
        this.outboxService = outboxService;
        this.kafkaTemplate = kafkaTemplate;
    }

    @Scheduled(fixedDelay = 2000)
    public void pollAndPublishOutboxEvents() {
        // Calls through the Spring proxy -> @Transactional executes
        List<OutboxEvent> pendingEvents = outboxService.fetchPendingEventsWithLock();
        if (pendingEvents.isEmpty()) {
            return;
        }

        for (OutboxEvent event : pendingEvents) {
            try {
                // Synchronously wait up to 5s for the Kafka broker ACK
                kafkaTemplate.send(TOPIC, event.getAggregateId(), event.getPayload())
                        .get(5, TimeUnit.SECONDS);

                // External call through the Spring proxy -> @Transactional executes
                outboxService.markPublished(event.getId());
            } catch (Exception e) {
                log.error("Failed to publish event id={} to Kafka: {}", event.getId(), e.getMessage());
                outboxService.markFailed(event.getId());
            }
        }
    }
}