import { query } from "@anthropic-ai/claude-agent-sdk";
import type { SoftieDir } from "../project/softie-dir.js";
import type { Logger } from "../utils/logger.js";
import * as display from "../utils/display.js";

const META_ANALYSIS_AGENTS: Record<
  string,
  { description: string; prompt: string; tools: string[]; model: string; maxTurns?: number }
> = {
  "domain-researcher": {
    description:
      "Research specialist for understanding the project domain, market, competitors, and best practices. Use for ANY research task.",
    prompt: `You are a Domain Research Specialist. Your job is to research a specific aspect of a project.

## Rules
- Be focused and practical. Research enough to make informed recommendations, then stop.
- Maximum 5 web searches and 5 URL fetches per task. Pick the most valuable sources.
- If a URL is provided as inspiration, fetch it and analyze its structure, design patterns, and content.
- Focus on actionable insights, not exhaustive coverage.

## Output format
Write your findings as a clear markdown document to the file path specified in your task:
- Key findings (bullet points)
- Relevant patterns/features observed
- Concrete recommendations (max 5)`,
    tools: ["WebSearch", "WebFetch", "Read", "Write"],
    model: "sonnet",
    maxTurns: 15,
  },
  "requirements-analyst": {
    description:
      "Analyze project intent and derive clear, structured requirements. Use for requirements definition tasks.",
    prompt: `You are a Requirements Analyst. Derive clear requirements from the project brief and any available research.

## Rules
- Read .softie/analysis/brief.md for the project intent
- Read any research files already in .softie/analysis/ if they exist
- Work primarily with the project brief and any available research
- Be concise and practical

## Output format
Write a structured requirements.md to the file path specified in your task:
- Functional requirements (numbered, P0/P1/P2 priority)
- Non-functional requirements
- Constraints`,
    tools: ["Read", "Write", "WebSearch"],
    model: "sonnet",
    maxTurns: 8,
  },
  "scope-definer": {
    description:
      "Define project scope boundaries - what's in and out. Use for scope definition tasks.",
    prompt: `You are a Scope Definition Specialist. Define clear project boundaries.

## Rules
- Read .softie/analysis/brief.md and requirements if available
- Be decisive - keep MVP scope small and achievable

## Output format
Write a scope.md to the file path specified in your task:
- In scope (specific deliverables, max 10 items)
- Out of scope (explicitly excluded)
- Key assumptions`,
    tools: ["Read", "Write"],
    model: "sonnet",
    maxTurns: 8,
  },
};

