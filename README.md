# Softie

Universal project orchestrator powered by [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk).

Softie takes a project intent (a brief describing what you want to build) and orchestrates a team of AI agents to plan, execute, and deliver the project through structured phases and milestones.

## Requirements

- Node.js >= 20
- [Claude Code](https://claude.com/claude-code) CLI installed and authenticated (uses your Claude subscription — no API key needed)

## Install

```bash
npm install
npm run build
```

## Usage

```bash
# Start a new project from a one-liner
softie "Build a REST API for a todo app"

# Start from a brief file
softie --file brief.md

# Pipe intent via stdin
cat brief.md | softie

# Resume a paused project
softie resume

# Check project status
softie status
```

## How it works

1. **Meta-orchestrator** analyzes your intent and generates a team of specialized agents with a phased execution plan.
2. **Milestone check-in** presents the proposed team and plan for your approval before execution begins.
3. **Project orchestrator** executes the plan phase-by-phase, coordinating agents and tracking progress.

All project state is stored in a `.softie/` directory within your working directory.

## License

MIT
