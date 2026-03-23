import { query } from "@anthropic-ai/claude-agent-sdk";
import type { SoftieDir } from "../project/softie-dir.js";
import type { Logger } from "../utils/logger.js";
import { BoardManager } from "../board/board-manager.js";
import { SpecManager } from "../spec/spec-manager.js";
import { eventBus } from "../core/event-bus.js";
import * as display from "../utils/display.js";

const PLANNING_PROMPT = `You are Softie's Planning Orchestrator. Your job is to decompose approved specifications into actionable tasks with dependencies, priorities, and sprint assignments.

## Your Process

### Step 1: Read Specs
Read all approved specs from .softie/specs/ and the project context from .softie/context/.

### Step 2: Decompose into Tasks
Break each spec into concrete, implementable tasks. Each task should:
- Be small enough for a single agent to complete (1-4 hours of work)
- Have a clear definition of done
- Reference its source spec (specId)
- Have appropriate priority (p0 = critical path, p1 = important, p2 = nice to have)
- Have estimated complexity (small, medium, large)
- List explicit dependencies on other tasks

### Step 3: Organize into Sprints
Group tasks into sprints based on dependency order:
- Sprint 1: Foundation (setup, architecture, core models)
- Sprint 2: Core implementation (main features)
- Sprint 3: Integration (connecting pieces, UI)
- Sprint 4: Polish (testing, documentation, edge cases)

Adjust the number of sprints based on project size.

### Step 4: Write Output
Write tasks to .softie/board/tasks.json as an array:
\`\`\`json
[
  {
    "id": "<8-char-uuid>",
    "specId": "<spec-id>",
    "specSectionId": null,
    "title": "Task title",
    "description": "Detailed description of what needs to be done",
    "status": "backlog",
    "priority": "p0",
    "dependencies": ["<other-task-id>"],
    "sprintId": "<sprint-id>",
    "estimatedComplexity": "medium",
    "createdAt": "<ISO>",
    "updatedAt": "<ISO>"
  }
]
\`\`\`

Write sprints to .softie/board/sprints.json:
\`\`\`json
[
  {
    "id": "<8-char-uuid>",
    "name": "Sprint 1: Foundation",
    "order": 1,
    "status": "planning",
    "taskIds": ["<task-id-1>", "<task-id-2>"],
    "createdAt": "<ISO>",
    "updatedAt": "<ISO>"
  }
]
\`\`\`

## Rules
- Every task MUST have a unique id (8 char hex string)
- Dependencies must reference task ids that exist in the same output
- Sprint taskIds must match the task ids
- Tasks in Sprint 1 should have no dependencies or only depend on other Sprint 1 tasks
- Be thorough but practical — don't create too many tiny tasks
- Typical project: 15-40 tasks across 3-5 sprints
`;

export async function runPlanningOrchestrator(
  softieDir: SoftieDir,
  logger: Logger
): Promise<void> {
  display.header("Planning: Spec → Tasks");
  display.info("Decomposing specs into tasks and sprints...");

  const specManager = new SpecManager(softieDir);
  const boardManager = new BoardManager(softieDir);

  const specs = specManager.list();
  const approvedSpecs = specs.filter((s) => s.status === "approved" || s.status === "draft");

  if (approvedSpecs.length === 0) {
    display.warn("No specs found to plan from. Using all available specs.");
  }

  logger.info("planning-orchestrator", "Starting planning", {
    specCount: approvedSpecs.length,
  });

  softieDir.updateMetadata({ status: "planning" });
  const ts = new Date().toISOString();
  eventBus.emit_event({ type: "project:status", status: "planning", timestamp: ts });

  let totalCost = 0;

  for await (const message of query({
    prompt: `Read the project specs from .softie/specs/ and decompose them into tasks with sprints.\n\nThe .softie/ directory has: specs/ (with index.json and *.md files), context/ (architecture.md, tech-stack.md, etc.), board/ (for output)\n\nDecompose the specs into tasks and write the results to .softie/board/tasks.json and .softie/board/sprints.json.`,
    options: {
      systemPrompt: PLANNING_PROMPT,
      allowedTools: ["Read", "Write", "Edit", "Glob", "Grep"],
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      model: "claude-opus-4-6",
      cwd: softieDir.projectDir,
      maxTurns: 20,
    },
  })) {
    if (message.type === "assistant") {
      for (const block of message.message.content) {
        if (block.type === "text" && block.text.trim()) {
          display.sdkMessage("planner", block.text);
          eventBus.emit_event({
            type: "sdk:text",
            agentName: "planner",
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
            agentName: "planner",
            toolName: block.name,
            summary: display.formatToolUse(block.name, input).slice(0, 200),
            timestamp: new Date().toISOString(),
          });
        }
      }
    }

    if (message.type === "result") {
      totalCost = message.total_cost_usd;
      logger.info("planning-orchestrator", "Planning complete", {
        cost: totalCost,
        turns: message.num_turns,
      });
      display.success("Planning complete");
      display.cost(totalCost);
    }
  }

  // Emit events for created tasks and sprints
  const tasks = boardManager.listTasks();
  const sprints = boardManager.listSprints();

  for (const task of tasks) {
    eventBus.emit_event({
      type: "board:task:created",
      taskId: task.id,
      title: task.title,
      timestamp: new Date().toISOString(),
    });
  }

  for (const sprint of sprints) {
    eventBus.emit_event({
      type: "sprint:created",
      sprintId: sprint.id,
      name: sprint.name,
      timestamp: new Date().toISOString(),
    });
  }

  // Link tasks to specs
  for (const task of tasks) {
    if (task.specId) {
      specManager.linkTask(task.specId, task.id);
    }
  }

  softieDir.updateProgress({ totalCostUsd: totalCost });
  softieDir.updateMetadata({ status: "ready" });
  eventBus.emit_event({
    type: "project:status",
    status: "ready",
    timestamp: new Date().toISOString(),
  });
  eventBus.emit_event({
    type: "file:changed",
    path: "board/tasks.json",
    timestamp: new Date().toISOString(),
  });
}
