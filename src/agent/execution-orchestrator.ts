import { query } from "@anthropic-ai/claude-agent-sdk";
import type { SoftieDir } from "../project/softie-dir.js";
import type { Logger } from "../utils/logger.js";
import { BoardManager } from "../board/board-manager.js";
import { createAgentFromTemplate, suggestAgentRole } from "./agent-templates.js";
import { eventBus } from "../core/event-bus.js";
import * as display from "../utils/display.js";
import type { Task, Sprint } from "../project/state.js";

const MAX_CONCURRENT_AGENTS = 3;
const MAX_TASK_RETRIES = 1;

/**
 * Task-based execution orchestrator.
 * Runs tasks sprint-by-sprint, respecting dependency order.
 * Uses agent templates to assign appropriate agents to tasks.
 */
export async function runExecutionOrchestrator(
  softieDir: SoftieDir,
  logger: Logger
): Promise<void> {
  display.header("Execution: Running Tasks");

  const boardManager = new BoardManager(softieDir);
  const sprints = boardManager.listSprints();
  let totalCost = 0;

  softieDir.updateMetadata({ status: "executing" });
  eventBus.emit_event({ type: "project:status", status: "executing", timestamp: new Date().toISOString() });

  // Process sprints in order
  const orderedSprints = [...sprints].sort((a, b) => a.order - b.order);

  for (const sprint of orderedSprints) {
    const result = await executeSprint(sprint, boardManager, softieDir, logger);
    totalCost += result.cost;

    if (!result.success) {
      display.error(`Sprint "${sprint.name}" failed. Pausing execution.`);
      softieDir.updateMetadata({ status: "paused" });
      eventBus.emit_event({ type: "project:status", status: "paused", timestamp: new Date().toISOString() });
      return;
    }

    boardManager.updateSprintStatus(sprint.id, "completed");
    eventBus.emit_event({
      type: "sprint:status",
      sprintId: sprint.id,
      status: "completed",
      timestamp: new Date().toISOString(),
    });
  }

  softieDir.updateProgress({ totalCostUsd: totalCost });
  softieDir.updateMetadata({ status: "completed" });
  eventBus.emit_event({ type: "project:status", status: "completed", timestamp: new Date().toISOString() });
  display.success("All sprints completed!");
  display.cost(totalCost);
}

async function executeSprint(
  sprint: Sprint,
  boardManager: BoardManager,
  softieDir: SoftieDir,
  logger: Logger
): Promise<{ success: boolean; cost: number }> {
  display.phase(`Sprint: ${sprint.name}`, `Executing ${sprint.taskIds.length} tasks`, sprint.id);
  boardManager.updateSprintStatus(sprint.id, "active");

  eventBus.emit_event({
    type: "sprint:status",
    sprintId: sprint.id,
    status: "active",
    timestamp: new Date().toISOString(),
  });

  let sprintCost = 0;

  // Move all sprint tasks to "todo"
  for (const taskId of sprint.taskIds) {
    boardManager.updateTaskStatus(taskId, "todo");
  }

  // Process tasks in dependency order with parallel execution
  while (true) {
    const allTasks = boardManager.listTasks();
    const sprintTasks = allTasks.filter((t) => sprint.taskIds.includes(t.id));

    // Check if all done
    const remaining = sprintTasks.filter((t) => t.status !== "done" && t.status !== "rejected");
    if (remaining.length === 0) break;

    // Check for blocked state (no progress possible)
    const blocked = remaining.filter((t) => t.status === "blocked");
    if (blocked.length === remaining.length) {
      display.error("All remaining tasks are blocked. Cannot proceed.");
      return { success: false, cost: sprintCost };
    }

    // Find ready tasks (all deps satisfied)
    const doneIds = new Set(allTasks.filter((t) => t.status === "done").map((t) => t.id));
    const readyTasks = remaining
      .filter((t) => t.status === "todo")
      .filter((t) => t.dependencies.every((dep) => doneIds.has(dep)))
      .slice(0, MAX_CONCURRENT_AGENTS);

    if (readyTasks.length === 0) {
      // Tasks exist but none are ready — check for in-progress
      const inProgress = remaining.filter((t) => t.status === "in-progress");
      if (inProgress.length > 0) {
        // Wait for in-progress tasks (shouldn't happen in serial mode but safety check)
        break;
      }
      display.warn("No tasks ready and none in progress. Check dependency graph.");
      return { success: false, cost: sprintCost };
    }

    // Execute ready tasks (sequentially for simplicity, parallel would require Promise.all)
    if (readyTasks.length > 1) {
      display.parallelLaunch(readyTasks.map((t) => t.title));
      eventBus.emit_event({
        type: "parallel:launch",
        agentNames: readyTasks.map((t) => t.title),
        timestamp: new Date().toISOString(),
      });
    }

    // Execute tasks in parallel
    const results = await Promise.all(
      readyTasks.map((task) => executeTask(task, boardManager, softieDir, logger))
    );

    for (const result of results) {
      sprintCost += result.cost;
    }

    // Check if any task failed fatally
    const fatalFailure = results.some((r) => !r.success && !r.retried);
    if (fatalFailure) {
      return { success: false, cost: sprintCost };
    }
  }

  return { success: true, cost: sprintCost };
}

