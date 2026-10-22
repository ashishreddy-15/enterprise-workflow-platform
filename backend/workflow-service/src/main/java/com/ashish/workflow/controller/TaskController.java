package com.ashish.workflow.controller;

import com.ashish.workflow.api.TaskApi;
import com.ashish.workflow.security.UserContext;
import com.ashish.workflow.security.UserContextHolder;
import com.ashish.workflow.service.TaskService;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/tasks")
public class TaskController implements TaskApi {

    private static final Logger log = LoggerFactory.getLogger(TaskController.class);

    private final TaskService taskService;

    public TaskController(TaskService taskService) {
        this.taskService = taskService;
    }

    @Override
    @GetMapping("/inbox")
    public ResponseEntity<List<TaskService.TaskInboxItem>> getInbox(
            @RequestParam(required = false, defaultValue = "inbox") String filter) throws Exception {
        UserContext caller = UserContextHolder.getRequiredContext();
        log.info("REST: Fetching tasks for user: '{}', filter: '{}'", caller.userId(), filter);

        List<TaskService.TaskInboxItem> tasks;
        switch (filter.toLowerCase()) {
            case "participated":
                tasks = taskService.getParticipatedTasks(caller);
                break;
            case "initiated":
            case "my-requests":
                tasks = taskService.getInitiatedTasks(caller);
                break;
            case "all":
                tasks = taskService.getAllTasks();
                break;
            case "inbox":
            default:
                tasks = taskService.getTasksForUser(caller);
                break;
        }

        log.debug("REST: Returned {} tasks for user: '{}' (filter: '{}')", tasks.size(), caller.userId(), filter);
        return ResponseEntity.ok(tasks);
    }
}