const META_ORCHESTRATOR_PROMPT = `You are Softie's Meta-Orchestrator. Your job is to analyze a project request and create an expert team to execute it.

You are NOT limited to software projects. You handle ANY type of project: SaaS applications, books, marketing campaigns, business plans, research papers, design systems, etc.

## Your Process

### Step 1: Parallel Analysis
You have analysis subagents available. **MAXIMIZE PARALLELISM** by launching multiple agents simultaneously:

- **domain-researcher**: For market research, competitor analysis, inspiration site analysis
- **requirements-analyst**: For deriving structured requirements from the intent
- **scope-definer**: For defining what's in/out of scope

Launch these agents IN PARALLEL (multiple Agent calls in a single response) whenever their inputs don't depend on each other. For example:
- domain-researcher and an initial requirements draft can run simultaneously
- scope-definer should wait for requirements to be available

You can also launch the SAME agent type multiple times for different research aspects. For example, launch 3 domain-researcher agents in parallel:
- One to research the inspiration URL
- One to research competitor products
- One to research technology best practices

### Step 2: Write Context Files (CRITICAL for software projects)
After analysis, write initial context files to .softie/context/ that will be shared with ALL agents during execution:

- **architecture.md** — High-level system architecture, components, data flow, API boundaries
- **tech-stack.md** — Chosen technologies, versions, and rationale
- **conventions.md** — Coding conventions, naming patterns, file structure conventions
- **progress.md** — Initially empty, updated during execution
- **decisions.md** — Architecture Decision Records (append-only log)
- **errors.md** — Initially empty, tracks known issues during execution

These files are the SHARED MEMORY of the project. Every agent reads them before working and updates them after completing work.

### Step 3: Design the Expert Team
After analysis is complete, design the optimal expert team based on findings.

Determine:
   - What expert roles are needed
   - What each role's responsibilities are
   - What tools each role needs
   - What model tier each role should use (opus for critical thinking, sonnet for execution, haiku for simple tasks)
   - Dependencies between roles
   - maxTurns for each agent (default 30, increase for complex roles)

#### Software Project — Mandatory Agents
For ANY software project, you MUST include these agents:

1. **architect** (model: opus, maxTurns: 40) — ALWAYS the first agent in the first implementation phase. Designs system architecture, defines interfaces/contracts, sets up project structure. Writes to .softie/context/architecture.md and .softie/context/tech-stack.md. Must have tools: Read, Write, Edit, Bash, Glob, Grep.

2. **verifier** (model: sonnet, maxTurns: 20) — Runs build, tests, and lint. Reports problems back. Used by the orchestrator after implementation phases for integration verification. Must have tools: Read, Bash, Glob, Grep.

3. **Implementation agents** — All implementation agents (frontend-dev, backend-dev, etc.) MUST have the Bash tool so they can verify their own work (run build, run tests).

#### Non-Software Project — Template
- Research & Strategy → Content Creation → Review & Refinement → Final Assembly

### Step 4: Write Team Definitions
For each agent, write a markdown file to .softie/team/agents/<role-id>.md with this EXACT format:

\`\`\`
---
id: <kebab-case-id>
name: <Human Readable Role Name>
description: <One line description of when to use this agent>
model: <opus|sonnet|haiku>
maxTurns: <number, default 30>
tools:
  - Read
  - Write
  - <other tools as needed>
dependencies:
  - <agent-id that must complete work first>
---

<Detailed system prompt for the agent including:
- Expertise areas
- Responsibilities
- Quality standards
- Project-specific context
- IMPORTANT: Instructions to read .softie/context/ files before starting work
- IMPORTANT: Instructions to update relevant context files after completing work>
\`\`\`

### Step 5: Write Team Index
Write .softie/team/team.json with:
\`\`\`json
{
  "agents": [
    { "id": "agent-id", "name": "Agent Name", "description": "...", "dependsOn": ["other-agent-id"] }
  ]
}
\`\`\`

### Step 6: Define Project Phases
Write .softie/plan/phases.json with:
\`\`\`json
{
  "phases": [
    {
      "id": "phase-1",
      "name": "Phase Name",
      "description": "What happens in this phase",
      "agents": ["agent-id-1", "agent-id-2"],
      "milestone": "m1",
      "status": "pending",
      "order": 1
    }
  ],
  "milestones": [
    {
      "id": "m0",
      "name": "Milestone Name",
      "description": "What investor reviews",
      "deliverables": ["List of concrete deliverables"],
      "status": "pending"
    }
  ]
}
\`\`\`

#### Software Project — Phase Template
For software projects, use this phase structure:
- **Phase 1: Architecture & Setup** — architect agent designs system, sets up project structure, writes contracts/interfaces
- **Phase 2: Core Implementation** — implementation agents build core functionality (depends on architecture)
- **Phase 3: UI/Frontend** — frontend agents build UI (if applicable, depends on core)
- **Phase 4: Testing & Integration** — verifier + testing agents run full test suite, fix integration issues
- **Phase 5: Polish & Documentation** — final cleanup, documentation, deployment setup

Adjust based on project complexity — small projects may combine phases 2-3.

## Tool Guidelines
- Use the **Agent tool** to delegate research to your subagents (domain-researcher, requirements-analyst, scope-definer)
- Use Read/Write/Edit for .softie/ files directly (team definitions, plan, context files)
- You can use WebSearch/WebFetch for quick lookups, but prefer delegating deeper research to domain-researcher
- Use Bash sparingly

## Parallelism Strategy
- Launch independent analysis tasks in parallel using multiple Agent calls in one response
- Maximum 3 parallel agents at a time
- Do NOT launch more than 2 domain-researcher agents - one for the inspiration/URL and one for general best practices is enough
- Wait for analysis results before writing team definitions

## Convergence
- After analysis agents return their results, proceed to writing context files, then team definitions. Do not start new research rounds.
- If research agents returned partial results, work with what you have - perfect is the enemy of good.

## Important Rules
- Create 3-8 agents depending on project complexity. Don't over-engineer small projects.
- Every agent MUST have a detailed, actionable system prompt that includes instructions to read/update .softie/context/ files.
- The first milestone (m0) is ALWAYS "Analysis & Team Review" where the investor approves the team.
- Use "sonnet" model for most agents. Reserve "opus" for roles requiring deep reasoning (architect, strategist, lead).
- Keep the number of phases reasonable (3-6 for most projects).
- All file paths are relative to the project working directory.
- For software projects: every implementation agent's prompt MUST include the build-verify-test loop instructions.
`;

