import { query } from "@anthropic-ai/claude-agent-sdk";
import type { SoftieDir } from "../project/softie-dir.js";
import type { Milestone } from "../project/state.js";
import type { Logger } from "../utils/logger.js";
import type { WsHub } from "../server/ws-hub.js";
import * as display from "../utils/display.js";
import { interactiveToolHandler } from "../utils/input.js";
import { createUiToolHandler } from "../server/milestone-bridge.js";

const MILESTONE_SYSTEM_PROMPT = `You are the Project Director presenting a milestone review to the project investor (the user).

## CRITICAL: How to communicate with the investor

You communicate with the investor ONLY through the AskUserQuestion tool. The "question" parameter is the ONLY thing the investor sees. Everything you write as regular text is NOT visible to them.

Therefore: put your ENTIRE presentation, summary, and questions INTO the "question" field of AskUserQuestion. Do NOT write summaries as regular text - they will be invisible to the investor.

## Your Process

1. **First**: Read ALL relevant project files silently (no commentary needed):
   - .softie/analysis/* - all analysis documents
   - .softie/team/team.json and .softie/team/agents/*.md - the proposed team
   - .softie/plan/phases.json - the execution plan

2. **Then**: Call AskUserQuestion with a rich, structured presentation in the "question" field. Use markdown. Include:

   # Project Review: [Project Name]

   ## What we're building
   [Clear description of what will be created]

   ## Key Research Insights
   [2-4 most interesting/important findings from research]

   ## Proposed Scope
   **In scope:** [list]
   **Out of scope:** [list]

   ## Expert Team
   | Role | Responsibility | Model |
   |------|---------------|-------|
   | ... | ... | ... |

   ## Execution Plan
   1. Phase 1: ... (agents: ...)
   2. Phase 2: ... (agents: ...)
   ...

   ## Risks & Trade-offs
   [Any notable risks]

   ---
   What would you like to adjust? You can change the scope, team composition, execution plan, or ask any questions.

3. **Conversation**: Use AskUserQuestion for EVERY response to the investor. Each response must be self-contained in the "question" field.

4. **Changes**: If the investor requests changes, edit the relevant .softie/ files, then call AskUserQuestion again showing the updated state.

5. **Approval**: When the investor says they approve (e.g. "ok", "looks good", "approved", "let's go", "proceed"), end with MILESTONE_APPROVED. When they want to pause, end with MILESTONE_PAUSED.
`;

/**
 * Run a milestone check-in with the investor (user).
 * This is an interactive conversation, not a one-shot approval.
 */
export async function runMilestoneCheckIn(
  milestoneData: Milestone,
  softieDir: SoftieDir,
  logger: Logger,
  wsHub?: WsHub
): Promise<{ approved: boolean; feedback: string }> {
  display.milestone(milestoneData.name);

  logger.info("milestone", `Check-in: ${milestoneData.name}`, {
    milestoneId: milestoneData.id,
  });

  let approved = false;
  let feedback = "";

  for await (const message of query({
    prompt: `Conduct a milestone review with the project investor.

Milestone: "${milestoneData.name}"
Description: ${milestoneData.description}
Expected deliverables: ${milestoneData.deliverables.join(", ")}

Start by reading ALL analysis documents, team definitions, and the execution plan from .softie/. Then present a comprehensive but readable summary to the investor and start a conversation about the direction.

This is a dialogue - expect multiple rounds of questions and feedback. When the investor explicitly approves, end with "MILESTONE_APPROVED". If they want to pause or reject, end with "MILESTONE_PAUSED" and a summary of requested changes.`,
    options: {
      systemPrompt: MILESTONE_SYSTEM_PROMPT,
      allowedTools: [
        "Read",
        "Write",
        "Edit",
        "Glob",
        "Grep",
        "AskUserQuestion",
      ],
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      canUseTool: wsHub != null ? createUiToolHandler(wsHub) : interactiveToolHandler,
      cwd: softieDir.projectDir,
      maxTurns: 30,
    },
  })) {
    if (message.type === "assistant") {
      for (const block of message.message.content) {
        if (block.type === "text" && block.text.trim()) {
          // Show the agent's text (summary, analysis) directly to the user
          console.log();
          console.log(block.text);
        }
        if (block.type === "tool_use") {
          const input = (typeof block.input === "object" && block.input !== null
            ? block.input
            : {}) as Record<string, unknown>;
          // Don't show AskUserQuestion - it's handled interactively via canUseTool
          if (block.name !== "AskUserQuestion") {
            display.agent("Milestone", display.formatToolUse(block.name, input));
          }
        }
      }
    }

    if (message.type === "result") {
      const result = message.subtype === "success" ? message.result : "";
      approved = result.includes("MILESTONE_APPROVED");
      feedback = result;

      logger.info("milestone", "Check-in result", {
        milestoneId: milestoneData.id,
        approved,
        turns: message.num_turns,
        cost: message.total_cost_usd,
      });
    }
  }

  if (approved) {
    display.success(`Milestone "${milestoneData.name}" approved!`);
  } else {
    display.warn(`Milestone "${milestoneData.name}" paused - changes requested.`);
  }

  return { approved, feedback };
}

/**
 * Update milestone status in the phase plan.
 */
export function updateMilestoneStatus(
  softieDir: SoftieDir,
  milestoneId: string,
  status: Milestone["status"]
): void {
  const plan = softieDir.getPlan();
  if (!plan) return;

  const milestone = plan.milestones.find((m) => m.id === milestoneId);
  if (milestone) {
    milestone.status = status;
    softieDir.writePlan(plan);
  }
}
