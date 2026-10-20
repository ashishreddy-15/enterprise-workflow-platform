package com.ashish.workflow.service;

import com.ashish.workflow.domain.entity.OutboxEvent;
import com.ashish.workflow.repository.OutboxRepository;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class OutboxService {

    private static final Logger log = LoggerFactory.getLogger(OutboxService.class);

    private final OutboxRepository outboxRepository;

    public OutboxService(OutboxRepository outboxRepository) {
        this.outboxRepository = outboxRepository;
    }

    @Transactional
    public List<OutboxEvent> fetchPendingEventsWithLock() {
        log.debug("Fetching up to 50 pending outbox events with lock");
        List<OutboxEvent> events = outboxRepository.findTop50PendingForUpdate();
        log.debug("Fetched {} pending outbox events", events.size());
        return events;
    }

    @Transactional
    public void markPublished(UUID eventId) {
        log.debug("Marking outbox event {} as PUBLISHED", eventId);
        outboxRepository.findById(eventId).ifPresent(event -> {
            log.info("Outbox event {} marked as PUBLISHED", eventId);
            event.setStatus("PUBLISHED");
            event.setProcessedAt(OffsetDateTime.now());
            outboxRepository.save(event);
        });
    }

    @Transactional
    public void markFailed(UUID eventId) {
        log.warn("Marking outbox event {} as failed (incrementing retry count)", eventId);
        outboxRepository.findById(eventId).ifPresent(event -> {
            event.setRetryCount(event.getRetryCount() + 1);
            if (event.getRetryCount() >= 3) {
                event.setStatus("FAILED");
            }
            log.warn(
                    "Outbox event {} retry count now {}. Status: {}",
                    eventId,
                    event.getRetryCount(),
                    event.getStatus());
            outboxRepository.save(event);
        });
    }

    @Transactional
    public int replayFailedEvents() {
        log.info("Replaying all failed outbox events");
        int count = outboxRepository.replayAllFailedEvents();
        log.info("Replayed {} failed outbox events", count);
        return count;
    }

    @Transactional
    public boolean replaySpecificEvent(UUID eventId) {
        log.info("Replaying specific failed outbox event: {}", eventId);
        boolean success = outboxRepository.replaySpecificFailedEvent(eventId) > 0;
        log.info("Replay of event {} succeeded: {}", eventId, success);
        return success;
    }
}
