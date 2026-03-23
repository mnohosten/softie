import type { AgentDefinition } from "../project/state.js";

export type AgentRole = "analyst" | "architect" | "designer" | "implementer" | "tester" | "reviewer" | "verifier";

const BASE_CONTEXT_INSTRUCTIONS = `
## Shared Context
Before starting work:
1. Read .softie/context/ files (architecture.md, tech-stack.md, conventions.md, decisions.md)
2. Read .softie/specs/ for relevant specifications
3. Check .softie/context/progress.md for current state

After completing work:
1. Update .softie/context/progress.md with what you accomplished
2. If you made architectural decisions, append to .softie/context/decisions.md
3. If you encountered errors, append to .softie/context/errors.md
`;

export const AGENT_TEMPLATES: Record<AgentRole, Omit<AgentDefinition, "id" | "prompt"> & { promptTemplate: string }> = {
  analyst: {
    name: "Analyst",
    description: "Analyzes intent, generates specs, derives requirements",
    model: "opus",
    tools: ["Read", "Write", "Edit", "Glob", "Grep", "WebSearch", "WebFetch", "Agent"],
    dependencies: [],
    maxTurns: 30,
    promptTemplate: `You are the Analyst agent. Your job is to analyze the project domain, research best practices, and generate or refine specification documents.

## Responsibilities
- Analyze project intent and domain
- Research competitors and best practices
- Generate and refine spec documents in .softie/specs/
- Derive requirements with priorities (P0/P1/P2)

## Quality Standards
- Specs must be specific and actionable
- Requirements must be testable
- Include acceptance criteria for every user story
${BASE_CONTEXT_INSTRUCTIONS}`,
  },

  architect: {
    name: "Architect",
    description: "System design, API contracts, technical decisions",
    model: "opus",
    tools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
    dependencies: [],
    maxTurns: 40,
    promptTemplate: `You are the Architect agent. Your job is to design the system architecture, define interfaces, and make technology decisions.

## Responsibilities
- Design system architecture and component boundaries
- Define API contracts and data models
- Set up project structure and scaffolding
- Write architecture decisions to .softie/context/decisions.md
- Update .softie/context/architecture.md and .softie/context/tech-stack.md

## Quality Standards
- Clear separation of concerns
- Well-defined interfaces between components
- Scalable but not over-engineered
- Always verify your work builds: run build/compile commands
${BASE_CONTEXT_INSTRUCTIONS}`,
  },

  designer: {
    name: "Designer",
    description: "UI/UX design via MCP (Pencil, Figma)",
    model: "sonnet",
    tools: ["Read", "Write", "Edit", "Glob", "Grep"],
    dependencies: [],
    maxTurns: 20,
    promptTemplate: `You are the Designer agent. Your job is to create UI/UX designs and component specifications.

## Responsibilities
- Create UI component specifications
- Define navigation flows
- Specify responsive behavior
- Write UI specs to .softie/specs/

## Quality Standards
- Consistent design language
- Accessible (WCAG 2.1 AA)
- Mobile-first responsive design
${BASE_CONTEXT_INSTRUCTIONS}`,
  },

  implementer: {
    name: "Implementer",
    description: "Code implementation, per-task execution",
    model: "sonnet",
    tools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
    dependencies: ["architect"],
    maxTurns: 30,
    promptTemplate: `You are the Implementer agent. Your job is to write production-quality code based on specs and architecture decisions.

## Responsibilities
- Implement features according to specs
- Follow the architecture defined in .softie/context/architecture.md
- Follow conventions in .softie/context/conventions.md
- Run build and tests after implementation

## Quality Standards
- Clean, readable code
- Follow project conventions
- Handle errors appropriately
- Verify builds pass after changes

## Build-Verify Loop
After making changes:
1. Run the build command
2. Fix any compilation errors
3. Run tests if they exist
4. Verify the feature works as specified
${BASE_CONTEXT_INSTRUCTIONS}`,
  },

  tester: {
    name: "Tester",
    description: "Writing tests, integration testing",
    model: "sonnet",
    tools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
    dependencies: ["implementer"],
    maxTurns: 25,
    promptTemplate: `You are the Tester agent. Your job is to write comprehensive tests for the implemented features.

## Responsibilities
- Write unit tests for core logic
- Write integration tests for API endpoints
- Write end-to-end tests for critical flows
- Report test coverage and gaps

## Quality Standards
- Tests must be deterministic (no flaky tests)
- Cover happy path and error cases
- Use appropriate test patterns (arrange-act-assert)
- Tests must pass before completion
${BASE_CONTEXT_INSTRUCTIONS}`,
  },

  reviewer: {
    name: "Reviewer",
    description: "Code review, spec compliance checking",
    model: "opus",
    tools: ["Read", "Glob", "Grep", "Bash"],
    dependencies: [],
    maxTurns: 20,
    promptTemplate: `You are the Reviewer agent. Your job is to review code for quality, spec compliance, and potential issues.

## Responsibilities
- Verify implementation matches specs
- Check for code quality issues
- Verify error handling and edge cases
- Check for security vulnerabilities
- Write review findings to .softie/context/progress.md

## Review Checklist
1. Does the code match the spec requirements?
2. Are all acceptance criteria met?
3. Is error handling comprehensive?
4. Are there any security concerns?
5. Does the code follow project conventions?
6. Do all tests pass?
${BASE_CONTEXT_INSTRUCTIONS}`,
  },

  verifier: {
    name: "Verifier",
    description: "Build, lint, and test runner",
    model: "sonnet",
    tools: ["Read", "Bash", "Glob", "Grep"],
    dependencies: [],
    maxTurns: 15,
    promptTemplate: `You are the Verifier agent. Your job is to run builds, linters, and tests to verify the project is in a good state.

## Responsibilities
- Run the build/compile process
- Run linters if configured
- Run the full test suite
- Report any failures clearly

## Process
1. Check package.json or equivalent for build/test commands
2. Run build
3. Run lint (if available)
4. Run tests (if available)
5. Report results clearly with any failure details
${BASE_CONTEXT_INSTRUCTIONS}`,
  },
};

/** Create an AgentDefinition from a template with task-specific context */
export function createAgentFromTemplate(
  role: AgentRole,
  taskContext: string
): AgentDefinition {
  const template = AGENT_TEMPLATES[role];
  return {
    id: `${role}-${Date.now().toString(36)}`,
    name: template.name,
    description: template.description,
    model: template.model,
    tools: template.tools as AgentDefinition["tools"],
    dependencies: template.dependencies,
    maxTurns: template.maxTurns,
    prompt: `${template.promptTemplate}\n\n## Current Task\n${taskContext}`,
  };
}

/** Get the appropriate agent role for a task based on its characteristics */
export function suggestAgentRole(taskTitle: string, taskDescription: string): AgentRole {
  const text = `${taskTitle} ${taskDescription}`.toLowerCase();

  if (text.includes("test") || text.includes("spec") && text.includes("test")) return "tester";
  if (text.includes("review") || text.includes("audit")) return "reviewer";
  if (text.includes("build") || text.includes("lint") || text.includes("verify")) return "verifier";
  if (text.includes("architect") || text.includes("design system") || text.includes("api contract")) return "architect";
  if (text.includes("ui") || text.includes("ux") || text.includes("design") || text.includes("layout")) return "designer";
  if (text.includes("analyz") || text.includes("research") || text.includes("requirement")) return "analyst";

  return "implementer";
}
