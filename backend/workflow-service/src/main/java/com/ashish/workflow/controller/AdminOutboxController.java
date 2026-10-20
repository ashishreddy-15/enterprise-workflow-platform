package com.ashish.workflow.controller;

import com.ashish.workflow.service.OutboxService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/admin/outbox")
public class AdminOutboxController {

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
        int replayedCount = outboxService.replayFailedEvents();
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
        boolean success = outboxService.replaySpecificEvent(eventId);
        if (!success) {
            return ResponseEntity.badRequest().body(Map.of(
                    "status", "NOT_FOUND_OR_NOT_FAILED",
                    "message", "Event ID was either not found or not in FAILED status."
            ));
        }
        return ResponseEntity.ok(Map.of(
                "status", "SUCCESS",
                "message", "Event re-queued as PENDING",
                "eventId", eventId
        ));
    }
}