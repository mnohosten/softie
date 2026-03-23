import { query } from "@anthropic-ai/claude-agent-sdk";
import type { SoftieDir } from "../project/softie-dir.js";
import type { Logger } from "../utils/logger.js";
import { BoardManager } from "../board/board-manager.js";
import { SpecManager } from "../spec/spec-manager.js";
import { eventBus } from "../core/event-bus.js";
import * as display from "../utils/display.js";

const REVIEW_PROMPT = `You are the Sprint Review Agent. Your job is to review completed work in a sprint for quality and spec compliance.

## Your Process

1. **Read the specs** from .softie/specs/ to understand what was expected
2. **Read the completed tasks** from .softie/board/tasks.json to understand what was done
3. **Review the actual code** — browse the project files to verify implementation
4. **Check build/tests** — run build and test commands to verify everything works
5. **Write a review report** to .softie/context/progress.md

## Review Criteria
- Does the implementation match the spec requirements?
- Do all builds pass?
- Are there any obvious issues or missing pieces?
- Is the code quality acceptable?

## Output Format
Write your review to .softie/context/progress.md:

### Sprint Review: [Sprint Name]
**Status**: APPROVED | NEEDS_CHANGES
**Date**: [ISO date]

#### Completed Tasks
- [Task title]: [status assessment]

#### Build Status
- Build: PASS/FAIL
- Tests: PASS/FAIL/N/A

#### Issues Found
- [List any issues]

#### Recommendations
- [List recommendations for next sprint]

## Important
- Be thorough but efficient
- Focus on spec compliance first, code style second
- If build fails, that's an automatic NEEDS_CHANGES
`;

export interface SprintReviewResult {
  approved: boolean;
  report: string;
  cost: number;
}

export async function runSprintReview(
  softieDir: SoftieDir,
  logger: Logger,
  sprintId: string
): Promise<SprintReviewResult> {
  display.header("Sprint Review");

  const boardManager = new BoardManager(softieDir);
  const sprint = boardManager.getSprint(sprintId);
  if (!sprint) throw new Error(`Sprint ${sprintId} not found`);

  display.info(`Reviewing sprint: ${sprint.name}`);
  logger.info("sprint-review", `Starting review for sprint ${sprintId}`);

  let totalCost = 0;
  let report = "";

  eventBus.emit_event({
    type: "project:status",
    status: "milestone-review",
    timestamp: new Date().toISOString(),
  });

  for await (const message of query({
    prompt: `Review the completed work in the current sprint.\n\nSprint: "${sprint.name}" (${sprint.taskIds.length} tasks)\n\nRead the specs, tasks, and actual code. Run build/tests. Write your review to .softie/context/progress.md.\n\nAt the end, clearly state whether the sprint is APPROVED or NEEDS_CHANGES.`,
    options: {
      systemPrompt: REVIEW_PROMPT,
      allowedTools: ["Read", "Bash", "Glob", "Grep", "Write", "Edit"],
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
          report += block.text + "\n";
          eventBus.emit_event({
            type: "sdk:text",
            agentName: "reviewer",
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
            agentName: "reviewer",
            toolName: block.name,
            summary: display.formatToolUse(block.name, input).slice(0, 200),
            timestamp: new Date().toISOString(),
          });
        }
      }
    }

    if (message.type === "result") {
      totalCost = message.total_cost_usd;
      logger.info("sprint-review", "Review complete", {
        cost: totalCost,
        turns: message.num_turns,
      });
    }
  }

  // Determine approval from report content
  const approved = report.toLowerCase().includes("approved") && !report.toLowerCase().includes("needs_changes");

  display.info(`Sprint review: ${approved ? "APPROVED" : "NEEDS CHANGES"}`);
  display.cost(totalCost);

  return { approved, report, cost: totalCost };
}

/** Re-plan tasks affected by spec changes */
export async function replanFromSpecChanges(
  softieDir: SoftieDir,
  logger: Logger,
  specId: string
): Promise<void> {
  const specManager = new SpecManager(softieDir);
  const boardManager = new BoardManager(softieDir);
  const spec = specManager.get(specId);
  if (!spec) return;

  // Find tasks linked to this spec that aren't done
  const affectedTasks = boardManager.listTasks().filter(
    (t) => t.specId === specId && t.status !== "done"
  );

  if (affectedTasks.length === 0) return;

  display.info(`Re-planning ${affectedTasks.length} tasks affected by spec "${spec.title}" changes`);
  logger.info("replan", `Re-planning tasks for spec ${specId}`, { count: affectedTasks.length });

  // Mark affected tasks as needing replanning
  for (const task of affectedTasks) {
    boardManager.updateTask(task.id, { status: "backlog" });
    eventBus.emit_event({
      type: "board:task:status",
      taskId: task.id,
      status: "backlog",
      timestamp: new Date().toISOString(),
    });
  }

  eventBus.emit_event({
    type: "file:changed",
    path: "board/tasks.json",
    timestamp: new Date().toISOString(),
  });
}
