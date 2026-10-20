package com.ashish.workflow.repository;

import com.ashish.workflow.domain.entity.OutboxEvent;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface OutboxRepository extends JpaRepository<OutboxEvent, UUID> {
    @Query(
            value =
                    """
        SELECT * FROM outbox_events
        WHERE status = 'PENDING'
        ORDER BY created_at ASC
        LIMIT 50
        FOR UPDATE SKIP LOCKED
        """,
            nativeQuery = true)
    List<OutboxEvent> findTop50PendingForUpdate();

    @Modifying
    @Query("UPDATE OutboxEvent o SET o.status = 'PENDING', o.retryCount = 0 WHERE o.status = 'FAILED'")
    int replayAllFailedEvents();

    @Modifying
    @Query(
            "UPDATE OutboxEvent o SET o.status = 'PENDING', o.retryCount = 0 WHERE o.id = :eventId AND o.status = 'FAILED'")
    int replaySpecificFailedEvent(@Param("eventId") UUID eventId);
}
