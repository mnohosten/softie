import { query } from "@anthropic-ai/claude-agent-sdk";
import type { SoftieDir } from "../project/softie-dir.js";
import type { AgentDefinition, PhasePlan } from "../project/state.js";
import type { Logger } from "../utils/logger.js";
import type { WsHub } from "../server/ws-hub.js";
import { toSdkAgents } from "../meta/team-generator.js";
import { runMilestoneCheckIn, updateMilestoneStatus } from "./milestone.js";
import * as display from "../utils/display.js";

const MAX_PHASE_RETRIES = 2;

const PROJECT_ORCHESTRATOR_PROMPT = `You are Softie's Project Orchestrator — a senior engineering manager that coordinates a team of expert agents to build production-quality software.

## Your Role
- You are the hub in a hub-and-spoke architecture
- You delegate work to specialized agents and coordinate their outputs
- You ensure work flows correctly between dependent agents
- You enforce quality through verification loops
- You maintain shared context so agents build on each other's work

## Architecture-First Workflow
For the FIRST implementation phase, ALWAYS start with the architect agent:
1. Architect designs system structure, interfaces, contracts
2. Architect writes to .softie/context/architecture.md and .softie/context/tech-stack.md
3. Only AFTER architecture is approved, proceed with implementation agents

## Implementation Loop (for EVERY agent)
When delegating work to an implementation agent, your prompt to them MUST instruct them to follow this loop:

\`\`\`
a) Read shared context from .softie/context/ (architecture.md, conventions.md, progress.md, etc.)
b) Write code implementing the assigned task
c) Run build verification: npm run build OR tsc --noEmit (whichever applies)
d) If build fails → fix the errors → retry (max 3 attempts)
e) Write tests for the new code
f) Run tests: npm test (or the project's test command)
g) If tests fail → fix → retry (max 3 attempts)
h) Run lint if available (npm run lint)
i) Update .softie/context/progress.md with what was completed
j) If any architecture decisions were made, append to .softie/context/decisions.md
k) If any errors/issues were discovered, update .softie/context/errors.md
\`\`\`

## Integration Verification (after ALL agents in a phase complete)
After all agents in a phase finish their work:
1. Run full build: use Bash to execute \`npm run build\` or equivalent
2. Run full test suite: use Bash to execute \`npm test\` or equivalent
3. Run lint: use Bash to execute \`npm run lint\` if available
4. If anything fails → identify which agent's code is broken → delegate the fix to that agent
5. Update .softie/context/progress.md with phase completion status

## Quality Gate (before closing a phase)
A phase is ONLY complete when ALL of the following are true:
- All builds pass (zero compilation errors)
- All tests pass
- No lint errors (warnings are acceptable)
- Architecture decisions documented in .softie/context/decisions.md
- Progress updated in .softie/context/progress.md

If any quality gate fails, do NOT close the phase. Fix the issues first.

## Parallel Execution - CRITICAL
**MAXIMIZE PARALLELISM** to speed up execution:

- Analyze agent dependencies from .softie/team/team.json
- Launch ALL agents that have NO unmet dependencies simultaneously (multiple Agent calls in a single response)
- After parallel agents complete, launch the next wave of agents whose dependencies are now satisfied
- You can also use \`run_in_background: true\` on Agent calls and collect results via TaskOutput

**Example**: If a phase has agents [frontend-dev, backend-dev, designer] and designer has no dependencies while frontend-dev depends on designer:
1. First wave: Launch designer + backend-dev in parallel (2 Agent calls in one response)
2. Second wave: Launch frontend-dev after designer completes

## Rules
- Always delegate to the most appropriate agent for a task
- Respect agent dependencies - don't ask an agent to work before its dependencies are met
- **Launch independent agents in parallel whenever possible**
- If an agent produces poor quality output, provide specific feedback and ask them to retry
- Keep track of all artifacts produced
- Write progress updates to .softie/state/progress.json
- Log important decisions to .softie/state/decisions.json
- Store intermediate artifacts in .softie/artifacts/

## Communication
- Be concise in your coordination
- When you need investor input, clearly state what you need and why
- Report progress at natural checkpoints
`;