export async function runMetaOrchestrator(
  intent: string,
  softieDir: SoftieDir,
  logger: Logger,
  preferences?: string
): Promise<void> {
  display.header("Phase 0: Meta-Analysis");
  display.info("Analyzing project intent and designing expert team...");
  display.info(`Intent: "${intent.slice(0, 120)}${intent.length > 120 ? "..." : ""}"`);

  softieDir.updateMetadata({ status: "analyzing" });
  logger.info("meta-orchestrator", "Starting meta-analysis", { intent });

  let totalCost = 0;

  const preferencesBlock = preferences
    ? `\n\n## User Preferences (from softie.config)\nThe user has specified the following preferences. RESPECT these when choosing technologies, frameworks, conventions, and tools:\n\n${preferences}`
    : "";

  for await (const message of query({
    prompt: `Analyze this project request and create a complete expert team:\n\n"${intent}"${preferencesBlock}\n\nWrite all team definitions, phase plan, context files, and analysis documents to the .softie/ directory. The .softie/ directory structure already exists with these subdirectories: analysis/, team/agents/, plan/, state/, logs/, artifacts/, context/\n\nIMPORTANT: Write initial context files to .softie/context/ (architecture.md, tech-stack.md, conventions.md, progress.md, decisions.md, errors.md) based on your analysis. These will be shared with all agents during execution.${preferences ? "\n\nIMPORTANT: The user's preferences are already saved in .softie/context/preferences.md. Read them and incorporate into tech-stack.md and conventions.md." : ""}`,
    options: {
      systemPrompt: META_ORCHESTRATOR_PROMPT,
      allowedTools: [
        "Read",
        "Write",
        "Edit",
        "Glob",
        "Grep",
        "WebSearch",
        "WebFetch",
        "Agent",
        "TaskOutput",
        "TaskStop",
      ],
      agents: META_ANALYSIS_AGENTS,
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      model: "claude-opus-4-6",
      cwd: softieDir.projectDir,
      maxTurns: 30,
    },
  })) {
    if (message.type === "assistant") {
      // Detect parallel agent launches
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

      for (const block of message.message.content) {
        if (block.type === "text" && block.text.trim()) {
          display.sdkMessage("meta", block.text);
        }
        if (block.type === "tool_use") {
          const input = (typeof block.input === "object" && block.input !== null
            ? block.input
            : {}) as Record<string, unknown>;
          display.agent(
            "Meta-Orchestrator",
            display.formatToolUse(block.name, input)
          );
          logger.info("meta-orchestrator", `Tool: ${block.name}`, {
            input: JSON.stringify(input).slice(0, 200),
          });
        }
      }
    }

    if (message.type === "system" && message.subtype === "init") {
      softieDir.saveSessionId(message.session_id);
    }

    if (message.type === "result") {
      totalCost = message.total_cost_usd;
      softieDir.saveSessionId(message.session_id);
      logger.info("meta-orchestrator", "Meta-analysis complete", {
        cost: totalCost,
        turns: message.num_turns,
        status: message.subtype,
      });

      if (message.subtype !== "success") {
        display.error(
          `Meta-orchestrator ended with status: ${message.subtype}`
        );
        throw new Error(`Meta-orchestrator failed: ${message.subtype}`);
      }

      display.success("Meta-analysis complete");
      display.cost(totalCost);
    }
  }

  softieDir.updateProgress({ totalCostUsd: totalCost });
  softieDir.updateMetadata({ status: "team-review" });
}
