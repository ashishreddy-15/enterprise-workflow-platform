package com.ashish.workflow.controller;

import com.ashish.workflow.security.UserContext;
import com.ashish.workflow.security.UserContextHolder;
import com.ashish.workflow.service.TaskService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/tasks")
public class TaskController {

    private final TaskService taskService;

    public TaskController(TaskService taskService) {
        this.taskService = taskService;
    }

    @GetMapping("/inbox")
    public ResponseEntity<List<TaskService.TaskInboxItem>> getInbox() throws Exception {
        UserContext caller = UserContextHolder.getRequiredContext();
        List<TaskService.TaskInboxItem> tasks = taskService.getTasksForUser(caller);
        return ResponseEntity.ok(tasks);
    }
}