export async function runProjectOrchestrator(
  softieDir: SoftieDir,
  agents: AgentDefinition[],
  plan: PhasePlan,
  logger: Logger,
  wsHub?: WsHub
): Promise<void> {
  display.header("Project Execution");

  softieDir.updateMetadata({ status: "executing" });
  const sdkAgents = toSdkAgents(agents);

  let totalCost = 0;

  // Execute phases in order
  for (const phase of plan.phases.sort((a, b) => a.order - b.order)) {
    // Check if there's a milestone gate before this phase
    if (phase.milestone) {
      const milestone = plan.milestones.find((m) => m.id === phase.milestone);
      if (milestone && milestone.status === "pending") {
        softieDir.updateMetadata({ status: "milestone-review" });

        const { approved, feedback } = await runMilestoneCheckIn(
          milestone,
          softieDir,
          logger,
          wsHub
        );

        if (!approved) {
          logger.warn("orchestrator", "Milestone rejected, pausing", {
            milestoneId: milestone.id,
            feedback,
          });
          display.warn("Project paused - investor requested changes.");
          display.info("Run 'softie resume' after making changes.");
          softieDir.updateMetadata({ status: "paused" });
          return;
        }

        updateMilestoneStatus(softieDir, milestone.id, "completed");
        softieDir.updateMetadata({ status: "executing" });
      }
    }

    // Execute the phase
    display.phase(phase.name, phase.description);
    logger.info("orchestrator", `Starting phase: ${phase.name}`, {
      phaseId: phase.id,
      agents: phase.agents,
    });

    // Update plan status
    phase.status = "active";
    softieDir.writePlan(plan);
    softieDir.updateMetadata({ currentPhase: phase.id });

    const phaseAgentNames = phase.agents
      .map((id) => agents.find((a) => a.id === id)?.name || id)
      .join(", ");

    let phaseSuccess = false;

    for (let attempt = 0; attempt <= MAX_PHASE_RETRIES; attempt++) {
      if (attempt > 0) {
        display.warn(`Retrying phase "${phase.name}" (attempt ${attempt + 1}/${MAX_PHASE_RETRIES + 1})`);
        logger.info("orchestrator", `Retrying phase: ${phase.name}`, { attempt });
        phase.retryCount = (phase.retryCount || 0) + 1;
        softieDir.writePlan(plan);
      }

      // Inject shared context
      const contextSummary = softieDir.getContextSummary();
      const errorContext = attempt > 0
        ? `\n\n## RETRY CONTEXT\nThis is retry attempt ${attempt + 1}. The previous attempt failed. Check .softie/context/errors.md for details about what went wrong. Focus on fixing the issues from the previous attempt before proceeding with new work.`
        : "";

      let attemptSuccess = false;
      // Map tool_use_id → agent name for labeling sub-agent messages
      const agentCallMap = new Map<string, string>();

      for await (const message of query({
        prompt: `Execute phase "${phase.name}" of the project.

Phase description: ${phase.description}
Assigned agents: ${phaseAgentNames}

## Shared Project Context
${contextSummary || "No context files yet. If this is the first implementation phase, start with the architect agent to establish architecture."}

## Instructions
1. Read the project brief from .softie/analysis/brief.md and requirements from .softie/analysis/requirements.md for full context.
2. Read the full plan from .softie/plan/phases.json to understand the overall project structure.
3. Delegate work to the appropriate agents from your team following the Implementation Loop.
4. After all agents complete, run Integration Verification (full build + tests via Bash).
5. Enforce the Quality Gate before marking the phase complete.
6. Update .softie/context/progress.md and .softie/state/progress.json with the current status.${errorContext}`,
        options: {
          systemPrompt: PROJECT_ORCHESTRATOR_PROMPT,
          allowedTools: [
            "Read",
            "Write",
            "Edit",
            "Bash",
            "Glob",
            "Grep",
            "Agent",
            "WebSearch",
            "WebFetch",
            "AskUserQuestion",
            "TaskOutput",
            "TaskStop",
          ],
          agents: sdkAgents,
          permissionMode: "bypassPermissions",
          allowDangerouslySkipPermissions: true,
          model: "claude-opus-4-6",
          cwd: softieDir.projectDir,
          maxTurns: 150,
        },
      })) {
        if (message.type === "assistant") {
          // Determine which agent sent this message
          const agentLabel = message.parent_tool_use_id
            ? (agentCallMap.get(message.parent_tool_use_id) || "sub-agent")
            : "Orchestrator";

          // Detect parallel agent launches (only from orchestrator level)
          if (!message.parent_tool_use_id) {
            const agentCalls = message.message.content.filter(
              (b: { type: string; name?: string }) => b.type === "tool_use" && b.name === "Agent"
            );
            if (agentCalls.length > 1) {
              const names = agentCalls.map((b: { type: string; input?: unknown }) => {
                if (b.type !== "tool_use") return "agent";
                const inp = b.input as Record<string, unknown>;
                return (inp.subagent_type as string) || (inp.description as string) || "agent";
              });
              display.parallelLaunch(names);
            }
          }

          for (const block of message.message.content) {
            if (block.type === "text" && block.text.trim()) {
              display.sdkMessage(agentLabel, block.text);
            }
            if (block.type === "tool_use") {
              const input = (typeof block.input === "object" && block.input !== null
                ? block.input
                : {}) as Record<string, unknown>;
              display.agent(
                agentLabel,
                display.formatToolUse(block.name, input)
              );
              // Track Agent tool calls so sub-agent messages can be labeled correctly
              if (block.name === "Agent") {
                const agentType = (input.subagent_type as string)
                  || (input.description as string)
                  || "sub-agent";
                agentCallMap.set(block.id, agentType);
              }
            }
          }
        }

        if (message.type === "system" && message.subtype === "init") {
          softieDir.saveSessionId(message.session_id);
        }

        if (message.type === "result") {
          totalCost += message.total_cost_usd;
          softieDir.saveSessionId(message.session_id);
          logger.info("orchestrator", `Phase attempt complete: ${phase.name}`, {
            cost: message.total_cost_usd,
            totalCost,
            turns: message.num_turns,
            status: message.subtype,
            attempt,
          });

          if (message.subtype === "success") {
            attemptSuccess = true;
            display.success(`Phase "${phase.name}" complete`);
            display.cost(totalCost);
          } else {
            display.error(`Phase "${phase.name}" attempt ${attempt + 1} ended with: ${message.subtype}`);
            // Write error context for retry
            softieDir.writeContextFile(
              "errors.md",
              `# Errors\n\nPhase "${phase.name}" failed on attempt ${attempt + 1} with status: ${message.subtype}\nTimestamp: ${new Date().toISOString()}\n`
            );
          }
        }
      }

      if (attemptSuccess) {
        phaseSuccess = true;
        break;
      }
    }

    if (!phaseSuccess) {
      phase.status = "failed";
      softieDir.writePlan(plan);
      softieDir.updateMetadata({ status: "failed" });
      throw new Error(`Phase "${phase.name}" failed after ${MAX_PHASE_RETRIES + 1} attempts`);
    }

    // Mark phase complete
    phase.status = "completed";
    softieDir.writePlan(plan);
    softieDir.updateProgress({
      completedPhases: plan.phases.filter((p) => p.status === "completed").length,
      totalPhases: plan.phases.length,
      currentPhase: phase.id,
      totalCostUsd: totalCost,
    });
  }

  // Final milestone check-in if there's one
  const finalMilestone = plan.milestones.find(
    (m) => m.status === "pending"
  );
  if (finalMilestone) {
    await runMilestoneCheckIn(finalMilestone, softieDir, logger, wsHub);
    updateMilestoneStatus(softieDir, finalMilestone.id, "completed");
  }

  softieDir.updateMetadata({ status: "completed" });
  display.header("Project Complete");
  display.success("All phases executed successfully!");
  display.cost(totalCost);
}