async function executeTask(
  task: Task,
  boardManager: BoardManager,
  softieDir: SoftieDir,
  logger: Logger,
  retry = 0
): Promise<{ success: boolean; cost: number; retried: boolean }> {
  const agentRole = suggestAgentRole(task.title, task.description);
  const contextSummary = softieDir.getContextSummary();

  const taskContext = [
    `## Task: ${task.title}`,
    task.description,
    task.specId ? `\nSpec ID: ${task.specId}` : "",
    `Priority: ${task.priority}`,
    `Complexity: ${task.estimatedComplexity}`,
    contextSummary ? `\n${contextSummary}` : "",
  ].join("\n");

  const agentDef = createAgentFromTemplate(agentRole, taskContext);

  boardManager.updateTask(task.id, { status: "in-progress", assignedAgentId: agentDef.id });

  const ts = new Date().toISOString();
  eventBus.emit_event({ type: "task:started", taskId: task.id, agentName: agentDef.name, timestamp: ts });
  eventBus.emit_event({
    type: "board:task:status",
    taskId: task.id,
    status: "in-progress",
    timestamp: ts,
  });

  display.agent(agentDef.name, `Starting task: ${task.title}`);
  logger.info("execution", `Starting task ${task.id}`, { role: agentRole, title: task.title });

  let taskCost = 0;

  try {
    for await (const message of query({
      prompt: agentDef.prompt,
      options: {
        systemPrompt: agentDef.prompt,
        allowedTools: agentDef.tools.map(String),
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        model: agentDef.model === "opus" ? "claude-opus-4-6" : agentDef.model === "sonnet" ? "claude-sonnet-4-6" : "claude-haiku-4-5-20241022",
        cwd: softieDir.projectDir,
        maxTurns: agentDef.maxTurns,
      },
    })) {
      if (message.type === "assistant") {
        for (const block of message.message.content) {
          if (block.type === "text" && block.text.trim()) {
            eventBus.emit_event({
              type: "sdk:text",
              agentName: agentDef.name,
              text: block.text.slice(0, 500),
              timestamp: new Date().toISOString(),
            });
          }
          if (block.type === "tool_use") {
            const input = (typeof block.input === "object" && block.input !== null
              ? block.input
              : {}) as Record<string, unknown>;
            eventBus.emit_event({
              type: "sdk:tool",
              agentName: agentDef.name,
              toolName: block.name,
              summary: display.formatToolUse(block.name, input).slice(0, 200),
              timestamp: new Date().toISOString(),
            });
          }
        }
      }

      if (message.type === "result") {
        taskCost = message.total_cost_usd;
        logger.info("execution", `Task ${task.id} complete`, {
          cost: taskCost,
          turns: message.num_turns,
          status: message.subtype,
        });

        if (message.subtype === "success") {
          boardManager.updateTask(task.id, { status: "done" });
          eventBus.emit_event({ type: "task:completed", agentName: agentDef.name, timestamp: new Date().toISOString() });
          eventBus.emit_event({ type: "board:task:status", taskId: task.id, status: "done", timestamp: new Date().toISOString() });
          display.success(`Task complete: ${task.title}`);
          return { success: true, cost: taskCost, retried: false };
        }

        // Task failed
        if (retry < MAX_TASK_RETRIES) {
          display.warn(`Task "${task.title}" failed. Retrying...`);
          boardManager.updateTask(task.id, { status: "todo" });
          return executeTask(task, boardManager, softieDir, logger, retry + 1);
        }

        boardManager.updateTask(task.id, { status: "blocked" });
        eventBus.emit_event({ type: "board:task:status", taskId: task.id, status: "blocked", timestamp: new Date().toISOString() });
        display.error(`Task "${task.title}" failed after ${retry + 1} attempts`);
        return { success: false, cost: taskCost, retried: retry > 0 };
      }
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error("execution", `Task ${task.id} error: ${errMsg}`);
    boardManager.updateTask(task.id, { status: "blocked" });
    display.error(`Task "${task.title}" error: ${errMsg}`);
    return { success: false, cost: taskCost, retried: false };
  }

  return { success: false, cost: taskCost, retried: false };
}
