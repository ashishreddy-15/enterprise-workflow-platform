package com.ashish.workflow.service;

import com.ashish.workflow.domain.entity.OutboxEvent;
import com.ashish.workflow.repository.OutboxRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@Service
public class OutboxService {

    private final OutboxRepository outboxRepository;

    public OutboxService(OutboxRepository outboxRepository) {
        this.outboxRepository = outboxRepository;
    }

    @Transactional
    public List<OutboxEvent> fetchPendingEventsWithLock() {
        return outboxRepository.findTop50PendingForUpdate();
    }

    @Transactional
    public void markPublished(UUID eventId) {
        outboxRepository.findById(eventId).ifPresent(event -> {
            event.setStatus("PUBLISHED");
            event.setProcessedAt(OffsetDateTime.now());
            outboxRepository.save(event);
        });
    }

    @Transactional
    public void markFailed(UUID eventId) {
        outboxRepository.findById(eventId).ifPresent(event -> {
            event.setRetryCount(event.getRetryCount() + 1);
            if (event.getRetryCount() >= 3) {
                event.setStatus("FAILED");
            }
            outboxRepository.save(event);
        });
    }

    @Transactional
    public int replayFailedEvents() {
        return outboxRepository.replayAllFailedEvents();
    }

    @Transactional
    public boolean replaySpecificEvent(UUID eventId) {
        return outboxRepository.replaySpecificFailedEvent(eventId) > 0;
    }
}