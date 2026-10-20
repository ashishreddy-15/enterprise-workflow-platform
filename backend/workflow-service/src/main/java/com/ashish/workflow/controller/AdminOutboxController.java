package com.ashish.workflow.controller;

import com.ashish.workflow.service.OutboxService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/admin/outbox")
public class AdminOutboxController {

    private static final Logger log = LoggerFactory.getLogger(AdminOutboxController.class);

    private final OutboxService outboxService;

    public AdminOutboxController(OutboxService outboxService) {
        this.outboxService = outboxService;
    }

    /**
     * Bulk replay all quarantined/failed outbox events.
     * Used by operations/support after incident resolution.
     */
    @PostMapping("/replay-failed")
    public ResponseEntity<Map<String, Object>> replayAllFailed() {
        log.info("Admin: Replaying all failed outbox events");
        int replayedCount = outboxService.replayFailedEvents();
        log.info("Admin: Replay-all completed, {} events re-queued", replayedCount);
        return ResponseEntity.ok(Map.of(
                "status", "SUCCESS",
                "message", "Re-queued failed events for processing",
                "replayedCount", replayedCount
        ));
    }

    /**
     * Granular replay for a single failed event ID referenced in a support ticket.
     */
    @PostMapping("/events/{eventId}/replay")
    public ResponseEntity<Map<String, Object>> replaySpecific(@PathVariable UUID eventId) {
        log.info("Admin: Replaying specific outbox event: {}", eventId);
        boolean success = outboxService.replaySpecificEvent(eventId);
        if (!success) {
            log.warn("Admin: Replay requested for event {} but it was not found or not in FAILED status", eventId);
            return ResponseEntity.badRequest().body(Map.of(
                    "status", "NOT_FOUND_OR_NOT_FAILED",
                    "message", "Event ID was either not found or not in FAILED status."
            ));
        }
        log.info("Admin: Event {} successfully re-queued as PENDING", eventId);
        return ResponseEntity.ok(Map.of(
                "status", "SUCCESS",
                "message", "Event re-queued as PENDING",
                "eventId", eventId
        ));
    }
}
