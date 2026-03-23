import { query } from "@anthropic-ai/claude-agent-sdk";
import type { SoftieDir } from "../project/softie-dir.js";
import type { Logger } from "../utils/logger.js";
import { SpecManager } from "./spec-manager.js";
import { eventBus } from "../core/event-bus.js";
import * as display from "../utils/display.js";
import type { SpecType } from "../project/state.js";

const ANALYSIS_AGENTS: Record<
  string,
  { description: string; prompt: string; tools: string[]; model: string; maxTurns?: number }
> = {
  "domain-researcher": {
    description: "Research specialist for understanding the project domain, market, competitors, and best practices.",
    prompt: `You are a Domain Research Specialist. Your job is to research a specific aspect of a project.

## Rules
- Be focused and practical. Research enough to make informed recommendations, then stop.
- Maximum 5 web searches and 5 URL fetches per task.
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
    description: "Analyze project intent and derive clear, structured requirements.",
    prompt: `You are a Requirements Analyst. Derive clear requirements from the project brief and any available research.

## Rules
- Read .softie/analysis/brief.md for the project intent
- Read any research files already in .softie/analysis/ if they exist
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
};

const SPEC_ORCHESTRATOR_PROMPT = `You are Softie's Spec Orchestrator. Your job is to analyze a project intent and generate comprehensive specification documents.

## Your Process

### Step 1: Parallel Analysis
Launch analysis subagents IN PARALLEL:
- **domain-researcher**: For market research, competitor analysis, best practices
- **requirements-analyst**: For deriving structured requirements from the intent

### Step 2: Generate Spec Documents
After analysis, generate specification documents as markdown files in .softie/specs/:

For software projects, generate AT MINIMUM:
1. **Product Spec** (product-*.md) — User stories, acceptance criteria, feature descriptions
2. **Technical Spec** (technical-*.md) — Architecture, data model, API design, technology choices

Optional (for complex projects):
3. **Architecture Spec** (architecture-*.md) — System design, component interactions, data flow
4. **API Spec** (api-*.md) — Endpoint definitions, request/response schemas
5. **UI Spec** (ui-*.md) — Screen descriptions, navigation flow, component hierarchy

### Step 3: Write Context Files
Write initial context files to .softie/context/:
- **architecture.md** — High-level system architecture
- **tech-stack.md** — Chosen technologies and rationale
- **conventions.md** — Coding conventions, naming patterns
- **decisions.md** — Architecture Decision Records
- **progress.md** — Initially empty
- **errors.md** — Initially empty

### Step 4: Update Spec Index
After writing all spec files, write .softie/specs/index.json with metadata for each spec:
\`\`\`json
[
  {
    "id": "<8-char-uuid>",
    "title": "Product Specification",
    "type": "product",
    "status": "draft",
    "sections": [],
    "filePath": "product-<id>.md",
    "linkedTaskIds": [],
    "createdAt": "<ISO timestamp>",
    "updatedAt": "<ISO timestamp>"
  }
]
\`\`\`

## Spec Document Format
Each spec document should be well-structured markdown with clear sections:
- Use ## headers for major sections
- Use bullet points for requirements and criteria
- Be specific and actionable — no vague hand-waving
- Include enough detail for a developer to implement without ambiguity

## Tool Guidelines
- Use **Agent tool** to delegate research to subagents
- Use Read/Write/Edit for .softie/ files
- You can use WebSearch/WebFetch for quick lookups
- Maximum 3 parallel agents at a time

## Important Rules
- Keep specs focused and practical — MVP first
- Each spec should be self-contained but can reference others
- All file paths are relative to the project working directory
`;

export async function runSpecOrchestrator(
  intent: string,
  softieDir: SoftieDir,
  logger: Logger,
  preferences?: string
): Promise<void> {
  display.header("Spec Generation");
  display.info("Analyzing intent and generating specifications...");

  softieDir.updateMetadata({ status: "analyzing" });
  logger.info("spec-orchestrator", "Starting spec generation", { intent });

  const specManager = new SpecManager(softieDir);
  let totalCost = 0;

  const preferencesBlock = preferences
    ? `\n\n## User Preferences\n${preferences}`
    : "";

  const ts = new Date().toISOString();
  eventBus.emit_event({ type: "project:status", status: "analyzing", timestamp: ts });

  for await (const message of query({
    prompt: `Analyze this project request and generate comprehensive specification documents:\n\n"${intent}"${preferencesBlock}\n\nThe .softie/ directory already exists with: analysis/, specs/, team/, plan/, state/, logs/, artifacts/, context/\n\nWrite spec documents to .softie/specs/ and context files to .softie/context/.${preferences ? "\n\nUser preferences are in .softie/context/preferences.md." : ""}`,
    options: {
      systemPrompt: SPEC_ORCHESTRATOR_PROMPT,
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
      agents: ANALYSIS_AGENTS,
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      model: "claude-opus-4-6",
      cwd: softieDir.projectDir,
      maxTurns: 30,
    },
  })) {
    if (message.type === "assistant") {
      for (const block of message.message.content) {
        if (block.type === "text" && block.text.trim()) {
          display.sdkMessage("spec-orchestrator", block.text);
          eventBus.emit_event({
            type: "sdk:text",
            agentName: "spec-orchestrator",
            text: block.text.slice(0, 500),
            timestamp: new Date().toISOString(),
          });
        }
        if (block.type === "tool_use") {
          const input = (typeof block.input === "object" && block.input !== null
            ? block.input
            : {}) as Record<string, unknown>;
          display.agent("Spec-Orchestrator", display.formatToolUse(block.name, input));
          eventBus.emit_event({
            type: "sdk:tool",
            agentName: "spec-orchestrator",
            toolName: block.name,
            summary: display.formatToolUse(block.name, input).slice(0, 200),
            timestamp: new Date().toISOString(),
          });
          logger.info("spec-orchestrator", `Tool: ${block.name}`, {
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
      logger.info("spec-orchestrator", "Spec generation complete", {
        cost: totalCost,
        turns: message.num_turns,
        status: message.subtype,
      });

      if (message.subtype !== "success") {
        display.error(`Spec orchestrator ended with status: ${message.subtype}`);
        throw new Error(`Spec orchestrator failed: ${message.subtype}`);
      }

      display.success("Spec generation complete");
      display.cost(totalCost);
    }
  }

  // Update progress and status
  softieDir.updateProgress({ totalCostUsd: totalCost });

  // Emit events for each generated spec
  const specs = specManager.list();
  for (const spec of specs) {
    eventBus.emit_event({
      type: "spec:created",
      specId: spec.id,
      title: spec.title,
      timestamp: new Date().toISOString(),
    });
  }

  // Transition to spec review
  softieDir.updateMetadata({ status: "spec-review" });
  eventBus.emit_event({ type: "project:status", status: "spec-review", timestamp: new Date().toISOString() });
}

/** Generate a single spec via AI chat conversation */
export async function generateSpec(
  softieDir: SoftieDir,
  logger: Logger,
  type: SpecType,
  prompt: string
): Promise<void> {
  const specManager = new SpecManager(softieDir);

  for await (const message of query({
    prompt: `Generate a ${type} specification document based on the following request:\n\n${prompt}\n\nRead the existing project context from .softie/context/ and any existing specs from .softie/specs/ for reference.\n\nWrite the spec to .softie/specs/${type}-spec.md and update .softie/specs/index.json to include it.`,
    options: {
      systemPrompt: `You are a spec writer. Generate a detailed, well-structured ${type} specification document in markdown. Read existing project context first. Be specific and actionable.`,
      allowedTools: ["Read", "Write", "Edit", "Glob", "Grep"],
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      model: "claude-opus-4-6",
      cwd: softieDir.projectDir,
      maxTurns: 15,
    },
  })) {
    if (message.type === "assistant") {
      for (const block of message.message.content) {
        if (block.type === "text" && block.text.trim()) {
          eventBus.emit_event({
            type: "sdk:text",
            agentName: "spec-writer",
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
            agentName: "spec-writer",
            toolName: block.name,
            summary: display.formatToolUse(block.name, input).slice(0, 200),
            timestamp: new Date().toISOString(),
          });
        }
      }
    }
    if (message.type === "result") {
      logger.info("spec-writer", `Generated ${type} spec`, {
        cost: message.total_cost_usd,
      });
    }
  }
}
