package com.ashish.workflow.scheduler;

import com.ashish.workflow.domain.entity.OutboxEvent;
import com.ashish.workflow.repository.OutboxRepository;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;

@Component
public class OutboxScheduler {

    private final OutboxRepository outboxRepository;
    private final KafkaTemplate<String, Object> kafkaTemplate;

    public OutboxScheduler(OutboxRepository outboxRepository, KafkaTemplate<String, Object> kafkaTemplate) {
        this.outboxRepository = outboxRepository;
        this.kafkaTemplate = kafkaTemplate;
    }

    @Scheduled(fixedDelay = 2000) // Poll every 2 seconds
    @Transactional
    public void pollAndPublishOutboxEvents() {
        List<OutboxEvent> pendingEvents = outboxRepository.findTop50ByStatusOrderByCreatedAtAsc("PENDING");

        for (OutboxEvent event : pendingEvents) {
            try {
                // Publish raw JSON payload stored in outbox to Kafka topic 'workflow-events'
                kafkaTemplate.send("workflow-events", event.getAggregateId(), event.getPayload());

                // Mark as published
                event.setStatus("PUBLISHED");
                event.setProcessedAt(OffsetDateTime.now());
                outboxRepository.save(event);
            } catch (Exception e) {
                // Handle failure: increment retry count
                event.setRetryCount(event.getRetryCount() + 1);
                if (event.getRetryCount() >= 3) {
                    event.setStatus("FAILED");
                }
                outboxRepository.save(event);
            }
        }
    }
}