import type { SoftieDir } from "../project/softie-dir.js";
import type { AgentDefinition, Team, PhasePlan } from "../project/state.js";
import * as display from "../utils/display.js";
import type { Logger } from "../utils/logger.js";

/**
 * Reads the meta-orchestrator's output from .softie/ and validates it.
 * The meta-orchestrator writes files directly via the Write tool,
 * so this module validates and indexes what was written.
 */
export async function validateAndIndexTeam(
  softieDir: SoftieDir,
  logger: Logger
): Promise<{ team: Team; agents: AgentDefinition[]; plan: PhasePlan }> {
  // Read what meta-orchestrator wrote
  const team = softieDir.getTeam();
  if (!team || team.agents.length === 0) {
    throw new Error(
      "Meta-orchestrator did not generate a team. Check .softie/team/team.json"
    );
  }

  const agents = softieDir.getAgentDefinitions();
  if (agents.length === 0) {
    throw new Error(
      "Meta-orchestrator did not generate agent definitions. Check .softie/team/agents/"
    );
  }

  // Validate all team members have agent definitions
  const agentIds = new Set(agents.map((a) => a.id));
  for (const member of team.agents) {
    if (!agentIds.has(member.id)) {
      throw new Error(
        `Team member "${member.id}" has no agent definition file`
      );
    }
  }

  const plan = softieDir.getPlan();
  if (!plan || plan.phases.length === 0) {
    throw new Error(
      "Meta-orchestrator did not generate a phase plan. Check .softie/plan/phases.json"
    );
  }

  logger.info("team-generator", "Team validated", {
    agentCount: agents.length,
    phaseCount: plan.phases.length,
    milestoneCount: plan.milestones.length,
  });

  display.teamDisplay(agents);
  display.info(`${plan.phases.length} phases, ${plan.milestones.length} milestones`);

  return { team, agents, plan };
}

/**
 * Convert AgentDefinition[] to the SDK agents format.
 */
export function toSdkAgents(
  agents: AgentDefinition[]
): Record<string, { description: string; prompt: string; tools: string[]; model: string; maxTurns?: number }> {
  const result: Record<
    string,
    { description: string; prompt: string; tools: string[]; model: string; maxTurns?: number }
  > = {};

  for (const agent of agents) {
    result[agent.id] = {
      description: agent.description,
      prompt: agent.prompt,
      tools: [...agent.tools],
      model: agent.model,
      maxTurns: agent.maxTurns,
    };
  }

  return result;
}
